import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { zScoreSeries } from "./chart-math.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom, timeWindow } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const sigWord = s => (s <= -1.5 ? "deeply cheap" : s < -0.5 ? "cheap" : s < 0.5 ? "fair value" : s < 1.5 ? "stretched" : "very stretched");

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload.find(p => p.payload?.price != null)?.payload;
  if (!d) return null;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>Fair value: <span style={{ fontFamily: MONO, color: "#cbd5e1" }}>{fPrice(d.fair)}</span></div>
      <div>vs trend: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.color }}>{d.sigma >= 0 ? "+" : ""}{d.sigma.toFixed(2)}σ</span> <span style={{ color: "#94a3b8" }}>({sigWord(d.sigma)})</span></div>
    </TipBox>
  );
}

// Price recoloured by its valuation z-score — how many σ the log-price sits from
// the power-law fair value. Blue = cheap (below trend), red = stretched (above).
export default function RiskColorChart({ series, m, isMobile }) {
  const { all, cur } = useMemo(() => {
    const { pts } = zScoreSeries(series, m);
    const all = pts.map(p => ({ ts: p.ts, price: p.price, fair: p.fair, sigma: p.sigma, color: p.color }));
    return { all, cur: pts.at(-1) };
  }, [series, m]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const { rows, xDomain, xTicks, fmtX, yDomain, stops, areaColor } = useMemo(() => {
    const { vis, xDomain, xTicks, fmtX } = timeWindow(all, zoom);
    let yMin = Infinity, yMax = -Infinity;
    for (const r of vis) { for (const v of [r.price, r.fair]) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    // gradient stops along x: colour at each point, positioned relative to the
    // VISIBLE window (objectBoundingBox, x1→x2 horizontal) so colours track the zoom.
    const [xMin, xMax] = xDomain, span = (xMax - xMin) || 1;
    const stops = vis.map(r => ({ off: (((r.ts - xMin) / span) * 100).toFixed(2) + "%", color: r.color }));
    return { rows: vis, xDomain, xTicks, fmtX, yDomain: [yMin * 0.75, yMax * 1.3], stops, areaColor: vis.at(-1).color };
  }, [all, zoom]);

  const yTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100].filter(v => v >= yDomain[0] && v <= yDomain[1]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="today" value={`${cur.sigma >= 0 ? "+" : ""}${cur.sigma.toFixed(1)}σ`} color={cur.color} sub={sigWord(cur.sigma)} />
        <Metric label="fair value" value={fPrice(cur.fair)} sub="power-law trend, today" />
        <Metric label="price" value={fPrice(cur.price)} color="#f8fafc" sub="live" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
          <defs>
            <linearGradient id="zgrad" x1="0" y1="0" x2="1" y2="0">
              {stops.map((s, i) => <stop key={i} offset={s.off} stopColor={s.color} />)}
            </linearGradient>
            <linearGradient id="zarea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={areaColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={areaColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={fmtX}
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
          <Area dataKey="price" stroke="none" fill="url(#zarea)" isAnimationActive={false} activeDot={false} />
          <Line type="monotone" dataKey="fair" stroke="#cbd5e1" strokeWidth={1.6} strokeDasharray="2 7" dot={false} isAnimationActive={false} name="fair value" />
          <Line type="monotone" dataKey="price" stroke="url(#zgrad)" strokeWidth={2.4} dot={false} isAnimationActive={false} name="price" />
          {selL != null && selR != null && selL !== selR && (
            <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.3} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The price line recoloured by its <strong style={{ color: "#cbd5e1" }}>valuation z-score</strong> — how many standard deviations the log-price sits
        from the power-law <span style={{ color: "#cbd5e1" }}>fair value</span> (dashed). <span style={{ color: "#2563eb" }}>Blue</span> = cheap, below trend;
        <span style={{ color: "#ef4444" }}> red</span> = stretched, above trend. A long-term statistical read, distinct from the short-term 20-week heat. Not financial advice.
      </div>
    </div>
  );
}
