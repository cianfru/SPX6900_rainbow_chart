// "What if SPX6900 traces Bitcoin's last cycle?" — overlay Bitcoin's REAL price
// path forward from today (src/btc-cycle.js, shared with the bot cards), anchored
// at SPX's current price and scaled by amplitude. Drawn over SPX's own rainbow
// band context. The dashed path is fixed from the anchor; live price runs freely
// against it. A for-fun what-if, not a forecast.
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { buildModel } from "./models.js";
import { btcCycleProjection } from "./btc-cycle.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400, DAY = 86400000;

const RBW = buildModel(DEFAULT_RAW);
const bubbleAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[8]);
const fireAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[0]);
const centerAt = age => Math.exp(RBW.predict(age + 1));
const HALVINGS = ["2024-04-20", "2028-04-15"].map(d => new Date(d).getTime());
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMonY = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fP = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4);
const fBtc = v => v >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + Math.round(v);

// interpolate a [ts, value][] series at an arbitrary ts (null if out of range)
const interpTs = (arr, ts) => {
  if (ts < arr[0][0] || ts > arr.at(-1)[0]) return null;
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][0] <= ts) lo = m; else hi = m; }
  const f = (ts - arr[lo][0]) / ((arr[hi][0] - arr[lo][0]) || 1);
  return arr[lo][1] + (arr[hi][1] - arr[lo][1]) * f;
};

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const get = k => payload.find(p => p.dataKey === k)?.value;
  const spx = get("spx"), btc = get("btc"), fut = get("proj"), cone = get("cone");
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{fMonY(label)}</div>
      {spx != null && <div>SPX6900: <b style={{ fontFamily: MONO, color: "#4ade80" }}>{fP(spx)}</b></div>}
      {btc != null && <div>Bitcoin (aligned): <b style={{ fontFamily: MONO, color: "#f7931a" }}>{fBtc(btc)}</b></div>}
      {fut != null && <div>BTC-cycle path: <b style={{ fontFamily: MONO, color: "#f7931a" }}>{fP(fut)}</b></div>}
      {cone && <div style={{ color: "#94a3b8" }}>scenario: {fP(cone[0])} – {fP(cone[1])}</div>}
    </div>
  );
}

function Stat({ k, v, c, isMobile }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>{k}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 22 : 30, fontWeight: 700, color: c }}>{v}</div>
    </div>
  );
}

