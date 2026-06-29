import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { runningRoiSeries } from "./chart-math.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const yearOf = t => new Date(t).getUTCFullYear();

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO, color: "#38bdf8" }}>{fPrice(d.price)}</span></div>
      {d.roi != null && (
        <div>365-day ROI: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.roi >= 1 ? "#4ade80" : "#f87171" }}>
          {d.roi.toFixed(2)}× ({d.roi >= 1 ? "+" : ""}{Math.round((d.roi - 1) * 100)}%)
        </span></div>
      )}
    </div>
  );
}

function Metric({ label, value, color = "#f8fafc", sub }) {
  return (
    <div style={{ textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// 365-day running ROI: at each date, price(t) / price(t−365d). 1× = break-even.
export default function RunningRoiChart({ series, isMobile }) {
  const { rows, xDomain, xTicks, pDomain, rDomain, cur, best, worst } = useMemo(() => {
    const { rows: all, firstRoiTs, cur } = runningRoiSeries(series);
    const rows = all.filter(r => r.ts >= firstRoiTs); // start where the ROI line begins
    const xMin = rows[0]?.ts ?? all[0].ts, xMax = rows.at(-1)?.ts ?? all.at(-1).ts;
    let pMin = Infinity, pMax = -Infinity, rMin = 1, rMax = 1;
    for (const r of rows) {
      if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price;
      if (r.roi != null) { if (r.roi < rMin) rMin = r.roi; if (r.roi > rMax) rMax = r.roi; }
    }
    const withRoi = rows.filter(r => r.roi != null);
    const best = withRoi.reduce((a, r) => (r.roi > a.roi ? r : a), withRoi[0] ?? { roi: 1 });
    const worst = withRoi.reduce((a, r) => (r.roi < a.roi ? r : a), withRoi[0] ?? { roi: 1 });
    const xTicks = [];
    for (let yr = yearOf(xMin); yr <= yearOf(xMax); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= xMin && d <= xMax) xTicks.push(d); }
    return {
      rows, xDomain: [xMin, xMax], xTicks,
      pDomain: [pMin * 0.7, pMax * 1.35], rDomain: [rMin * 0.7, rMax * 1.35],
      cur, best: best?.roi ?? 1, worst: worst?.roi ?? 1,
    };
  }, [series]);

  const pTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= pDomain[0] && v <= pDomain[1]);
  const rTicks = [0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50].filter(v => v >= rDomain[0] && v <= rDomain[1]);
  const pct = Math.round((cur - 1) * 100);
  const dc = cur >= 1 ? "#4ade80" : "#f87171";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="365d ROI now" value={`${cur.toFixed(2)}×`} color={dc} sub={`${pct >= 0 ? "+" : ""}${pct}% over a year`} />
        <Metric label="best year" value={`${best.toFixed(1)}×`} color="#4ade80" sub="peak 1-yr return" />
        <Metric label="worst year" value={`${worst.toFixed(2)}×`} color="#f87171" sub="trough 1-yr return" />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 6 : 18, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => String(yearOf(t))}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
          />
          <YAxis
            yAxisId="price" type="number" scale="log" domain={pDomain} ticks={pTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#38bdf8", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58}
          />
          <YAxis
            yAxisId="roi" orientation="right" type="number" scale="log" domain={rDomain} ticks={rTicks} allowDataOverflow
            tickFormatter={v => v + "×"}
            tick={{ fill: "#f87171", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52}
          />
          <ReferenceLine yAxisId="roi" y={1} stroke="#4ade80" strokeWidth={1.6} strokeOpacity={0.85}
            label={{ value: "break-even 1×", position: "insideBottomRight", fill: "#4ade80", fontSize: 11, fontFamily: MONO }} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Line yAxisId="price" dataKey="price" stroke="#38bdf8" strokeWidth={2.4} dot={false} isAnimationActive={false} name="price" connectNulls />
          <Line yAxisId="roi" dataKey="roi" stroke="#f87171" strokeWidth={2.8} dot={false} isAnimationActive={false} name="365-day ROI" connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        At each date, the return you'd have if you'd bought exactly <strong style={{ color: "#cbd5e1" }}>365 days earlier</strong> — price ÷ price one year ago
        (<span style={{ color: "#f87171" }}>red, right axis</span>). Above the green <strong style={{ color: "#4ade80" }}>1× break-even</strong> line = a profitable
        year; below = a year underwater. <span style={{ color: "#38bdf8" }}>Price</span> is on the left axis for context. Not financial advice.
      </div>
    </div>
  );
}
