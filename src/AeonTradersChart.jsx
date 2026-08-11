import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { loadAeonTraders } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, Explain } from "./chart-ui.jsx";

const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fE = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "Ξ";

// Project Aeon — trader intelligence. Every wallet's realized P&L from matching its
// buys to its sells across the whole sale log. Winners, paper hands, and the flippers.
export default function AeonTradersChart({ isMobile, initialView }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => ["top", "bottom", "byVolume"].includes(initialView) ? initialView : "top");
  useEffect(() => { let c = false; loadAeonTraders().then(d => { if (!c) setData(d || { empty: true }); }); return () => { c = true; }; }, []);

  if (!data) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading traders…</div>;
  if (data.empty) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Trader data is being reconstructed.</div>;

  const rows = view === "top" ? data.top : view === "bottom" ? data.bottom : data.byVolume;
  const chartData = (view === "byVolume" ? data.byVolume : rows).slice(0, 16).map(t => ({ ...t, label: short(t.a) }));
  const netTop = data.top[0];

  const TABS = [["top", "Top winners"], ["bottom", "Biggest losses"], ["byVolume", "By volume"]];
  const tbtn = a => ({ padding: "6px 14px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer", border: "1px solid " + (a ? "rgba(45,212,191,0.5)" : "rgba(255,255,255,0.12)"), background: a ? "rgba(45,212,191,0.16)" : "transparent", color: a ? "#5eead4" : "#94a3b8" });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who's actually made money trading AEON?" accent="#34d399">
        Every wallet&apos;s <strong style={{ color: "#e2e8f0" }}>realized profit</strong> — reconstructed by matching each token&apos;s <strong style={{ color: "#34d399" }}>buy</strong> to its later <strong style={{ color: "#fb7185" }}>sell</strong> across all {data.totalSales.toLocaleString()} sales.
        Mint cost and free transfers are unknown so they&apos;re excluded — this is <strong style={{ color: "#e2e8f0" }}>trading</strong> P&amp;L, not total return.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Metric label="traders" value={data.traders.toLocaleString()} color="#2dd4bf" />
        <Metric label="top trader" value={fE(netTop.realized)} color="#34d399" sub={`${netTop.trades} trades`} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => <button key={k} style={tbtn(view === k)} onClick={() => setView(k)}>{l}</button>)}
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: isMobile ? 4 : 8 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" tickFormatter={v => (view === "byVolume" ? v.toFixed(0) + "Ξ" : fE(v))} tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={isMobile ? 92 : 110} tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0a0e1c", border: "1px solid #234", borderRadius: 8, fontFamily: MONO, fontSize: 12 }}
            formatter={(v, n, p) => view === "byVolume" ? [(p.payload.boughtVol + p.payload.soldVol).toFixed(1) + "Ξ traded", short(p.payload.a)] : [fE(p.payload.realized) + " realized", short(p.payload.a)]} labelFormatter={() => ""} />
          <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" />
          <Bar dataKey={view === "byVolume" ? "boughtVol" : "realized"} isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {chartData.map((t, i) => <Cell key={i} fill={view === "byVolume" ? "#38bdf8" : (t.realized >= 0 ? "#34d399" : "#fb7185")} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: isMobile ? 11.5 : 13 }}>
          <thead><tr style={{ color: "#64748b", fontFamily: SANS, fontSize: 12, textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Wallet</th><th style={{ padding: "6px 8px" }}>Realized</th>
            <th style={{ padding: "6px 8px" }}>Buys/Sells</th><th style={{ padding: "6px 8px" }}>Avg hold</th><th style={{ padding: "6px 8px" }}>Win</th><th style={{ padding: "6px 8px" }}>Holds</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 20).map((t, i) => (
              <tr key={t.a} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "5px 8px" }}><span style={{ color: "#64748b" }}>{i + 1}</span> <a href={`https://app.zerion.io/${t.a}/overview`} target="_blank" rel="noopener noreferrer" style={{ color: "#cbd5e1", textDecoration: "none" }}>{short(t.a)} ↗</a></td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: t.realized >= 0 ? "#34d399" : "#fb7185", fontWeight: 700 }}>{fE(t.realized)}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: "#94a3b8" }}>{t.bought}/{t.sold}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: "#94a3b8" }}>{t.avgHold != null ? t.avgHold + "d" : "—"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: "#94a3b8" }}>{t.winRate != null ? Math.round(t.winRate * 100) + "%" : "—"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", color: "#7c8a9e" }}>{t.holding || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Realized P&amp;L walks each token&apos;s sale chain (sell price − the seller&apos;s own buy price). Round-trips only — mints and free transfers have no known cost, so they don&apos;t count. Reconstructed on-chain from the marketplace sale log. Tap a wallet for Zerion.
      </div>
    </div>
  );
}
