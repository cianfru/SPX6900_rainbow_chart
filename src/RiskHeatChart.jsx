import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { extensionSeries } from "./chart-math.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const DAY = 86400000;
const yearOf = t => new Date(t).getUTCFullYear();
const fMonY = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const heatWord = pct => (pct >= 40 ? "very hot" : pct >= 12 ? "hot" : pct > -12 ? "near the MA" : pct > -40 ? "cold" : "very cold");

function PriceTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>20-week MA: <span style={{ fontFamily: MONO, color: "#f59e0b" }}>{fPrice(d.ma)}</span></div>
      <div>Extension: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{d.pct >= 0 ? "+" : ""}{Math.round(d.pct)}%</span> <span style={{ color: "#94a3b8" }}>({heatWord(d.pct)})</span></div>
    </TipBox>
  );
}

// Short-term "bubble risk" à la Cowen: how far price is stretched from its 20-week
// moving average (the line it mean-reverts toward). Two panels: price + 20W MA on
// top, the % extension as a hot/cold oscillator below. The site page shows the FULL
// history by default (it's for digging in) — drag to zoom into any window; the
// posted CARD is the digestible ~18-month crop.
export default function RiskHeatChart({ series, isMobile }) {
  // Full series (stable): extension, 20W MA and the percentile colour scale are all
  // computed over the whole history so nothing changes as you zoom.
  const { allRows, maxAbs, cur } = useMemo(() => {
    const { rows: allRows, maxAbs, cur } = extensionSeries(series);
    return { allRows, maxAbs, cur };
  }, [series]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => allRows.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const { rows, xDomain, xTicks, fmtX, yDomain } = useMemo(() => {
    const fullX = [allRows[0].ts, allRows.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const rows = allRows.filter(r => r.ts >= x0 && r.ts <= x1);
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { for (const v of [r.price, r.ma]) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    // Wide window → year ticks; a zoomed-in window → month ticks (else 1–2 sparse
    // year marks). fmtX matches the tick granularity.
    const spanDays = (x1 - x0) / DAY;
    const xTicks = [];
    if (spanDays > 900) {
      for (let yr = yearOf(x0); yr <= yearOf(x1); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= x0 && d <= x1) xTicks.push(d); }
    } else {
      const step = spanDays > 400 ? 3 : spanDays > 150 ? 2 : 1;
      const d0 = new Date(x0);
      for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= x1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + step, 1))) xTicks.push(m.getTime());
    }
    const fmtX = spanDays > 900 ? (t => String(yearOf(t))) : fMonY;
    return { rows, xDomain: [x0, x1], xTicks, fmtX, yDomain: [yMin * 0.8, yMax * 1.25] };
  }, [allRows, zoom]);

  const oscTicks = [-2, -1, 0, 1, 2].map(k => Math.tanh(k));
  const fmtOsc = v => {
    const k = Math.atanh(Math.max(-0.999, Math.min(0.999, v)));
    const pct = Math.round((Math.exp(k * maxAbs) - 1) * 100);
    return (pct > 0 ? "+" : "") + pct + "%";
  };

  const yTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= yDomain[0] && v <= yDomain[1]);
  const curPct = Math.round(cur.pct);
  const dc = cur.color;
  const lMargin = isMobile ? 0 : 12, rMargin = isMobile ? 14 : 32;
  const yW = isMobile ? 48 : 60;
  const dragProps = { onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp, style: { cursor: "crosshair", userSelect: "none" } };
  const sel = selL != null && selR != null && selL !== selR
    ? <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.3} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} /> : null;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="vs 20W MA" value={`${curPct >= 0 ? "+" : ""}${curPct}%`} color={dc} sub={heatWord(curPct)} />
        <Metric label="20-week MA" value={fPrice(cur.ma)} color="#f59e0b" sub="the mean it reverts to" />
        <Metric label="price" value={fPrice(cur.price)} color="#f8fafc" sub="live" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      {/* top: price + 20-week MA */}
      <ResponsiveContainer width="100%" height={isMobile ? 260 : 360}>
        <ComposedChart data={rows} margin={{ top: 10, right: rMargin, bottom: 0, left: lMargin }} syncId="heat" {...dragProps}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow hide />
          <YAxis type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          <Tooltip content={<PriceTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Line dataKey="ma" stroke="#f59e0b" strokeWidth={3} dot={false} isAnimationActive={false} name="20-week MA" />
          <Line dataKey="price" stroke="#ffffff" strokeWidth={2.4} dot={false} isAnimationActive={false} name="price" />
          {sel}
        </ComposedChart>
      </ResponsiveContainer>

      {/* bottom: extension oscillator, hot above / cold below the MA (0 line) */}
      <ResponsiveContainer width="100%" height={isMobile ? 150 : 190}>
        <BarChart data={rows} margin={{ top: 4, right: rMargin, bottom: 24, left: lMargin }} syncId="heat" barCategoryGap={0} {...dragProps}>
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={fmtX}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" domain={[-1, 1]} allowDataOverflow ticks={oscTicks}
            tickFormatter={fmtOsc}
            tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.55)" strokeDasharray="6 6" />
          <Tooltip content={<PriceTip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <Bar dataKey="sq" isAnimationActive={false} name="extension vs 20W MA">
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Bar>
          {sel}
        </BarChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        How far price is stretched from its <strong style={{ color: "#f59e0b" }}>20-week moving average</strong> — the line it tends to revert toward.
        The oscillator below is the % extension: <span style={{ color: "#ef4444" }}>red/hot</span> when price runs above the MA,
        <span style={{ color: "#2563eb" }}> blue/cold</span> when it sits below. A short-term mean-reversion read, distinct from the long-term valuation.
        <strong style={{ color: "#c4b5fd" }}> Drag to zoom.</strong> Not financial advice.
      </div>
    </div>
  );
}
