import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";
import { loadCexSankey } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fM = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + "k" : Math.round(n).toString());
const GREEN = "#34d399", TEAL = "#5eead4", RED = "#fb7185";

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

const openWallet = a => a && window.open(`https://etherscan.io/address/${a}`, "_blank", "noopener");

function SankeyNode({ x, y, width, height, payload }) {
  const k = payload.kind;
  const fill = k === "venue" ? TEAL : k.startsWith("source") ? GREEN : RED;
  const wallet = !!payload.a;
  // Only VENUES are labelled — a label on every one of the dozens of leaf wallets is unreadable.
  // The wallet identity comes from the hover tooltip; a click opens it on Etherscan.
  return (
    <Layer style={{ cursor: wallet ? "pointer" : "default" }} onClick={() => wallet && openWallet(payload.a)}>
      <Rectangle x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.92} radius={2} />
      {k === "venue" && (
        <text x={x + width + 8} y={y + height / 2} textAnchor="start" dominantBaseline="middle"
          fontFamily={MONO} fontSize={13} fill="#eafff7" fontWeight={700}>{payload.name}</text>
      )}
    </Layer>
  );
}

function SankeyLink(props) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const [hover, setHover] = useState(false);
  const col = payload.dir === "in" ? GREEN : RED;
  return (
    <path d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={col} strokeWidth={Math.max(1, linkWidth)} strokeOpacity={hover ? 0.7 : 0.34}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ cursor: "pointer" }} />
  );
}

export default function CexSankeyChart({ isMobile }) {
  const [data, setData] = useState(undefined);
  useEffect(() => { let c = false; loadCexSankey().then(d => { if (!c) setData(d || null); }); return () => { c = true; }; }, []);

  const sankey = useMemo(() => (data ? toSankey(data) : null), [data]);

  if (data === undefined) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading exchange flow…</div>;
  if (!data || !sankey || sankey.links.length < 2) return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where's the volume going — onto exchanges, or off?" accent={TEAL}>
        A flow map of every wallet <strong style={{ color: GREEN }}>supplying</strong> exchanges and <strong style={{ color: RED }}>withdrawing</strong> from them, per venue.
      </Explain>
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 50 }}>Being reconstructed — appears after the next on-chain refresh.</div>
    </div>
  );

  const { totals, window: win } = data;
  const H = Math.max(360, Math.min(sankey.nodes.length, 40) * (isMobile ? 20 : 24) + 60);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where's the volume going — onto exchanges, or off?" accent={TEAL}>
        Every wallet <strong style={{ color: GREEN }}>supplying</strong> exchanges (left) and <strong style={{ color: RED }}>withdrawing</strong> from them (right), over the last {win?.days ?? 90} days. Flow band = amount; the exchanges are the stick in the middle. Tap a wallet to open it on Etherscan. Flows under {fM(win?.dust ?? 25000)} SPX are rolled into a "smaller" band, never hidden.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="onto exchanges" value={fM(totals.in)} color={GREEN} sub="supply in" />
        <Metric label="off exchanges" value={fM(totals.out)} color={RED} sub="withdrawn" />
        <Metric label="net" value={(totals.net >= 0 ? "+" : "−") + fM(Math.abs(totals.net))} color={totals.net >= 0 ? GREEN : RED} sub={totals.net >= 0 ? "accumulating on venues" : "leaving to self-custody"} />
      </div>

      <ResponsiveContainer width="100%" height={H}>
        <Sankey data={sankey} nodePadding={isMobile ? 12 : 22} nodeWidth={13} iterations={64}
          margin={{ left: isMobile ? 4 : 8, right: isMobile ? 4 : 8, top: 12, bottom: 12 }}
          node={<SankeyNode />} link={<SankeyLink />}>
          <Tooltip
            contentStyle={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: "#e2e8f0" }}
            formatter={(v, _n, p) => {
              const pl = p?.payload?.payload;
              if (pl?.dir) return [`${fM(pl.value)} SPX ${pl.dir === "in" ? "onto exchange" : "off exchange"}`, ""];
              if (pl?.a) return [`${short(pl.a)} — tap to open ↗`, ""];
              if (pl?.kind === "venue") return [pl.name, ""];
              return [fM(v) + " SPX", ""];
            }} />
        </Sankey>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 10, textAlign: "center", lineHeight: 1.6, maxWidth: 720, marginInline: "auto" }}>
        Exchange hot wallets from our tagged set (Kraken, Bybit, Coinbase, …), aggregated by venue. A flow onto an exchange can be sold, but doesn't have to be — a read on where supply is moving, not a forecast. Reproducible from the public transfer log.
      </div>
    </div>
  );
}
