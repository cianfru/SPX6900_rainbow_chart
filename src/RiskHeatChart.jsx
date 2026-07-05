import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { extensionSeries, riskColor } from "./chart-math.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const DAY = 86400000;
const yearOf = t => new Date(t).getUTCFullYear();
const fMonY = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const heatWord = pct => (pct >= 40 ? "very hot" : pct >= 12 ? "hot" : pct > -12 ? "near the MA" : pct > -40 ? "cold" : "very cold");
const fRatio = r => (r >= 10 ? r.toFixed(0) : r.toFixed(r < 1 ? 2 : 1)) + "×";

function PriceTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>20-week MA: <span style={{ fontFamily: MONO, color: "#f59e0b" }}>{fPrice(d.ma)}</span></div>
      <div>vs the MA: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{fRatio(d.price / d.ma)}</span> <span style={{ color: "#94a3b8" }}>({d.pct >= 0 ? "+" : ""}{Math.round(d.pct)}%, {heatWord(d.pct)})</span></div>
    </TipBox>
  );
}

// Short-term "bubble risk" à la Cowen (@benjamincowen): how far price is stretched
// from its 20-week moving average — the line it mean-reverts toward. ITC-style
// single panel: the price line rides over a colour-coded histogram of the price/20W
// ratio, bars rising HOT (green→red) when price runs above the MA, DISCOUNT
// (cyan→blue) when it sits below, pivoting on the 1× (= the MA) line. The zones are
// SPX-CALIBRATED by percentile — a memecoin trades multiples above its MA, so ITC's
// fixed ">2× = bubble" would peg SPX permanently red; instead red = the top decile of
// SPX's OWN history. Full history by default (drag to zoom); the posted card is cropped.
export default function RiskHeatChart({ series, isMobile }) {
  // Extension, 20W MA and the percentile colour scale are computed over the WHOLE
  // history so the colour zones never shift as you zoom.
  const { allRows, cur } = useMemo(() => {
    const { rows: allRows, cur } = extensionSeries(series);
    return { allRows, cur };
  }, [series]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => allRows.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const { rows, xDomain, xTicks, fmtX, priceDomain, extDomain } = useMemo(() => {
    const fullX = [allRows[0].ts, allRows.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const rows = allRows.filter(r => r.ts >= x0 && r.ts <= x1);
    let pMin = Infinity, pMax = -Infinity, eMax = 0.05, eMin = -0.05;
    for (const r of rows) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; if (r.ext > eMax) eMax = r.ext; if (r.ext < eMin) eMin = r.ext; }
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
    // Symmetric-ish extension axis with headroom, always containing the 1× pivot.
    const pad = (eMax - eMin) * 0.12 || 0.1;
    return { rows, xDomain: [x0, x1], xTicks, fmtX, priceDomain: [pMin * 0.7, pMax * 1.4], extDomain: [eMin - pad, eMax + pad] };
  }, [allRows, zoom]);

  // right axis labelled as the price/MA RATIO (×). ext = ln(ratio), so nice ratios
  // map to fixed ext ticks; keep the ones inside the current window.
  const ratioTicks = [0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50].map(r => ({ e: Math.log(r), r }))
    .filter(t => t.e >= extDomain[0] && t.e <= extDomain[1]);
  const priceTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= priceDomain[0] && v <= priceDomain[1]);

  const curPct = Math.round(cur.pct);
  const dc = cur.color;
  const lMargin = isMobile ? 0 : 12, rMargin = isMobile ? 44 : 62;
  const yW = isMobile ? 44 : 56;
  const dragProps = { onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp, style: { cursor: "crosshair", userSelect: "none" } };
  const sel = selL != null && selR != null && selL !== selR
    ? <ReferenceArea yAxisId="ext" x1={selL} x2={selR} strokeOpacity={0.3} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} /> : null;

  // legend gradient across the SPX-calibrated colour scale (cold → at MA → hot)
  const legendGrad = `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.5, 0.6, 0.8, 1].map(u => riskColor(u)).join(",")})`;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="vs 20W MA" value={fRatio(cur.price / cur.ma)} color={dc} sub={`${curPct >= 0 ? "+" : ""}${curPct}% · ${heatWord(curPct)}`} />
        <Metric label="20-week MA" value={fPrice(cur.ma)} color="#f59e0b" sub="the mean it reverts to" />
        <Metric label="price" value={fPrice(cur.price)} color="#38bdf8" sub="live" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 520}>
        <ComposedChart data={rows} margin={{ top: 10, right: rMargin, bottom: 24, left: lMargin }} barCategoryGap={0} {...dragProps}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={fmtX} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          {/* extension histogram axis (right), labelled as the price/MA ratio */}
          <YAxis yAxisId="ext" orientation="right" type="number" domain={extDomain} allowDataOverflow
            ticks={ratioTicks.map(t => t.e)} tickFormatter={e => fRatio(Math.exp(e))}
            tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          {/* price axis (left, log) */}
          <YAxis yAxisId="price" type="number" scale="log" domain={priceDomain} ticks={priceTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#38bdf8", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          <Tooltip content={<PriceTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <ReferenceLine yAxisId="ext" y={0} stroke="rgba(255,255,255,0.5)" strokeDasharray="6 6"
            label={{ value: "1× (20W MA)", position: "insideTopLeft", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
          <Bar yAxisId="ext" dataKey="ext" isAnimationActive={false} name="price ÷ 20W MA">
            {rows.map((r, i) => <Cell key={i} fill={r.color} fillOpacity={0.9} />)}
          </Bar>
          <Line yAxisId="price" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} name="price" />
          {sel}
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12, flexWrap: "wrap", fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>
        <span>discount</span>
        <span style={{ width: isMobile ? 160 : 260, height: 10, borderRadius: 5, background: legendGrad, display: "inline-block" }} />
        <span>stretched</span>
        <span style={{ color: "#64748b" }}>· zones = SPX's own percentiles</span>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The <span style={{ color: "#38bdf8" }}>price line</span> over a colour-coded histogram of how far it sits from its
        <strong style={{ color: "#f59e0b" }}> 20-week moving average</strong> (the mean it reverts to). Bars rise
        <span style={{ color: "#ef4444" }}> hot</span> when price runs above the MA, <span style={{ color: "#2563eb" }}>cold</span> when below,
        pivoting on the <strong>1×</strong> line. Colours are scaled to SPX's <em>own</em> history (a memecoin trades well above its MA),
        so red marks the hottest it's been, not a fixed threshold. A short-term mean-reversion read, distinct from the long-term valuation.
        <strong style={{ color: "#c4b5fd" }}> Drag to zoom.</strong> Not financial advice.
      </div>
    </div>
  );
}
