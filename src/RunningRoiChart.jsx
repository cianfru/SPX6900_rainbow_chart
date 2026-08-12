import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round(v * 100).toLocaleString()}%`;
const fMult = v => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "×";
const yearOf = t => new Date(t).getUTCFullYear();
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const DAY = 86400000;
const GROWTH = "#fbbf24", PRICE = "#38bdf8";

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO, color: PRICE }}>{fPrice(d.price)}</span></div>
      <div>From window start: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.roi >= 1 ? "#4ade80" : "#f87171" }}>
        {fMult(d.roi)} ({d.roi >= 1 ? "+" : ""}{Math.round((d.roi - 1) * 100)}%)
      </span></div>
    </TipBox>
  );
}

// Performance from the START of whatever window you're viewing: the growth line
// rebases to 1× at the left edge, so the full chart = growth since launch, and a
// drag-selected window = growth from that window's own start. Drag across to zoom
// into a period (like a screenshot region select); Reset to zoom back out.
export default function RunningRoiChart({ series, isMobile, preview = false }) {
  const { all, fullX } = useMemo(() => {
    const all = series.map(r => ({ ts: new Date(r.date).getTime(), date: r.date, price: r.price })).sort((a, b) => a.ts - b.ts);
    return { all, fullX: [all[0]?.ts ?? 0, all.at(-1)?.ts ?? 1] };
  }, [series]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    const startPrice = vis[0]?.price ?? 1;
    const data = vis.map(r => ({ ...r, roi: r.price / startPrice }));
    let pMin = Infinity, pMax = -Infinity, rMin = Infinity, rMax = -Infinity, runPeak = -Infinity, mdd = 0;
    for (const r of data) {
      if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price;
      if (r.roi < rMin) rMin = r.roi; if (r.roi > rMax) rMax = r.roi;
      if (r.price > runPeak) runPeak = r.price; mdd = Math.min(mdd, r.price / runPeak - 1);
    }
    const spanDays = (x1 - x0) / DAY, monthly = spanDays <= 560;
    const xTicks = [];
    if (monthly) {
      let t = Date.UTC(new Date(x0).getUTCFullYear(), new Date(x0).getUTCMonth(), 1);
      while (t <= x1) { if (t >= x0) xTicks.push(t); const dd = new Date(t); t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1); }
    } else {
      for (let yr = yearOf(x0); yr <= yearOf(x1); yr++) { const t = Date.UTC(yr, 0, 1); if (t >= x0 && t <= x1) xTicks.push(t); }
    }
    const winRet = (data.at(-1)?.roi ?? 1) - 1;
    // ONE curve, two labelings: the right ×-axis is the left $-axis divided by the
    // window's start price (on a log scale price and growth-from-start are the same
    // shape), so both axes describe the single gold line at the same pixels.
    const pLo = pMin * 0.8, pHi = pMax * 1.25;
    return {
      data, xDomain: [x0, x1], xTicks, fmtX: monthly ? fShort : (t => String(yearOf(t))),
      pDomain: [pLo, pHi], rDomain: [pLo / startPrice, pHi / startPrice],
      winRet, peak: rMax, mdd, start: vis[0], end: vis.at(-1), rMin, rMax,
    };
  }, [all, fullX, zoom]);

  const pTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= view.pDomain[0] && v <= view.pDomain[1]);
  const rTicks = [0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter(v => v >= view.rDomain[0] && v <= view.rDomain[1]);
  const rangeSub = view.start ? `${fShort(view.start.ts)} → ${fShort(view.end.ts)}` : "";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label={zoomed ? "window return" : "since launch"} value={fPct(view.winRet)} color={view.winRet >= 0 ? "#4ade80" : "#f87171"} sub={zoomed ? rangeSub : "start → now"} />
        <Metric label="peak" value={fMult(view.peak)} color={GROWTH} sub="high from start" />
        <Metric label="max drawdown" value={fPct(view.mdd)} color="#f87171" sub="peak to trough" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} viewing="Growth rebased to this window's start." />

      <div style={{ position: "relative" }}>
      {!preview && <ChartZoomHint />}
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={view.data} margin={{ top: 10, right: isMobile ? 6 : 18, bottom: 24, left: isMobile ? 0 : 12 }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          style={{ cursor: "crosshair", userSelect: "none" }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
            tickFormatter={view.fmtX}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
          />
          <YAxis
            yAxisId="price" type="number" scale="log" domain={view.pDomain} ticks={pTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: PRICE, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58}
          />
          <YAxis
            yAxisId="roi" orientation="right" type="number" scale="log" domain={view.rDomain} ticks={rTicks} allowDataOverflow
            tickFormatter={v => v + "×"}
            tick={{ fill: GROWTH, fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52}
          />
          <ReferenceLine yAxisId="roi" y={1} stroke="#4ade80" strokeWidth={1.6} strokeOpacity={0.85}
            label={{ value: "start · 1×", position: "insideBottomRight", fill: "#4ade80", fontSize: 11, fontFamily: MONO }} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          {/* single curve, the left $-axis and right ×-axis both label it */}
          <Line yAxisId="roi" type="monotone" dataKey="roi" stroke={GROWTH} strokeWidth={1.6} dot={false} isAnimationActive={false} name="growth from start" connectNulls />
          {selL != null && selR != null && selL !== selR && (
            <ReferenceArea yAxisId="price" x1={selL} x2={selR} strokeOpacity={0.4} stroke={PRICE} fill={PRICE} fillOpacity={0.12} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        Growth measured from the <strong style={{ color: "#cbd5e1" }}>start of the window</strong>, the <span style={{ color: GROWTH }}>gold line</span> begins at
        1× on the left edge (<span style={{ color: "#4ade80" }}>green 1× = back to the starting price</span>), with <span style={{ color: PRICE }}>price</span> on the left axis.
        <strong style={{ color: "#7dd3fc" }}> Drag to select any period</strong> and the chart zooms in and rebases to it. Not financial advice.
      </div>
    </div>
  );
}
