import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { rsiDotsSeries, rsiColor, RSI_LO, RSI_HI } from "./chart-math.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const yearOf = t => new Date(t).getUTCFullYear();
const rsiWord = v => (v >= 70 ? "overbought" : v >= 55 ? "warm" : v >= 45 ? "neutral" : v >= 35 ? "cool" : "oversold");

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload.find(p => p.payload?.rsi != null)?.payload;
  if (!d) return null;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>RSI(6): <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{Math.round(d.rsi)}</span> <span style={{ color: "#94a3b8" }}>({rsiWord(d.rsi)})</span></div>
    </TipBox>
  );
}

function RsiDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  if (payload.last) return <circle cx={cx} cy={cy} r={9} fill="#fff" stroke={payload.color} strokeWidth={3.5} />;
  return <circle cx={cx} cy={cy} r={6.5} fill={payload.color} stroke="#05050e" strokeWidth={1} />;
}

// Vertical RSI colour scale on the LEFT, à la PlanB: red/hot at top, blue/cold at
// bottom. Positioned to line up with the chart's plot area (top/bottom insets).
function VerticalRsiLegend({ height, topInset, bottomInset }) {
  const ticks = [85, 75, 65, 55, 45, 35];
  const grad = Array.from({ length: 11 }, (_, i) => rsiColor(RSI_HI - (i / 10) * (RSI_HI - RSI_LO))).join(","); // top hot → bottom cold
  const span = height - topInset - bottomInset;
  const yOf = v => topInset + ((RSI_HI - v) / (RSI_HI - RSI_LO)) * span;
  return (
    <div style={{ position: "relative", width: 54, flexShrink: 0, height }}>
      <div style={{ position: "absolute", left: 30, top: topInset, height: span, width: 14, borderRadius: 7, background: `linear-gradient(to bottom, ${grad})`, border: "1px solid rgba(255,255,255,0.18)" }} />
      {ticks.map(v => (
        <div key={v} style={{ position: "absolute", left: 46, top: yOf(v) - 8, fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>{v}</div>
      ))}
      <div style={{ position: "absolute", left: -8, top: topInset + span / 2, transform: "rotate(-90deg)", transformOrigin: "left center", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#cbd5e1", whiteSpace: "nowrap" }}>RSI · hot ↑ cold ↓</div>
    </div>
  );
}

// Price as monthly DOTS coloured by RSI(6), connected by an RSI-coloured price line,
// over a thin geometric MA, a faithful homage to the Bitcoin RSI chart by
// @100trillionUSD (PlanB), down to the vertical RSI scale on the left.
export default function RsiDotsChart({ series, isMobile }) {
  const { rows, xDomain, xTicks, yDomain, cur, stops } = useMemo(() => {
    const { dots, gma, cur } = rsiDotsSeries(series);
    const gmaMap = new Map(gma.map(g => [g.ts, g.v]));
    const rows = dots.map((d, i) => ({ ts: d.ts, price: d.price, rsi: d.rsi, color: d.color, gma: gmaMap.get(d.ts) ?? null, last: i === dots.length - 1 }));
    const fallback = new Date(series[0].date).getTime();
    const xMin = rows[0]?.ts ?? fallback, xMax = rows.at(-1)?.ts ?? fallback;
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) { for (const v of [r.price, r.gma]) if (v != null) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    const xTicks = [];
    for (let yr = yearOf(xMin); yr <= yearOf(xMax); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= xMin && d <= xMax) xTicks.push(d); }
    const span = (xMax - xMin) || 1;
    const stops = rows.map(r => ({ off: ((r.ts - xMin) / span * 100).toFixed(2) + "%", color: r.color }));
    return { rows, xDomain: [xMin, xMax], xTicks, yDomain: [yMin * 0.7, yMax * 1.4], cur, stops };
  }, [series]);

  const yTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= yDomain[0] && v <= yDomain[1]);
  const dc = rsiColor(cur);
  const chartH = isMobile ? 400 : 560;
  const topInset = 10, bottomInset = 34; // match ResponsiveContainer top margin + x-axis band

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="RSI now" value={Math.round(cur)} color={dc} sub={`${rsiWord(cur)} (monthly)`} />
        <Metric label="price" value={fPrice(rows.at(-1)?.price ?? 0)} color="#f8fafc" sub="latest close" />
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? 2 : 6 }}>
        <VerticalRsiLegend height={chartH} topInset={topInset} bottomInset={bottomInset} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={rows} margin={{ top: topInset, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 8 }}>
              <defs>
                <linearGradient id="rsiPriceGrad" x1="0" y1="0" x2="1" y2="0">
                  {stops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.color} />)}
                </linearGradient>
              </defs>
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
              {/* thin geometric MA reference */}
              <Line type="monotone" dataKey="gma" stroke="#cbd5e1" strokeWidth={1.5} strokeOpacity={0.85} dot={false} isAnimationActive={false} name="geometric MA" connectNulls />
              {/* the price line, coloured by RSI along its length (linear, connects the monthly dots) */}
              <Line dataKey="price" stroke="url(#rsiPriceGrad)" strokeWidth={2.2} dot={false} isAnimationActive={false} name="price" connectNulls />
              {/* RSI-coloured dots on top */}
              <Scatter dataKey="price" shape={<RsiDot />} isAnimationActive={false} name="monthly price" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The monthly price line and dots <strong style={{ color: "#cbd5e1" }}>coloured by RSI</strong>, <span style={{ color: "#2563eb" }}>blue</span> oversold/cold,
        <span style={{ color: "#ef4444" }}> red</span> overbought/hot, over a thin <span style={{ color: "#94a3b8" }}>geometric moving average</span>. A faithful homage to the
        Bitcoin RSI chart by @100trillionUSD (PlanB), down to the vertical RSI scale. RSI(6) on monthly closes, short because SPX6900 is young. Not financial advice.
      </div>
    </div>
  );
}
