import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";
import { loadCexSankey } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fM = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + "k" : Math.round(n).toString());
// Sentiment-honest colours: coins moving ONTO exchanges are sell-side supply building — NOT a
// positive — so inflow is NEUTRAL slate, never green. Coins leaving to self-custody (outflow) is
// the genuinely constructive direction → green. A net build-up on venues reads amber (caution).
const NEUTRAL = "#94a3b8", GREEN = "#34d399", TEAL = "#5eead4", AMBER = "#fbbf24";

// Build recharts {nodes, links} from cex-sankey.json: sources (left) → venues (centre stick) → dests
// (right). Depth 0/1/2 puts them in three columns automatically.
function toSankey(data) {
  const nodes = [], idx = new Map();
  const add = (key, node) => { if (!idx.has(key)) { idx.set(key, nodes.length); nodes.push(node); } return idx.get(key); };
  const links = [];
  const venues = [...new Set([...(data.inflow || []).map(v => v.venue), ...(data.outflow || []).map(v => v.venue)])];
  for (const v of venues) add("v:" + v, { name: v, kind: "venue" });
  for (const v of data.inflow || []) {
    const vi = idx.get("v:" + v.venue);
    for (const s of v.top) links.push({ source: add("s:" + s.a, { name: short(s.a), kind: "source", a: s.a }), target: vi, value: s.amt, dir: "in" });
    if (v.more?.amt > 0) links.push({ source: add("sm:" + v.venue, { name: `${v.more.n} smaller`, kind: "sourceMore" }), target: vi, value: v.more.amt, dir: "in" });
  }
  for (const v of data.outflow || []) {
    const vi = idx.get("v:" + v.venue);
    for (const d of v.top) links.push({ source: vi, target: add("d:" + d.a, { name: short(d.a), kind: "dest", a: d.a }), value: d.amt, dir: "out" });
    if (v.more?.amt > 0) links.push({ source: vi, target: add("dm:" + v.venue, { name: `${v.more.n} smaller`, kind: "destMore" }), value: v.more.amt, dir: "out" });
  }
  return { nodes, links };
}

const openWallet = a => a && window.open(`https://app.zerion.io/${a}/overview`, "_blank", "noopener");

function SankeyNode({ x, y, width, height, payload, isMobile }) {
  const k = payload.kind;
  const fill = k === "venue" ? TEAL : k.startsWith("source") ? NEUTRAL : GREEN;
  const wallet = !!payload.a;
  // Only VENUES are labelled — a label on every one of the dozens of leaf wallets is unreadable.
  // The wallet identity comes from the hover/tap card; a click opens it on Zerion. The venue label
  // rides a dark chip so it stays legible over the flows AND on the light theme (plain light text
  // vanished on the bright background).
  const fs = isMobile ? 11.5 : 13;
  const cw = (payload.name?.length || 0) * fs * 0.62 + 14;
  return (
    <Layer style={{ cursor: wallet ? "pointer" : "default" }} onClick={() => wallet && openWallet(payload.a)}>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.92} radius={2} />
      {k === "venue" && (
        <g>
          <rect x={x + width + 5} y={y + height / 2 - fs} width={cw} height={fs * 2} rx={5}
            fill="#0a0e1c" fillOpacity={0.9} stroke="#284056" strokeWidth={1} />
          <text x={x + width + 5 + cw / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle"
            fontFamily={MONO} fontSize={fs} fill="#eafff7" fontWeight={700}>{payload.name}</text>
        </g>
      )}
    </Layer>
  );
}

// Zerion-style hover/tap card for a wallet node (matches the city + AEON-flow cards), a compact chip
// for a flow band or a venue. Self-contained colours so it reads on either theme.
function SankeyTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const pl = payload[0]?.payload?.payload || payload[0]?.payload;
  if (!pl) return null;
  const chip = txt => (
    <div style={{ background: "#0a0e1c", border: "1px solid #1e2a44", borderRadius: 8, padding: "7px 11px", fontFamily: MONO, fontSize: 12, color: "#e2e8f0", boxShadow: "0 8px 22px rgba(0,0,0,.5)" }}>{txt}</div>
  );
  if (pl.dir) return chip(`${fM(pl.value)} SPX ${pl.dir === "in" ? "onto exchange" : "off exchange"}`);
  if (pl.kind === "venue") return chip(`${pl.name}${pl.value ? ` · ${fM(pl.value)} SPX through` : ""}`);
  if (!pl.a) return chip(pl.name || "");     // the "+N smaller" roll-up bands
  const supplying = String(pl.kind).startsWith("source");
  return (
    <div style={{ width: 224, background: "#0a0e1c", border: "1px solid #1e2a44", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 34px rgba(0,0,0,.6)", fontFamily: MONO }}>
      <img src={`https://render.zerion.io/preview?address=${pl.a}`} alt="" onError={e => { e.currentTarget.style.display = "none"; }}
        style={{ display: "block", width: "100%", height: 92, objectFit: "cover", background: "#0e1424" }} />
      <div style={{ padding: "9px 12px 11px" }}>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{short(pl.a)}</div>
        <div style={{ color: supplying ? NEUTRAL : GREEN, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
          {supplying ? "Supplies exchanges" : "Withdraws from exchanges"}{pl.value ? ` · ${fM(pl.value)} SPX` : ""}
        </div>
        <div style={{ color: "#5eead4", fontSize: 11, marginTop: 7 }}>tap → open on Zerion ↗</div>
      </div>
    </div>
  );
}

function SankeyLink(props) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const [hover, setHover] = useState(false);
  const col = payload.dir === "in" ? NEUTRAL : GREEN;
  return (
    <path d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={col} strokeWidth={Math.max(1, linkWidth)} strokeOpacity={hover ? 0.7 : 0.34}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ cursor: "pointer" }} />
  );
}

