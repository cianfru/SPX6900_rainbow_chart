import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { extensionSeries } from "./chart-math.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const DAY = 86400000;
const HEAT_WINDOW_DAYS = 549; // ~18 months — this is a SHORT-TERM read; the full
// 3-yr log view buries the recent signal under the tiny-price launch era.
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
// top, the % extension as a hot/cold oscillator below.
export default function RiskHeatChart({ series, isMobile }) {
  const { rows, xDomain, xTicks, yDomain, oscTicks, fmtOsc, cur } = useMemo(() => {
    // Extension + MA + colour scale are computed over the FULL history (MA primed,
    // maxAbs stable), then the DISPLAY is cropped to the recent window.
    const { rows: allRows, maxAbs, cur } = extensionSeries(series);
    const xMax = allRows.at(-1).ts;
    const rows = allRows.filter(r => r.ts >= xMax - HEAT_WINDOW_DAYS * DAY);
    const xMin = rows[0].ts;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { for (const v of [r.price, r.ma]) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    // month ticks (every 3 months) across the ~18-month window
    const xTicks = [];
    const d0 = new Date(xMin);
    for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= xMax; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 3, 1))) xTicks.push(m.getTime());
    // Oscillator plots the tanh-SQUASHED extension on a fixed [-1,1] axis (no cap —
    // outliers compress toward the edge). Axis ticks sit at the ±1/±2 "knees" and are
    // labelled with the REAL % (inverse of the squash) so it still reads in percent.
    const oscTicks = [-2, -1, 0, 1, 2].map(k => Math.tanh(k));
    const fmtOsc = v => {
      const k = Math.atanh(Math.max(-0.999, Math.min(0.999, v)));
      const pct = Math.round((Math.exp(k * maxAbs) - 1) * 100);
      return (pct > 0 ? "+" : "") + pct + "%";
    };
    return { rows, xDomain: [xMin, xMax], xTicks, yDomain: [yMin * 0.8, yMax * 1.25], oscTicks, fmtOsc, cur };
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
            tickFormatter={fMonY}
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
