import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { fitQuantileFan, quantilePricesAt, dayForTs, QUANTILE_META } from "./quantile-fan.js";
import { SANS, MONO, MAX_W, Metric, TipBox } from "./chart-ui.jsx";

const fPrice = v => (v >= 1000 ? "$" + Math.round(v / 1000).toLocaleString() + "K" : v >= 1 ? "$" + v.toFixed(v >= 10 ? 0 : 2) : "$" + v.toFixed(v < 0.01 ? 4 : 3));
const yearOf = t => new Date(t).getUTCFullYear();
const DAY = 86400000;
const PROJECT_TO = "2030-06-01";
// Crop the blown-out launch corner: near day 0 the quantiles (quadratics in ln(day))
// diverge hard, a 100-266x-wide fan through the first ~9 months that reads as a
// visual "bowtie" and buries the useful forward cone. Start the visible window this
// many days after launch, where the fan settles to a sane width. The FIT still uses
// all history (quantile-fan.js), this only trims the DISPLAY.
const CROP_DAYS = 300;

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "short", year: "numeric" })}>
      {d.price != null && <div style={{ marginBottom: 4 }}>Price: <span style={{ fontFamily: MONO, color: "#3b82f6" }}>{fPrice(d.price)}</span></div>}
      {QUANTILE_META.map((q, i) => (
        <div key={i} style={{ color: q.color, fontFamily: MONO, fontSize: 12 }}>{q.label}: {fPrice(d["q" + i])}</div>
      )).reverse()}
    </TipBox>
  );
}

// Asymmetric quantile regression fan, 7 quadratic quantile curves fit on log-price
// vs ln(day), monotone-rearranged, projected forward to a probabilistic price cone.
export default function QuantileFanChart({ series, isMobile, preview = false }) {
  const { rows, cur, proj, nowTs, xTicks, yDomain, yTicks } = useMemo(() => {
    const s = (series || []).filter(r => r.price > 0);
    if (s.length < 30) return { rows: null };
    const fan = fitQuantileFan(s);
    const t0 = fan.t0, nowTs = new Date(s.at(-1).date).getTime(), tEnd = Date.parse(PROJECT_TO);
    // Left edge of the DRAWN window, the launch corner cropped off (fit is untouched).
    const tCrop = Math.min(t0 + CROP_DAYS * DAY, nowTs);
    const priceMap = new Map(s.map(r => [new Date(r.date).getTime(), r.price]));
    // historical timestamps (thinned for perf) from the crop point + monthly future samples
    const histTs = s.filter((_, i) => i % 2 === 0 || i === s.length - 1).map(r => new Date(r.date).getTime()).filter(ts => ts >= tCrop);
    const futTs = [];
    for (let m = new Date(nowTs); m.getTime() <= tEnd; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) if (m.getTime() > nowTs) futTs.push(m.getTime());
    const allTs = [...new Set([tCrop, ...histTs, ...futTs])].sort((a, b) => a - b);
    let yLo = Infinity, yHi = -Infinity;
    const rows = allTs.map(ts => {
      const q = quantilePricesAt(fan.fits, dayForTs(fan, ts));
      const row = { ts, price: priceMap.get(ts) ?? null, redBand: [q[5], q[6]], greenBand: [q[0], q[2]] };
      q.forEach((v, i) => { row["q" + i] = v; });
      yLo = Math.min(yLo, q[0]); yHi = Math.max(yHi, q[6]);
      const p = row.price; if (p != null) { yLo = Math.min(yLo, p); yHi = Math.max(yHi, p); }
      return row;
    });
    const curQ = quantilePricesAt(fan.fits, dayForTs(fan, nowTs));
    const projQ = quantilePricesAt(fan.fits, dayForTs(fan, tEnd));
    const yTicks = [0.001, 0.01, 0.1, 1, 10, 100, 1000].filter(v => v >= yLo * 0.7 && v <= yHi * 1.3);
    const xTicks = [];
    for (let y = yearOf(tCrop); y <= yearOf(tEnd); y++) { const t = Date.UTC(y, 0, 1); if (t >= tCrop && t <= tEnd) xTicks.push(t); }
    return {
      rows, nowTs, xTicks, yDomain: [yLo * 0.7, yHi * 1.3], yTicks,
      cur: { price: priceMap.get(nowTs), median: curQ[3], q25: curQ[2] },
      proj: { lo: projQ[0], median: projQ[3], hi: projQ[6] },
    };
  }, [series]);

  if (rows === null) return <div style={{ maxWidth: MAX_W, margin: "0 auto", height: 420, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, color: "#64748b" }}>Not enough history to fit the fan yet.</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 34, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="median trend now" value={fPrice(cur.median)} color="#cbd5e1" sub={cur.price != null ? (cur.price >= cur.median ? "price above trend" : "price below trend") : ""} />
        <Metric label="2030 median" value={fPrice(proj.median)} color="#a78bfa" sub="central projection" />
        <Metric label="2030 range" value={`${fPrice(proj.lo)}–${fPrice(proj.hi)}`} color="#f59e0b" sub="1st–99th pct" />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 10 : 26, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time" allowDataOverflow
            tickFormatter={t => String(yearOf(t))} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 30 : 18} />
          <YAxis type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
            tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())} tick={{ fill: "#94a3b8", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 62} />
          {!preview && <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />}
          <Area dataKey="redBand" stroke="none" fill="#dc2626" fillOpacity={0.14} isAnimationActive={false} activeDot={false} />
          <Area dataKey="greenBand" stroke="none" fill="#22c55e" fillOpacity={0.11} isAnimationActive={false} activeDot={false} />
          {QUANTILE_META.map((q, i) => (
            <Line key={i} dataKey={"q" + i} stroke={q.color} strokeWidth={i === 3 ? 2.6 : 1.5} strokeOpacity={0.9} dot={false} activeDot={false} isAnimationActive={false} name={q.label} />
          ))}
          <Line dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} name="price" connectNulls={false} />
          <ReferenceLine x={nowTs} stroke="#64748b" strokeDasharray="4 6" strokeOpacity={0.7}
            label={preview ? undefined : { value: "NOW", position: "insideTopRight", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
        </ComposedChart>
      </ResponsiveContainer>

      {!preview && (
        <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
          Seven <strong style={{ color: "#e2e8f0" }}>quantile</strong> curves (1st → 99th percentile) fit independently to log-price and projected forward, a probabilistic
          price cone. <span style={{ color: "#dc2626" }}>Red</span> = the frothy top decile, <span style={{ color: "#22c55e" }}>green</span> = the cheap tail; the fatter upper
          tail is SPX's real asymmetry (rare huge spikes, rarer deep crashes). Distinct from the rainbow's symmetric bands.
          <strong> Young-data caveat: like the rainbow, the fit is noisy and tightens as history accumulates</strong>, a distribution, not a forecast. Not financial advice.
        </div>
      )}
    </div>
  );
}
