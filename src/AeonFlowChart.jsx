import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine, LabelList } from "recharts";
import { loadAeonSales, loadAeon } from "./history-data.js";
import { aeonFlow } from "./aeon-flow.js";
import { SANS, MONO, MAX_W, Metric, Explain, ViewTabs, TypeTab } from "./chart-ui.jsx";

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const GREEN = "#34d399", RED = "#fb7185";

// A Zerion-style wallet card for the hover tooltip — the recharts default rendered a dark label on
// a dark card (illegible in both themes). This is self-contained with explicit colours, so it reads
// on any background, and carries the Zerion preview like the city's wallet card. Click the bar to open.
function FlowTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const e = payload[0]?.payload;
  if (!e?.a) return null;
  const col = e.net > 0 ? GREEN : RED, dir = e.net > 0 ? "accumulated" : "distributed";
  return (
    <div style={{ width: 224, background: "#0a0e1c", border: "1px solid #1e2a44", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 34px rgba(0,0,0,0.6)", fontFamily: MONO }}>
      <img src={`https://render.zerion.io/preview?address=${e.a}`} alt="" onError={ev => { ev.currentTarget.style.display = "none"; }}
        style={{ display: "block", width: "100%", height: 92, objectFit: "cover", background: "#0e1424" }} />
      <div style={{ padding: "9px 12px 11px" }}>
        <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{short(e.a)}{e.exited ? "  ⊗ exited" : ""}</div>
        <div style={{ color: col, fontSize: 13, fontWeight: 700, marginTop: 4 }}>{e.net > 0 ? "+" : ""}{e.net} AEON {dir}</div>
        <div style={{ color: "#94a3b8", fontSize: 11.5, marginTop: 3 }}>bought {e.bought} · sold {e.sold}{e.exited ? " · now holds 0" : e.held != null ? ` · holds ${e.held}` : ""}</div>
        <div style={{ color: "#5eead4", fontSize: 11, marginTop: 7 }}>click the bar → open on Zerion ↗</div>
      </div>
    </div>
  );
}

// Project Aeon — accumulation vs distribution. A tornado of the biggest net buyers (green, right) and
// net sellers (red, left) over a trailing window, from the same marketplace trades the city arcs draw.
export default function AeonFlowChart({ isMobile, initialView }) {
  const [sales, setSales] = useState(null);
  const [onchain, setOnchain] = useState(null);
  const [days, setDays] = useState(() => (initialView === "7d" ? 7 : 30));
  const [showExited, setShowExited] = useState(true);

  useEffect(() => {
    let c = false;
    loadAeonSales().then(d => { if (!c) setSales(d || { empty: true }); });
    loadAeon().then(d => { if (!c) setOnchain(d || null); });
    return () => { c = true; };
  }, []);

  const flow = useMemo(() => {
    const trades = sales && !sales.empty ? sales.trades : null;
    if (!trades) return null;
    return aeonFlow(trades, onchain?.holders, { days, topN: isMobile ? 7 : 10, includeExited: showExited });
  }, [sales, onchain, days, showExited, isMobile]);

  if (!sales) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading flow…</div>;
  if (sales.empty || !sales.trades?.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Marketplace-trade data is being reconstructed.</div>;

  // Accumulators on top (biggest buyer first), distributors below (biggest seller at the bottom), so
  // the frame reads as a tornado around a zero line: the money coming in above, going out below.
  const rows = flow ? [
    ...flow.accum,
    ...flow.distrib.slice().sort((a, b) => b.net - a.net),   // closest-to-zero first → biggest seller lands at the bottom
  ].map(e => ({ ...e, label: short(e.a) + (e.exited ? " ⊗" : "") })) : [];
  const max = Math.max(1, ...rows.map(r => Math.abs(r.net)));
  const open = a => window.open(`https://app.zerion.io/${a}/overview`, "_blank", "noopener");

  const TABS = [["30d", "Last 30 days"], ["7d", "Last 7 days"]];

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who's buying AEON, and who's selling?" accent={GREEN}>
        Each wallet&apos;s <strong style={{ color: GREEN }}>net marketplace trades</strong> over the window — bought minus sold.
        <strong style={{ color: GREEN }}> Accumulating</strong> above the line, <strong style={{ color: RED }}>distributing</strong> below.
        It&apos;s <strong style={{ color: "#e2e8f0" }}>net</strong>, so a wallet that bought 5 and sold 3 counts as +2. Mints and free transfers are excluded — this is who&apos;s paying to accumulate. Tap a bar to open the wallet.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="net buyers" value={flow?.totals.buyers ?? 0} color={GREEN} />
        <Metric label="net sellers" value={flow?.totals.sellers ?? 0} color={RED} />
        <Metric label="fully exited" value={flow?.totals.exited ?? 0} color="#f59e0b" sub="sold to zero" />
      </div>

      <ViewTabs tabs={TABS} value={days === 7 ? "7d" : "30d"} onChange={v => setDays(v === "7d" ? 7 : 30)} />

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <TypeTab label={showExited ? "Hiding nothing — exited shown (⊗)" : "Only wallets still holding"} on={showExited} onClick={() => setShowExited(v => !v)} />
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>No marketplace trades in this window.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, rows.length * (isMobile ? 26 : 30) + 40)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: isMobile ? 2 : 6 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" domain={[-max - 0.6, max + 0.6]} tickFormatter={v => (v > 0 ? "+" : "") + Math.round(v)}
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="category" dataKey="label" width={isMobile ? 96 : 112}
              tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.35)" />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)" }} wrapperStyle={{ zIndex: 50, outline: "none" }} content={<FlowTip />} />
            <Bar dataKey="net" radius={[2, 2, 2, 2]} isAnimationActive={false} cursor="pointer" onClick={(d) => d?.a && open(d.a)}>
              {rows.map(r => (
                <Cell key={r.a} fill={r.net > 0 ? GREEN : RED} fillOpacity={r.exited ? 0.42 : 0.9}
                  stroke={r.exited ? RED : "none"} strokeDasharray={r.exited ? "3 3" : undefined} />
              ))}
              <LabelList dataKey="net" position="right" formatter={v => (v > 0 ? "+" + v : v)}
                style={{ fill: "#cbd5e1", fontFamily: MONO, fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 10, textAlign: "center", lineHeight: 1.6, maxWidth: 720, marginInline: "auto" }}>
        Net of marketplace trades over the last {flow?.window ?? days} days{flow?.asOf ? ` (to ${flow.asOf})` : ""}. ⊗ marks a wallet that sold down to zero and left the collection.
        Reproducible from the public sale log — every bar links to the wallet.
      </div>
    </div>
  );
}
