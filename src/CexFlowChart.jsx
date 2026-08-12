import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { CEX_FLOW } from "./cex-flow.js";
import { loadCexFlow } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const RED = "#fb7185", GRN = "#4ade80", PRICE = "#fbbf24";
const ROLL = 7, ONB_MARK = 3e6;
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fM = v => (v >= 0 ? "+" : "−") + Math.abs(v / 1e6).toFixed(2) + "M";

// [d, cexBal, lpBal, custBal, org, onb, price], daily. Plot a 7-day rolling ORGANIC net
// (listings excluded) as the pulse; a thin token's raw daily flow is pure noise.
const build = days => {
  const a = days.map(r => ({ ts: Date.parse(r[0]), org: r[4], onb: r[5], price: r[6] }));
  for (let i = 0; i < a.length; i++) {
    let ro = 0, rn = 0; for (let j = Math.max(0, i - ROLL + 1); j <= i; j++) { ro += a[j].org; rn += a[j].onb; }
    a[i].roll = ro; a[i].rOnb = rn;
  }
  const start = Math.max(0, a.findIndex(r => r.onb !== 0 || r.org !== 0) - 7);
  return a.slice(start).filter(r => Number.isFinite(r.price));
};
const BUNDLE = build(CEX_FLOW.days);

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>7d net: <span style={{ fontFamily: MONO, color: d.roll >= 0 ? RED : GRN }}>{fM(d.roll)}</span></div>
      <div style={{ color: "#94a3b8" }}>{d.roll >= 0 ? "net deposits (sell-side)" : "net withdrawals (accumulation)"}</div>
      <div style={{ color: PRICE, fontFamily: MONO }}>${d.price?.toFixed(4)}</div>
      {d.rOnb > ONB_MARK && <div style={{ color: "#94a3b8" }}>· listing fill this week</div>}
    </TipBox>
  );
}

// Exchange flow, coins moving on/off exchanges. Onto = potential sell-side, off = accumulation.
// Listing fills (new exchange wallets filling up) are stripped so only organic behaviour shows.
export default function CexFlowChart({ isMobile, preview = false }) {
  const [all, setAll] = useState(BUNDLE);
  useEffect(() => { let c = false; loadCexFlow().then(d => { if (!c && d?.days?.length) setAll(build(d.days)); }); return () => { c = true; }; }, []);
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const om = Math.max(...vis.map(r => Math.abs(r.roll))) * 1.1 || 1;
    const ps = vis.map(r => r.price).filter(Boolean);
    // contiguous listing spans (for shading)
    const spans = []; let s = null;
    vis.forEach((r, i) => { const hot = r.rOnb > ONB_MARK; if (hot && s == null) s = r.ts; if (!hot && s != null) { spans.push([s, vis[i - 1].ts]); s = null; } });
    if (s != null) spans.push([s, vis.at(-1).ts]);
    return { vis, xDomain: [x0, x1], xTicks, om, pMin: Math.min(...ps), pMax: Math.max(...ps), spans, cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = view.cur;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Are coins moving onto exchanges (to sell) or off them (into self-custody)?" accent={GRN}>
        Coins flowing <strong style={{ color: RED }}>onto</strong> exchanges are potential sell-side; flowing <strong style={{ color: GRN }}>off</strong> means holders are pulling into self-custody.
        We strip out one-time <strong style={{ color: "#cbd5e1" }}>listing fills</strong> (a new exchange wallet filling up) and show only the organic 7-day pulse. One cycle of data, behaviour, not a signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="7d net flow" value={fM(cur.roll)} color={cur.roll >= 0 ? RED : GRN} sub={cur.roll >= 0 ? "onto exchanges" : "off exchanges"} />
        <Metric label="latest price" value={`$${cur.price?.toFixed(4)}`} color={PRICE} sub="SPX6900" />
      </div>
      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={GRN} />
      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 40 : 62, bottom: 24, left: isMobile ? 4 : 16 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            {view.spans.map(([a, b], i) => <ReferenceArea key={i} x1={a} x2={b} yAxisId="flow" fill="#64748b" fillOpacity={0.14} stroke="none" />)}
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis yAxisId="flow" domain={[-view.om, view.om]} tickFormatter={v => (v / 1e6).toFixed(0) + "M"}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={isMobile ? 40 : 52} />
            <YAxis yAxisId="price" orientation="right" scale="log" domain={[view.pMin * 0.9, view.pMax * 1.1]} allowDataOverflow
              tickFormatter={v => "$" + (v >= 1 ? v.toFixed(1) : v.toFixed(2))} tick={{ fill: PRICE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={isMobile ? 40 : 54} />
            <ReferenceLine yAxisId="flow" y={0} stroke="rgba(255,255,255,0.45)" />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Bar yAxisId="flow" dataKey="roll" isAnimationActive={false} maxBarSize={6}>
              {view.vis.map((r, i) => <Cell key={i} fill={r.roll >= 0 ? RED : GRN} fillOpacity={0.55} />)}
            </Bar>
            <Line yAxisId="price" type="monotone" dataKey="price" stroke={PRICE} strokeWidth={1.7} dot={false} isAnimationActive={false} />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea yAxisId="flow" x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>Exchange flow</strong>, 7-day rolling net of SPX moving on/off tagged exchange addresses, reconstructed on-chain (Dune). Listing fills (grey) excluded.
        Known addresses only; netflow isn&apos;t a guaranteed buy/sell. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
