import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { piCycleRatio, piCycleState } from "./models.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const PC = "#a78bfa";
const fR = v => v.toFixed(2);
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload, zones }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const st = piCycleState(d.ratio, zones);
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Pi Cycle ratio: <span style={{ fontFamily: MONO, color: st.color }}>{fR(d.ratio)}</span> <span style={{ color: "#94a3b8" }}>({st.label})</span></div>
    </TipBox>
  );
}

// The Pi Cycle ratio, 111-day / (350-day × 2) MA, from Bitcoin's Pi Cycle indicator,
// applied to SPX6900 as a descriptive extension/accumulation gauge (NOT the borrowed
// binary cross). >1 = top zone, <0.5 = historically an accumulation zone.
export default function PiCycleChart({ series, isMobile, preview = false }) {
  const all = useMemo(() => {
    const pc = piCycleRatio(series || []);
    return pc.rows.length ? pc : null;
  }, [series]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all && all.rows.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!all || all.rows.length < 2) return null;
    const fullX = [all.rows[0].ts, all.rows.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.rows.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    let yMax = 0;
    for (const r of vis) if (r.ratio > yMax) yMax = r.ratio;
    yMax = Math.max(all.zones.top * 1.06, yMax * 1.08);
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [0, yMax] };
  }, [all, zoom]);

  if (!all) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough price history yet for a 350-day average.</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough history in this range.</div>;

  const z = all.zones;
  const cur = all.cur, peak = all.peak, st = piCycleState(cur.ratio, z);
  const sorted = all.rows.map(r => r.ratio).sort((a, b) => a - b);
  const pct = Math.round(sorted.filter(v => v <= cur.ratio).length / sorted.length * 100);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is SPX6900 running hot or in an accumulation zone?" accent={PC}>
        A famous <strong style={{ color: "#e2e8f0" }}>Bitcoin timing indicator</strong>, borrowed for SPX: it compares a fast (111-day) price average to a slow one.
        <strong style={{ color: "#f87171" }}> High</strong> = price stretched far above its own trend (top zone); <strong style={{ color: "#38bdf8" }}>low</strong> = quietly building a base (accumulation). A rhyme with Bitcoin, not a forecast.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="Pi Cycle ratio" value={fR(cur.ratio)} color={st.color} sub={st.label} />
        <Metric label="peak" value={fR(peak.ratio)} color="#f87171" sub={fShort(peak.ts)} />
        <Metric label="of its range" value={pct + "th"} color="#22d3ee" sub="percentile" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={PC} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="pcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PC} stopOpacity={0.32} /><stop offset="100%" stopColor={PC} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={z.top} y2={view.yDomain[1]} fill="#f87171" fillOpacity={0.10} stroke="none"
              label={preview ? undefined : { value: "top zone", position: "insideTopLeft", fill: "#f87171", fontSize: 11, fontFamily: MONO }} />
            <ReferenceArea y1={z.accum} y2={z.top} fill="#64748b" fillOpacity={0.05} stroke="none" />
            <ReferenceArea y1={z.deep} y2={z.accum} fill="#38bdf8" fillOpacity={0.10} stroke="none" />
            <ReferenceArea y1={0} y2={z.deep} fill="#4ade80" fillOpacity={0.10} stroke="none"
              label={preview ? undefined : { value: "accumulation", position: "insideBottomLeft", fill: "#4ade80", fontSize: 11, fontFamily: MONO }} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view.yDomain} allowDataOverflow tickFormatter={fR}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <ReferenceLine y={z.btcTop} stroke="#64748b" strokeWidth={1.2} strokeDasharray="3 5"
              label={preview ? undefined : { value: "Bitcoin's top 1.0", position: "insideRight", fill: "#64748b", fontSize: 10.5, fontFamily: MONO }} />
            <ReferenceLine y={z.top} stroke="#f87171" strokeWidth={1.4} strokeDasharray="6 4"
              label={preview ? undefined : { value: `SPX top ${fR(z.top)}`, position: "insideRight", fill: "#f87171", fontSize: 11, fontFamily: MONO }} />
            <ReferenceLine y={z.accum} stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="6 4"
              label={preview ? undefined : { value: "accumulation 0.5", position: "insideRight", fill: "#38bdf8", fontSize: 11, fontFamily: MONO }} />
            <Tooltip content={(p) => <Tip {...p} zones={z} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="ratio" stroke={PC} strokeWidth={1.8} fill="url(#pcArea)" dot={false} isAnimationActive={false} name="Pi Cycle ratio" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={PC} fill={PC} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        The <strong style={{ color: PC }}>Pi Cycle ratio</strong>, the 111-day MA over the 350-day MA × 2 (350/111 ≈ π), from Bitcoin&apos;s Pi Cycle Top indicator.
        Below <strong style={{ color: "#38bdf8" }}>0.5</strong> has historically been an accumulation zone (it transfers cleanly, SPX sits there about as often as Bitcoin).
        SPX runs hotter than Bitcoin, though, so the <strong style={{ color: "#f87171" }}>top</strong> is tuned to SPX&apos;s own range (<strong style={{ color: "#f87171" }}>{fR(z.top)}</strong>, vs Bitcoin&apos;s 1.0). It peaked at SPX&apos;s 2025 top and now sits at <strong style={{ color: st.color }}>{fR(cur.ratio)}</strong> ({st.label}).
        A Bitcoin indicator applied to SPX for context, a rhyme, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
