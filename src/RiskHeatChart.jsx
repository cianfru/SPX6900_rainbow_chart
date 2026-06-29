import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { extensionSeries } from "./chart-math.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const yearOf = t => new Date(t).getUTCFullYear();
const heatWord = pct => (pct >= 40 ? "very hot" : pct >= 12 ? "hot" : pct > -12 ? "near the MA" : pct > -40 ? "cold" : "very cold");

function PriceTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>20-week MA: <span style={{ fontFamily: MONO, color: "#f59e0b" }}>{fPrice(d.ma)}</span></div>
      <div>Extension: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{d.pct >= 0 ? "+" : ""}{Math.round(d.pct)}%</span> <span style={{ color: "#94a3b8" }}>({heatWord(d.pct)})</span></div>
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

// Short-term "bubble risk" à la Cowen: how far price is stretched from its 20-week
// moving average (the line it mean-reverts toward). Two panels: price + 20W MA on
// top, the % extension as a hot/cold oscillator below.
export default function RiskHeatChart({ series, isMobile }) {
  const { rows, xDomain, xTicks, yDomain, oscDomain, cur } = useMemo(() => {
    const { rows, cur } = extensionSeries(series);
    const xMin = rows[0].ts, xMax = rows.at(-1).ts;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { for (const v of [r.price, r.ma]) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    // Scale the oscillator to the ~92nd-percentile extension, NOT the absolute max —
    // a single launch-era spike would otherwise flatten the everyday signal. The
    // outlier bars clip at the panel edge (same intent as the card's tanh squash).
    const absPct = rows.map(r => Math.abs(r.pct)).sort((a, b) => a - b);
    const p92 = absPct[Math.floor(absPct.length * 0.92)] || 50;
    const lim = Math.max(40, Math.ceil(p92 / 20) * 20);
    const xTicks = [];
    for (let yr = yearOf(xMin); yr <= yearOf(xMax); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= xMin && d <= xMax) xTicks.push(d); }
    return { rows, xDomain: [xMin, xMax], xTicks, yDomain: [yMin * 0.8, yMax * 1.25], oscDomain: [-lim, lim], cur };
  }, [series]);

  const yTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= yDomain[0] && v <= yDomain[1]);
  const curPct = Math.round(cur.pct);
  const dc = cur.color;
  const lMargin = isMobile ? 0 : 12, rMargin = isMobile ? 14 : 32;
  const yW = isMobile ? 48 : 60;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="vs 20W MA" value={`${curPct >= 0 ? "+" : ""}${curPct}%`} color={dc} sub={heatWord(curPct)} />
        <Metric label="20-week MA" value={fPrice(cur.ma)} color="#f59e0b" sub="the mean it reverts to" />
        <Metric label="price" value={fPrice(cur.price)} color="#f8fafc" sub="live" />
      </div>

      {/* top: price + 20-week MA */}
      <ResponsiveContainer width="100%" height={isMobile ? 280 : 380}>
        <ComposedChart data={rows} margin={{ top: 10, right: rMargin, bottom: 0, left: lMargin }} syncId="heat">
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow hide />
          <YAxis type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          <Tooltip content={<PriceTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Line dataKey="ma" stroke="#f59e0b" strokeWidth={3} dot={false} isAnimationActive={false} name="20-week MA" />
          <Line dataKey="price" stroke="#ffffff" strokeWidth={2.4} dot={false} isAnimationActive={false} name="price" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* bottom: extension oscillator, hot above / cold below the MA (0 line) */}
      <ResponsiveContainer width="100%" height={isMobile ? 150 : 190}>
        <BarChart data={rows} margin={{ top: 4, right: rMargin, bottom: 24, left: lMargin }} syncId="heat" barCategoryGap={0}>
          <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => String(yearOf(t))}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" domain={oscDomain} allowDataOverflow ticks={[oscDomain[0], oscDomain[0] / 2, 0, oscDomain[1] / 2, oscDomain[1]]}
            tickFormatter={v => (v > 0 ? "+" : "") + v + "%"}
            tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={yW} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.55)" strokeDasharray="6 6" />
          <Tooltip content={<PriceTip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <Bar dataKey="pct" isAnimationActive={false} name="extension vs 20W MA">
            {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        How far price is stretched from its <strong style={{ color: "#f59e0b" }}>20-week moving average</strong> — the line it tends to revert toward.
        The oscillator below is the % extension: <span style={{ color: "#ef4444" }}>red/hot</span> when price runs above the MA,
        <span style={{ color: "#2563eb" }}> blue/cold</span> when it sits below. A short-term mean-reversion read, distinct from the long-term valuation. Not financial advice.
      </div>
    </div>
  );
}
