import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Scatter, ZAxis, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { dayN, bandIndex, BAND_LABELS } from "./models.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fD = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fPrice = p => (p < 1 ? "$" + p.toFixed(4) : "$" + p.toFixed(2));

// A residual expressed as a ± percentage from the model's center line.
const asPct = r => (Math.exp(r) - 1) * 100;

// Recent history is recorded daily but the older baseline is ~weekly, so the raw
// scatter bunches up at the right edge. Thin the plotted dots to a uniform
// ~weekly cadence (keeping the latest point); the stats still use every point.
const WEEK = 6 * 86400000;
const thinByTs = (arr, gap = WEEK) => {
  const out = [];
  for (const p of arr) if (!out.length || p.ts - out[out.length - 1].ts >= gap) out.push(p);
  const last = arr[arr.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
};

function Tip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>vs model: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.resid >= 0 ? "#f87171" : "#60a5fa" }}>
        {d.resid >= 0 ? "+" : ""}{asPct(d.resid).toFixed(0)}%
      </span></div>
      <div style={{ color: BAND_LABELS[d.bi].c, fontWeight: 700 }}>{BAND_LABELS[d.bi].l}</div>
    </TipBox>
  );
}

export default function ModelChart({ series, m, isMobile }) {
  const { data, stat } = useMemo(() => {
    const pts = series.map(r => {
      const day = dayN(r.date);
      const resid = Math.log(r.price) - m.predict(day);
      return { ts: new Date(r.date).getTime(), date: r.date, price: r.price, resid, bi: bandIndex(m, r.price, day) };
    });
    const n = pts.length;
    const within1 = pts.filter(p => Math.abs(p.resid) <= m.std).length / n;
    const within2 = pts.filter(p => Math.abs(p.resid) <= 2 * m.std).length / n;
    // Stats use every point; the plotted scatter is thinned to ~weekly so the
    // daily tail doesn't bunch up. Domain spans the full set so no dot is clipped.
    const residLo = Math.min(...pts.map(p => p.resid)), residHi = Math.max(...pts.map(p => p.resid));
    return { data: thinByTs(pts), stat: { n, within1, within2, cur: pts[n - 1], first: series[0].date, last: series[n - 1].date, residLo, residHi } };
  }, [series, m]);

  // Pad the y-domain so the outermost band and any stray residual stay visible.
  const lo = Math.min(m.bands[0], stat.residLo);
  const hi = Math.max(m.bands[m.bands.length - 1], stat.residHi);
  const pad = (hi - lo) * 0.04;
  const cur = stat.cur;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="R²" value={m.r2.toFixed(3)} color="#a78bfa" sub={`${Math.round(m.r2 * 100)}% of log-price`} />
        <Metric label="σ (resid)" value={m.std.toFixed(3)} sub="log std-dev" />
        <Metric label="within ±1σ" value={`${Math.round(stat.within1 * 100)}%`} color="#4ade80" sub="of all days" />
        <Metric label="within ±2σ" value={`${Math.round(stat.within2 * 100)}%`} color="#4ade80" />
        <Metric label="data points" value={stat.n.toLocaleString()} sub={`${fD(new Date(stat.first).getTime())} – ${fD(new Date(stat.last).getTime())}`} />
        <Metric label="today" value={`${cur.resid >= 0 ? "+" : ""}${asPct(cur.resid).toFixed(0)}%`}
          color={BAND_LABELS[cur.bi].c} sub={BAND_LABELS[cur.bi].l} />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 12 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={fD} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30}
          />
          <YAxis
            dataKey="resid" type="number" domain={[lo - pad, hi + pad]}
            tickFormatter={r => `${r >= 0 ? "+" : ""}${asPct(r).toFixed(0)}%`}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56}
          />
          <ZAxis range={[7, 7]} />
          {/* The rainbow bands, flattened into residual space, every band is a
              percentile slice of these residuals, so this is literally the fit. */}
          {BAND_LABELS.map((b, i) => (
            <ReferenceArea key={i} y1={m.bands[i]} y2={m.bands[i + 1]} fill={b.c} fillOpacity={0.18} stroke="none" />
          ))}
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.6)" strokeDasharray="5 5" />
          <ReferenceLine y={m.std} stroke="rgba(255,255,255,0.22)" />
          <ReferenceLine y={-m.std} stroke="rgba(255,255,255,0.22)" />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Scatter dataKey="resid" fill="#f8fafc" fillOpacity={0.8} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        Each dot is a sampled close (~weekly), plotted as its <strong style={{ color: "#cbd5e1" }}>residual</strong>, how far above (red zone)
        or below (blue zone) the log-regression fit (dashed line) it sat. The colored bands are percentile slices of exactly these
        residuals, so the rainbow is descriptive of history, not a prediction. R² {m.r2.toFixed(3)} means the trend explains{" "}
        {Math.round(m.r2 * 100)}% of the variation in log-price; the rest is the spread you see here. Not financial advice.
      </div>
    </div>
  );
}
