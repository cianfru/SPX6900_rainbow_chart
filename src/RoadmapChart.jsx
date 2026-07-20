import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { dayN, ds, TARGETS } from "./models.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: p >= 100 ? 0 : 2 }));
const fMonY = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const yearOf = t => new Date(t).getUTCFullYear();
const DECADES = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000];

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
      {d.price != null && <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>}
      <div>Fair value: <span style={{ fontFamily: MONO, color: "#84cc16" }}>{fPrice(d.fair)}</span></div>
    </TipBox>
  );
}

// The power-law fair value run FORWARD, stamped with the dates the trend crosses
// the meme targets ($6.90 / $69 / $690). Grounded in the fit, not a vibes target.
export default function RoadmapChart({ series, m, isMobile, preview = false }) {
  const { all, targets, fullX } = useMemo(() => {
    const fairAt = d => Math.exp(m.predict(d));
    const dayForPrice = T => Math.exp((Math.log(T) - m.b) / m.a) - m.t0;
    const nowDay = dayN(series.at(-1).date);
    const targets = TARGETS.map(t => ({ ...t, day: dayForPrice(t.price) })).filter(t => t.day > nowDay).slice(0, 3);
    // Default view: the real price history + a projection window of similar length,
    // so history keeps ~half the width and reads as a proper line (not a squished
    // sliver — which is what happens if the view runs all the way to the far $690
    // target ~10yr out, esp. on mobile). The trend clearly crosses the FIRST target
    // ($6.90) and climbs toward the others, which stay visible as labelled lines +
    // the metric cards above; drag to zoom out to watch it reach $69 / $690.
    const firstDay = dayN(series[0].date);
    const histSpan = nowDay - firstDay;
    const nearTarget = targets[0]?.day ?? nowDay;
    const lastDay = Math.max(nowDay + histSpan, Math.round(nearTarget * 1.12));
    // One row per real price point (each carries its own fair value) for the FULL
    // launch→now history — same data as the rainbow, drawn as a continuous line.
    // Then fair-value-only rows for the FUTURE projection beyond the last price.
    // Crucially the projection grid is NOT interleaved into the historical region:
    // a dense null-price grid there would break the price line (connectNulls=false)
    // and hide the launch era. That was the bug.
    const map = new Map();
    for (const r of series) { const ts = new Date(r.date).getTime(); map.set(ts, { ts, price: r.price, fair: fairAt(dayN(r.date)) }); }
    for (let d = dayN(series.at(-1).date) + 1; d <= lastDay; d = Math.max(d + 1, Math.round(d * 1.015))) {
      const ts = Date.parse(ds(Math.round(d)));
      if (!map.has(ts)) map.set(ts, { ts, fair: fairAt(d), price: null });
    }
    const all = [...map.values()].sort((a, b) => a.ts - b.ts);
    return { all, targets: targets.map(t => ({ ...t, ts: Date.parse(ds(Math.round(t.day))) })), fullX: [all[0].ts, all.at(-1).ts] };
  }, [series, m]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    let yMin = Infinity, yMax = -Infinity;
    for (const r of vis) { for (const v of [r.price, r.fair]) if (v != null) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
    // include every target's price in yMax even if its crossing date sits past the
    // view's right edge, so the far ($690) horizontal line still renders near the top.
    for (const t of targets) yMax = Math.max(yMax, t.price);
    const xTicks = [];
    for (let yr = yearOf(x0); yr <= yearOf(x1); yr++) { const t = Date.UTC(yr, 0, 1); if (t >= x0 && t <= x1) xTicks.push(t); }
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [yMin * 0.7, yMax * 1.4] };
  }, [all, fullX, zoom, targets]);

  const yTicks = DECADES.filter(v => v >= view.yDomain[0] && v <= view.yDomain[1]);
  const now = series.at(-1);
  const nowTs = new Date(now.date).getTime();

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 14 : 26, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {targets.map((t, i) => (
          <Metric key={i} label={t.label} value={fMonY(t.ts)} color={t.c} sub={`${(t.price / now.price).toFixed(t.price / now.price >= 100 ? 0 : 1)}× from here`} />
        ))}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={t => String(yearOf(t))} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale="log" domain={view.yDomain} ticks={yTicks} allowDataOverflow
              tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 62} />
            {targets.map((t, i) => (
              <ReferenceLine key={i} y={t.price} stroke={t.c} strokeDasharray="5 4" strokeOpacity={0.8}
                label={{ value: `${t.label} · ${fMonY(t.ts)}`, position: "insideTopLeft", fill: t.c, fontSize: 12, fontFamily: MONO, fontWeight: 700 }} />
            ))}
            <ReferenceLine x={nowTs} stroke="rgba(148,163,184,0.5)" strokeDasharray="4 6"
              label={{ value: "now", position: "top", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Line type="monotone" dataKey="fair" stroke="#84cc16" strokeWidth={2.4} strokeDasharray="7 5" dot={false} isAnimationActive={false} name="fair value (extrapolated)" connectNulls />
            <Line type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={2} dot={false} isAnimationActive={false} name="price" connectNulls={false} />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The power-law <span style={{ color: "#84cc16" }}>fair-value line</span> run forward — the same fit as the rainbow, extrapolated — stamped with the dates the trend
        crosses <strong style={{ color: "#cbd5e1" }}>$6.90 / $69 / $690</strong>. It's the trend extended, <strong style={{ color: "#cbd5e1" }}>not a vibes target</strong>;
        the dates shift if the model is ever re-fit. <strong style={{ color: "#c4b5fd" }}>Drag to zoom.</strong> Not financial advice.
      </div>
    </div>
  );
}