export default function BtcCycleChart({ series, isMobile }) {
  const { data, stats } = useMemo(() => {
    const src = series?.length ? series : DEFAULT_RAW;
    const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
    const spxPts = src.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), ln: Math.log(r.price) }));
    const spxMaxAge = spxPts.at(-1).age;
    const spxLnAt = a => {
      if (a <= spxPts[0].age) return spxPts[0].ln; if (a >= spxMaxAge) return spxPts.at(-1).ln;
      let lo = 0, hi = spxPts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (spxPts[m].age <= a) lo = m; else hi = m; }
      const f = (a - spxPts[lo].age) / (spxPts[hi].age - spxPts[lo].age || 1);
      return spxPts[lo].ln + (spxPts[hi].ln - spxPts[lo].ln) * f;
    };

    // Real BTC cycle overlay (shared with the bot cards), fixed at the anchor.
    const c = btcCycleProjection();
    const endTs = c.projPts.at(-1)[0];
    const endAge = Math.round((endTs - SPX0) / DAY);
    // BTC's REAL price, time-aligned (its own right axis) — the RHYME that
    // justifies "≈ BTC Aug '22": SPX retraced BTC's 2021 double top → 2022 bottom.
    const btcReal = [...c.histPts, ...c.histFwd];

    const data = [];
    for (let age = 0; age <= endAge; age += 6) {
      const ts = SPX0 + age * DAY;
      const pj = interpTs(c.projPts, ts);
      data.push({
        ts,
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        btc: interpTs(btcReal, ts),
        bubble: bubbleAt(age),
        floor: fireAt(age),
        center: centerAt(age),
        proj: pj,
        cone: pj != null ? [interpTs(c.projLo, ts), interpTs(c.projHi, ts)] : null,
      });
    }
    return {
      data,
      stats: {
        peak: c.peak, low: c.low, peakLo: c.peakLo, peakHi: c.peakHi,
        peakDate: new Date(c.peakTs), lowDate: new Date(c.lowTs), nowTs: c.anchorTs,
        btcFrom: c.btcFrom, peaks: c.peaks,
      },
    };
  }, [series]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 22 : 48, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Stat k="CYCLE DIP" v={fP(stats.low)} c="#38bdf8" isMobile={isMobile} />
        <Stat k="PROJECTED PEAK" v={stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} c="#a78bfa" isMobile={isMobile} />
        <Stat k="PEAK PRICE" v={fP(stats.peak)} c="#fbbf24" isMobile={isMobile} />
        <Stat k="PEAK RANGE" v={`${fP(stats.peakLo)}–${fP(stats.peakHi)}`} c="#f7931a" isMobile={isMobile} />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 540}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fMon}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 50 : 36} />
          <YAxis yAxisId="spx" scale="log" domain={["auto", "auto"]} tickFormatter={fP}
            tick={{ fill: "#4ade80", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 60} />
          <YAxis yAxisId="btc" orientation="right" scale="log" domain={["auto", "auto"]} tickFormatter={fBtc}
            tick={{ fill: "#f7931a", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52} />
          <Tooltip content={<Tip />} />
          {HALVINGS.map((h, i) => (
            <ReferenceLine yAxisId="spx" key={i} x={h} stroke="rgba(255,255,255,0.2)" label={{ value: "BTC Halving", fill: "#94a3b8", fontSize: 11, position: "insideBottomLeft", angle: -90, offset: 8 }} />
          ))}
          {(stats.peaks || []).map((pk, i) => (
            <ReferenceLine yAxisId="spx" key={`pk${i}`} x={pk.ts} stroke="rgba(247,147,26,0.35)" strokeDasharray="2 6" label={{ value: `BTC ${pk.label}`, fill: "#f7931a", fontSize: 11, position: "insideTopRight" }} />
          ))}
          <ReferenceLine yAxisId="spx" x={stats.nowTs} stroke="#64748b" strokeDasharray="4 5" label={{ value: "NOW", fill: "#94a3b8", fontSize: 12, position: "insideTopRight" }} />
          <Line yAxisId="spx" dataKey="bubble" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 4" strokeOpacity={0.8} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="spx" dataKey="center" stroke="#a78bfa" strokeWidth={1} strokeDasharray="1 6" strokeOpacity={0.25} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="spx" dataKey="floor" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 4" strokeOpacity={0.7} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Area yAxisId="spx" dataKey="cone" stroke="none" fill="#f7931a" fillOpacity={0.1} isAnimationActive={false} activeDot={false} connectNulls />
          <Line yAxisId="spx" dataKey="proj" stroke="#f7931a" strokeWidth={2.2} strokeDasharray="7 6" strokeOpacity={0.55} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="btc" type="monotone" dataKey="btc" stroke="#f7931a" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="spx" type="monotone" dataKey="spx" stroke="#4ade80" strokeWidth={2.2} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        <span style={{ color: "#4ade80" }}>■</span> SPX6900 (left axis) &nbsp;·&nbsp; <span style={{ color: "#f7931a" }}>■</span> Bitcoin's real last cycle, time-aligned (right axis) &nbsp;·&nbsp; <span style={{ color: "#f7931a" }}>┄</span> beta-scaled projection (shaded = range) &nbsp;·&nbsp; <span style={{ color: "#a78bfa" }}>┄</span> bubble / <span style={{ color: "#38bdf8" }}>┄</span> fire-sale band.
        <br /><b style={{ color: "#cbd5e1" }}>Why "≈ BTC {fMonY(stats.btcFrom.getTime())}"?</b> Line the two charts up on their own scales and SPX has retraced Bitcoin's <b>2021 double top</b> (Apr &amp; Nov) → 2022 bottom — the peaks landing within weeks on the aligned clock, which is why today maps to BTC's post-top low. The timing rhymes; the amplitude is each asset's own (BTC's 2021 spike was a bigger relative move). From that low, BTC went on to a new ATH — the dashed line beta-scales that path to a top near <span style={{ color: "#a78bfa" }}>{fP(stats.peak)}</span> ({fP(stats.peakLo)}–{fP(stats.peakHi)}) around {stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}. A for-fun <i>what-if</i>, NOT a forecast or financial advice.
      </div>
    </div>
  );
}
