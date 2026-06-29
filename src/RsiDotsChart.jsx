import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { rsiDotsSeries, rsiColor, RSI_LO, RSI_HI } from "./chart-math.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const yearOf = t => new Date(t).getUTCFullYear();
const rsiWord = v => (v >= 70 ? "overbought" : v >= 55 ? "warm" : v >= 45 ? "neutral" : v >= 35 ? "cool" : "oversold");

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>RSI(6): <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{Math.round(d.rsi)}</span> <span style={{ color: "#94a3b8" }}>({rsiWord(d.rsi)})</span></div>
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

function RsiDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (payload.last) return <circle cx={cx} cy={cy} r={9} fill="#fff" stroke={payload.color} strokeWidth={3.5} />;
  return <circle cx={cx} cy={cy} r={6.5} fill={payload.color} stroke="#05050e" strokeWidth={1} />;
}

// RSI color legend (blue cold → red hot) as a CSS gradient bar.
function RsiLegend() {
  const grad = Array.from({ length: 11 }, (_, i) => rsiColor(RSI_LO + (i / 10) * (RSI_HI - RSI_LO))).join(",");
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontFamily: SANS, fontSize: 12, color: "#94a3b8" }}>RSI</span>
      <div style={{ position: "relative", width: 220, height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${grad})`, border: "1px solid rgba(255,255,255,0.18)" }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>{RSI_LO} cold → hot {RSI_HI}</span>
    </div>
  );
}

// Price as monthly DOTS coloured by RSI(6) over a geometric MA — an homage to the
// Bitcoin RSI chart by @100trillionUSD (PlanB).
export default function RsiDotsChart({ series, isMobile }) {
  const { rows, xDomain, xTicks, yDomain, cur } = useMemo(() => {
    const { dots, gma, cur } = rsiDotsSeries(series);
    const gmaMap = new Map(gma.map(g => [g.ts, g.v]));
    const rows = dots.map((d, i) => ({ ts: d.ts, price: d.price, rsi: d.rsi, color: d.color, gma: gmaMap.get(d.ts) ?? null, last: i === dots.length - 1 }));
    const fallback = new Date(series[0].date).getTime();
    const xMin = rows[0]?.ts ?? fallback, xMax = rows.at(-1)?.ts ?? fallback;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { for (const v of [r.price, r.gma]) if (v != null) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    const xTicks = [];
    for (let yr = yearOf(xMin); yr <= yearOf(xMax); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= xMin && d <= xMax) xTicks.push(d); }
    return { rows, xDomain: [xMin, xMax], xTicks, yDomain: [yMin * 0.7, yMax * 1.4], cur };
  }, [series]);

  const yTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= yDomain[0] && v <= yDomain[1]);
  const dc = rsiColor(cur);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Metric label="RSI now" value={Math.round(cur)} color={dc} sub={`${rsiWord(cur)} (monthly)`} />
        <Metric label="price" value={fPrice(rows.at(-1)?.price ?? 0)} color="#f8fafc" sub="latest close" />
      </div>
      <RsiLegend />

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => String(yearOf(t))}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
          />
          <YAxis
            type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 60}
          />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Line dataKey="gma" stroke="#e2e8f0" strokeWidth={3} dot={false} isAnimationActive={false} name="geometric MA" connectNulls />
          <Scatter dataKey="price" shape={<RsiDot />} isAnimationActive={false} name="monthly price" />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        Monthly price plotted as <strong style={{ color: "#cbd5e1" }}>dots coloured by RSI</strong> — <span style={{ color: "#2563eb" }}>blue</span> oversold/cold,
        <span style={{ color: "#ef4444" }}> red</span> overbought/hot — over a <span style={{ color: "#e2e8f0" }}>geometric moving average</span>. An homage to the
        Bitcoin RSI chart by @100trillionUSD (PlanB). RSI(6) on monthly closes, short because SPX6900 is young. Not financial advice.
      </div>
    </div>
  );
}
