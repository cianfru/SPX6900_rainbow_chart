import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { dayN, ds, bandVal, bandIndex, BAND_LABELS } from "./models.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const DECADES = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000];

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.price == null) return null;
  const vs = d.price / d.fair - 1;
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Price: <span style={{ fontFamily: MONO }}>{fPrice(d.price)}</span></div>
      <div>Fair value: <span style={{ fontFamily: MONO }}>{fPrice(d.fair)}</span></div>
      <div>vs fair: <span style={{ fontFamily: MONO, fontWeight: 700, color: vs >= 0 ? "#f87171" : "#60a5fa" }}>{vs >= 0 ? "+" : ""}{Math.round(vs * 100)}%</span></div>
      <div style={{ color: BAND_LABELS[d.bi].c, fontWeight: 700 }}>{BAND_LABELS[d.bi].l}</div>
    </TipBox>
  );
}

// The rainbow, re-axed: log price vs log(age + t0). On these axes the power-law
// fair value is a straight diagonal and the limits are straight parallel rails.
export default function ChannelChart({ series, m, isMobile }) {
  const { rows, cur, xTicks, xDomain, yDomain } = useMemo(() => {
    const t0 = m.t0;
    const first = dayN(series[0].date);
    const last = dayN(series.at(-1).date);
    const dMax = Math.round(last * 1.6); // project the rails forward
    const railAt = d => ({ fair: Math.exp(m.predict(d)), upper: bandVal(m, d, m.bands.length - 1), lower: bandVal(m, d, 0) });

    const rows = series.map(r => {
      const d = dayN(r.date);
      return { x: d + t0, day: d, date: r.date, price: r.price, bi: bandIndex(m, r.price, d), ...railAt(d) };
    });
    // projection rows for the rails only (price null), so the channel runs ahead
    const stepCount = 24;
    for (let i = 1; i <= stepCount; i++) {
      const d = Math.round(last + (i / stepCount) * (dMax - last));
      rows.push({ x: d + t0, day: d, date: ds(d), price: null, bi: null, ...railAt(d) });
    }

    const lastRow = series.at(-1);
    const curDay = dayN(lastRow.date);
    const cur = { price: lastRow.price, ...railAt(curDay), bi: bandIndex(m, lastRow.price, curDay) };

    // year tick x-values (log-spaced → visually straight); decade y-range
    const xTicks = [];
    for (let yr = new Date(series[0].date).getFullYear(); yr <= new Date(ds(dMax)).getFullYear(); yr++) {
      const d = dayN(`${yr}-01-01`);
      if (d >= first && d <= dMax) xTicks.push(d + t0);
    }
    const lo = bandVal(m, first, 0), hi = bandVal(m, dMax, m.bands.length - 1);
    return { rows, cur, xTicks, xDomain: [first + t0, dMax + t0], yDomain: [lo * 0.7, hi * 1.3] };
  }, [series, m]);

  const vsFair = cur.price / cur.fair - 1;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <Metric label="exponent" value={m.a.toFixed(2)} color="#bef264" sub="power-law slope" />
        <Metric label="R²" value={m.r2.toFixed(3)} color="#a78bfa" sub={`${Math.round(m.r2 * 100)}% of log-price`} />
        <Metric label="fair value" value={fPrice(cur.fair)} sub="trend, today" />
        <Metric label="today" value={`${vsFair >= 0 ? "+" : ""}${Math.round(vsFair * 100)}%`} color={BAND_LABELS[cur.bi].c} sub={`vs fair · ${BAND_LABELS[cur.bi].l}`} />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="x" type="number" scale="log" domain={xDomain} ticks={xTicks} allowDataOverflow
            tickFormatter={x => String(new Date(ds(Math.round(x - m.t0))).getFullYear())}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
          />
          <YAxis
            type="number" scale="log" domain={yDomain} ticks={DECADES.filter(v => v >= yDomain[0] && v <= yDomain[1])} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 60}
          />
          <ReferenceLine x={cur.day + m.t0} stroke="rgba(148,163,184,0.5)" strokeDasharray="4 6" />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Line dataKey="upper" stroke="#dc2626" strokeWidth={1.7} dot={false} isAnimationActive={false} name="upper limit" />
          <Line dataKey="fair" stroke="#84cc16" strokeWidth={2} dot={false} isAnimationActive={false} name="fair value" />
          <Line dataKey="lower" stroke="#3b82f6" strokeWidth={1.7} dot={false} isAnimationActive={false} name="lower limit" />
          <Line type="monotone" dataKey="price" stroke="#ffffff" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="price" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        The same power-law model as the rainbow, drawn on <strong style={{ color: "#cbd5e1" }}>log price vs log age</strong>, so fair value (green)
        is a straight diagonal and the upper (red) / lower (blue) limits are straight parallel rails. Price (white) rides the channel; where it sits
        between the rails is the same read as the rainbow band. The x-axis is log(age + {m.t0}d), the offset that makes the trend straight. Not financial advice.
      </div>
    </div>
  );
}
