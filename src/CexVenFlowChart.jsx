import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { loadOnchain } from "./history-data.js";
import { SANS, MONO, MAX_W, TipBox, Explain } from "./chart-ui.jsx";

const POS = "#4ade80", NEG = "#f6465d";
const fM = t => (t >= 0 ? "+" : "−") + (Math.abs(t) >= 1 ? Math.abs(t).toFixed(2) + "M" : Math.round(Math.abs(t) * 1000) + "K");
const WINDOWS = [{ label: "30d", wk: 4 }, { label: "90d", wk: 13 }, { label: "180d", wk: 26 }, { label: "1y", wk: 52 }];

// Per-venue net flow — which exchanges gained vs bled SPX over a window (diverging bars).
// Only possible because every venue's wallets are tagged. Behaviour read, not a signal.
export default function CexVenFlowChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  const [wk, setWk] = useState(13);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off) setLive(d ?? false); }); return () => { off = true; }; }, []);

  const oc = useMemo(() => (live && live !== true ? (Array.isArray(live) ? live : []).filter(r => r.cexVenues && Object.keys(r.cexVenues).length) : []), [live]);

  const model = useMemo(() => {
    if (oc.length < 6) return null;
    const w = Math.min(wk, oc.length - 1);
    const a = oc[oc.length - 1 - w], b = oc.at(-1);
    const keys = new Set([...Object.keys(a.cexVenues), ...Object.keys(b.cexVenues)]);
    const rows = [...keys].map(k => ({ venue: k, flow: ((b.cexVenues[k] || 0) - (a.cexVenues[k] || 0)) / 1e6 }))
      .filter(r => Math.abs(r.flow) >= 0.02).sort((x, y) => y.flow - x.flow);
    const net = rows.reduce((s, r) => s + r.flow, 0);
    return { rows, from: a.d, to: b.d, net };
  }, [oc, wk]);

  if (live == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading on-chain data…</div>;
  if (live === false || !model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Per-venue data is being computed — check back after the next weekly refresh.</div>;

  const { rows, from, to, net } = model;
  const mn = Math.min(0, ...rows.map(r => r.flow)), mx = Math.max(0, ...rows.map(r => r.flow));
  const pad = (mx - mn) * 0.16 || 1;
  const xDomain = [mn - pad, mx + pad];
  const fmt = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const Tip = ({ active, payload }) => active && payload?.length ? (
    <TipBox title={payload[0].payload.venue}>
      <span style={{ fontFamily: MONO, color: payload[0].payload.flow >= 0 ? POS : NEG }}>{fM(payload[0].payload.flow)} SPX</span>
      <span style={{ color: "#94a3b8" }}> {payload[0].payload.flow >= 0 ? "onto" : "off"} exchange</span>
    </TipBox>) : null;

  const btn = active => ({
    padding: "5px 13px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer",
    border: "1px solid " + (active ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.12)"),
    background: active ? "rgba(74,222,128,0.14)" : "transparent", color: active ? "#4ade80" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Which exchanges are gaining SPX6900 — and which are bleeding it?" accent={POS}>
        The net change in SPX held on each exchange over the window. <strong style={{ color: POS }}>Green = gained</strong> (coins flowed onto that venue), <strong style={{ color: NEG }}>red = bled</strong> (flowed off).
        Because every venue's wallets are tagged, we see <strong style={{ color: "#e2e8f0" }}>where</strong> supply moves, not just that it moved. Net flow ≠ buying or selling — behaviour, not a signal.
      </Explain>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: SANS, fontSize: 13, color: "#64748b" }}>window:</span>
        {WINDOWS.filter(w => w.wk < oc.length).map(w => <button key={w.label} style={btn(wk === w.wk)} onClick={() => setWk(w.wk)}>{w.label}</button>)}
        <span style={{ fontFamily: MONO, fontSize: 13, color: net >= 0 ? POS : NEG, marginLeft: 8 }}>net {fM(net)}</span>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b" }}>{fmt(from)} → {fmt(to)}</span>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 420 : Math.max(360, rows.length * 30 + 40)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" domain={xDomain} allowDataOverflow tickFormatter={v => fM(v)} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="category" dataKey="venue" width={isMobile ? 78 : 96} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 11 : 13, fontFamily: SANS }} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="rgba(255,255,255,0.3)" />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="flow" isAnimationActive={false} radius={[3, 3, 3, 3]} label={preview ? false : { position: "right", formatter: v => fM(v), fill: "#94a3b8", fontSize: 11, fontFamily: MONO }}>
            {rows.map(r => <Cell key={r.venue} fill={r.flow >= 0 ? POS : NEG} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Net change in SPX6900 held per <strong style={{ color: "#cbd5e1" }}>tagged exchange</strong> over the selected window. Bybit is the dominant swing venue — its big moves drive the aggregate exchange flow. Net flow isn&apos;t proof of buying or selling (OTC, listings, MM rebalancing all move balances). A behaviour read, not a signal. Not financial advice.
      </div>
    </div>
  );
}
