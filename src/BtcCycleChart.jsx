// "What if SPX runs Bitcoin's 4-year cycle?" — a clean, idealized crypto cycle
// (rounded bottom → accelerating bull → parabolic top → bear) placed on Bitcoin's
// halving clock and scaled by SPX's OWN rainbow bands. No literal BTC price replay
// (that dragged in Bitcoin's flat 2023) — just the archetype shape. The path is
// painted once from a fixed anchor; live price runs freely against it. For-fun
// what-if, not a forecast.
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { buildModel } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400, DAY = 86400000;
const FUT_YEARS = 6.5;
// Cycle shape, in band coordinate u (0 = fire-sale edge, 1 = bubble edge):
const BOTTOM_DATE = "2026-10-15", TOP_DATE = "2029-09-15", END_DATE = "2030-06-15";
const U_BOTTOM = -0.03, U_TOP = 0.72, U_END = 0.46;   // a shallow final flush, top short of the extreme
const BULL_EXP = 1.8, BEAR_EXP = 0.7;                 // accelerating bull, faster initial bear
const AMP_LO = 0.78, AMP_HI = 1.25;                   // scenario cone (how big the bull runs)

const RBW = buildModel(DEFAULT_RAW);
const SPAN = RBW.bands[8] - RBW.bands[0];
const bubbleAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[8]);
const fireAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[0]);
const centerAt = age => Math.exp(RBW.predict(age + 1));
const HALVINGS = ["2024-04-20", "2028-04-15"].map(d => new Date(d).getTime());
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMonY = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fP = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4);

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const get = k => payload.find(p => p.dataKey === k)?.value;
  const spx = get("spx"), fut = get("proj"), cone = get("cone");
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{fMonY(label)}</div>
      {spx != null && <div>SPX6900: <b style={{ fontFamily: MONO, color: "#4ade80" }}>{fP(spx)}</b></div>}
      {fut != null && <div>Cycle path: <b style={{ fontFamily: MONO, color: "#f7931a" }}>{fP(fut)}</b></div>}
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
    // FIXED anchor at the last bundled point — path painted here once, never re-fit.
    const ageOf = d => Math.round((new Date(d).getTime() - SPX0) / DAY);
    const anchorAge = ageOf(DEFAULT_RAW.at(-1).date);
    const uNow = (Math.log(DEFAULT_RAW.at(-1).price) - RBW.predict(anchorAge + 1) - RBW.bands[0]) / SPAN;
    const bottomAge = ageOf(BOTTOM_DATE), topAge = ageOf(TOP_DATE), endAge = ageOf(END_DATE);

    // idealized cycle in band-coordinate space
    const uCurve = (age, amp) => {
      let u;
      if (age <= bottomAge) { const q = (age - anchorAge) / (bottomAge - anchorAge); u = uNow + (U_BOTTOM - uNow) * (0.5 - 0.5 * Math.cos(Math.PI * q)); }
      else if (age <= topAge) { const p = (age - bottomAge) / (topAge - bottomAge); u = U_BOTTOM + (U_TOP - U_BOTTOM) * Math.pow(p, BULL_EXP); }
      else { const q = Math.min(1, (age - topAge) / (endAge - topAge)); u = U_TOP - (U_TOP - U_END) * Math.pow(q, BEAR_EXP); }
      return uNow + (u - uNow) * amp; // cone pinches at the anchor, widens forward
    };
    const proj = (age, amp) => Math.exp(RBW.predict(age + 1) + RBW.bands[0] + uCurve(age, amp) * SPAN);

    const futCap = FUT_YEARS * 365.25, data = [];
    for (let age = 0; age <= futCap; age += 6) {
      const ahead = age >= anchorAge;
      data.push({
        ts: SPX0 + age * DAY,
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        bubble: bubbleAt(age),
        floor: fireAt(age),
        center: centerAt(age),
        proj: ahead ? proj(age, 1) : null,
        cone: ahead ? [proj(age, AMP_LO), proj(age, AMP_HI)] : null,
      });
    }
    let peak = { p: 0, age: 0 }, low = { p: Infinity, age: 0 };
    for (let age = anchorAge; age <= endAge; age += 4) { const pv = proj(age, 1); if (pv > peak.p) peak = { p: pv, age }; if (age <= bottomAge + 120 && pv < low.p) low = { p: pv, age }; }
    return {
      data,
      stats: {
        peak, low, peakLo: proj(peak.age, AMP_LO), peakHi: proj(peak.age, AMP_HI),
        peakDate: new Date(SPX0 + peak.age * DAY), lowDate: new Date(SPX0 + low.age * DAY),
        nowTs: SPX0 + anchorAge * DAY,
      },
    };
  }, [series]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 22 : 48, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Stat k="CYCLE LOW" v={fP(stats.low.p)} c="#38bdf8" isMobile={isMobile} />
        <Stat k="CYCLE PEAK" v={stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} c="#a78bfa" isMobile={isMobile} />
        <Stat k="PROJECTED PEAK" v={fP(stats.peak.p)} c="#fbbf24" isMobile={isMobile} />
        <Stat k="PEAK RANGE" v={`${fP(stats.peakLo)}–${fP(stats.peakHi)}`} c="#f7931a" isMobile={isMobile} />
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 540}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fMon}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 50 : 36} />
          <YAxis scale="log" domain={["auto", "auto"]} tickFormatter={fP}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 60} />
          <Tooltip content={<Tip />} />
          {HALVINGS.map((h, i) => (
            <ReferenceLine key={i} x={h} stroke="rgba(255,255,255,0.2)" label={{ value: "BTC Halving", fill: "#94a3b8", fontSize: 11, position: "insideBottomLeft", angle: -90, offset: 8 }} />
          ))}
          <ReferenceLine x={stats.nowTs} stroke="#64748b" strokeDasharray="4 5" label={{ value: "NOW", fill: "#94a3b8", fontSize: 12, position: "insideTopRight" }} />
          <Line dataKey="bubble" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 4" strokeOpacity={0.8} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="center" stroke="#a78bfa" strokeWidth={1} strokeDasharray="1 6" strokeOpacity={0.25} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="floor" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 4" strokeOpacity={0.7} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Area dataKey="cone" stroke="none" fill="#f7931a" fillOpacity={0.13} isAnimationActive={false} activeDot={false} connectNulls />
          <Line dataKey="proj" stroke="#f7931a" strokeWidth={2.6} strokeDasharray="7 6" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="spx" stroke="#4ade80" strokeWidth={2.6} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        <span style={{ color: "#4ade80" }}>■</span> SPX6900 actual &nbsp;·&nbsp; <span style={{ color: "#f7931a" }}>┄</span> idealized 4-year cycle (shaded = scenario range) &nbsp;·&nbsp; <span style={{ color: "#a78bfa" }}>┄</span> bubble / <span style={{ color: "#38bdf8" }}>┄</span> fire-sale band.
        <br />One clean crypto-cycle archetype on Bitcoin's halving clock, scaled to SPX's rainbow: a rounded bottom (~<span style={{ color: "#38bdf8" }}>{fP(stats.low.p)}, {stats.lowDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>), an accelerating 2027-28 bull, a top near <span style={{ color: "#a78bfa" }}>{fP(stats.peak.p)}</span> ({fP(stats.peakLo)}–{fP(stats.peakHi)}) around {stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}, then a bear. A for-fun <i>what-if</i>, NOT a forecast or financial advice.
        <br /><span style={{ color: "#475569" }}>Experiment created Jun 9, 2026 — the dashed path is fixed from that day; we're watching how closely SPX's real price action follows it.</span>
      </div>
    </div>
  );
}