const WIN_LBL = { 90: "90 days", 30: "30 days", 7: "7 days" };
export default function CexSankeyChart({ isMobile }) {
  const [data, setData] = useState(undefined);
  const [flowWin, setFlowWin] = useState(90);   // flow window: 90 / 30 / 7 days (byWindow)
  useEffect(() => { let c = false; loadCexSankey().then(d => { if (!c) setData(d || null); }); return () => { c = true; }; }, []);

  // windows the data offers (byWindow); the selected slice, falling back to the flat 90-day fields.
  const wins = data?.windows?.length ? data.windows : (data?.byWindow ? Object.keys(data.byWindow).map(Number) : null);
  const active = useMemo(() => (data?.byWindow?.[flowWin] || data), [data, flowWin]);
  const sankey = useMemo(() => (active ? toSankey(active) : null), [active]);

  if (data === undefined) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading exchange flow…</div>;
  if (!data || !sankey || sankey.links.length < 2) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where's the volume going — onto exchanges, or off?" accent={TEAL}>
        A flow map of every wallet <strong style={{ color: NEUTRAL }}>supplying</strong> exchanges and <strong style={{ color: GREEN }}>withdrawing</strong> from them, per venue.
      </Explain>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 50 }}>Being reconstructed — appears after the next on-chain refresh.</div>
    </div>
  );

  const { totals, window: win } = active;
  const H = Math.max(360, Math.min(sankey.nodes.length, 40) * (isMobile ? 20 : 24) + 60);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where's the volume going — onto exchanges, or off?" accent={TEAL}>
        Every wallet <strong style={{ color: NEUTRAL }}>supplying</strong> exchanges (left) and <strong style={{ color: GREEN }}>withdrawing</strong> from them (right), over the last {win?.days ?? flowWin} days. Flow band = amount; the exchanges are the stick in the middle. Tap a wallet to open it on Zerion. Flows under {fM(win?.dust ?? 25000)} SPX are rolled into a "smaller" band, never hidden.
      </Explain>

      {wins && wins.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 12, fontFamily: MONO }}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>flow over</span>
          <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
            {wins.map((w, i) => (
              <button key={w} onClick={() => setFlowWin(w)} style={{
                padding: "6px 13px", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, border: "none",
                borderLeft: i ? "1px solid rgba(255,255,255,0.12)" : "none",
                background: flowWin === w ? "rgba(94,234,212,0.16)" : "transparent", color: flowWin === w ? "#5eead4" : "#94a3b8",
              }}>{WIN_LBL[w] || w + "d"}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="onto exchanges" value={fM(totals.in)} color={NEUTRAL} sub="supply in" />
        <Metric label="off exchanges" value={fM(totals.out)} color={GREEN} sub="to self-custody" />
        <Metric label="net" value={(totals.net >= 0 ? "+" : "−") + fM(Math.abs(totals.net))} color={totals.net >= 0 ? AMBER : GREEN} sub={totals.net >= 0 ? "building on venues" : "leaving to self-custody"} />
      </div>

      <ResponsiveContainer width="100%" height={H}>
        <Sankey data={sankey} nodePadding={isMobile ? 12 : 22} nodeWidth={13} iterations={64}
          margin={{ left: isMobile ? 4 : 8, right: isMobile ? 4 : 8, top: 12, bottom: 12 }}
          node={<SankeyNode isMobile={isMobile} />} link={<SankeyLink />}>
          <Tooltip wrapperStyle={{ zIndex: 50, outline: "none" }} content={<SankeyTip />} />
        </Sankey>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 10, textAlign: "center", lineHeight: 1.6, maxWidth: 720, marginInline: "auto" }}>
        Exchange hot wallets from our tagged set (Kraken, Bybit, Coinbase, …), aggregated by venue. A flow onto an exchange can be sold, but doesn't have to be — a read on where supply is moving, not a forecast. Reproducible from the public transfer log.
      </div>
    </div>
  );
}
