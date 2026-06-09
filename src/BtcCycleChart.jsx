// "What if SPX keeps rhyming with Bitcoin?" — projects SPX along Bitcoin's
// 4-year halving cycle using a BAND-POSITION map: we fit Bitcoin its own rainbow
// (same offset-power-law + percentile-band method as SPX's, R²≈0.96; see
// scripts/analysis/band-map.mjs) and translate BTC's position inside its rainbow
// onto SPX's rainbow. All parameters are data-derived:
//   · timing    — BTC's live halving clock (shift 3395; the band-position scan
//                 independently optimizes to ~3400)
//   · bottom    — bear bottoms are universal in band-space (u≈0.04–0.13 in every
//                 BTC cycle; SPX sits at u≈0.10 today)
//   · peak      — SPX's measured first-cycle amplitude (u=0.84) × BTC's empirical
//                 per-cycle amplitude decay (×0.83) → u≈0.70 next cycle
//   · cone      — decay range: ×0.61 (BTC's worst) … ×1.0 (no decay, first-cycle
//                 amplitude repeats)
// The path is painted ONCE from the fixed anchor date; live price runs freely
// against it. A for-fun what-if, not a forecast.
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { buildModel } from "./models.js";
import { BTC_HISTORY } from "./btc-history.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400, DAY = 86400000;
const SHIFT = 3395, SCALE = 1.0, FUT_YEARS = 6.5;
// Amplitude calibration (band coordinate u: 0 = fire-sale edge, 1 = p98 bubble edge)
const U_BOT = 0.08;                  // universal bear-bottom zone (BTC: 0.04–0.13 every cycle)
const SPX_C1_PEAK_U = 0.84;          // SPX's measured first-cycle top (Jul 2025 ATH)
const DECAY_MID = 0.83, DECAY_LO = 0.61, DECAY_HI = 1.0; // BTC's per-cycle amplitude decay range

// ---- BTC rainbow, fitted offline with the same methodology as the SPX model
// (scripts/analysis/band-map.mjs): ln P = 5.03 · ln(t + 345) − 32.24, R² = 0.963.
const BTC_T0 = 345, BTC_A = 5.03, BTC_B = -32.24;
const btcPredict = d => BTC_A * Math.log(Math.max(1, d) + BTC_T0) + BTC_B;
const btcMaxAge = BTC_HISTORY.at(-1)[0];
const btcLnAt = (() => {
  const m = new Map(BTC_HISTORY.map(([a, p]) => [a, Math.log(p)]));
  return a => {
    let lo = Math.floor(a), hi = Math.ceil(a);
    while (lo > 0 && !m.has(lo)) lo--; while (hi < btcMaxAge && !m.has(hi)) hi++;
    const x = m.get(lo), y = m.get(hi); if (x == null) return y; if (y == null) return x;
    return x + (y - x) * ((a - lo) / ((hi - lo) || 1));
  };
})();
// BTC percentile band edges (p2 / p98 of log residuals), computed from the data
const [BTC_BAND_LO, BTC_BAND_HI] = (() => {
  const res = BTC_HISTORY.map(([a, p]) => Math.log(p) - btcPredict(a)).sort((x, y) => x - y);
  const pct = q => { const i = q * (res.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return res[lo] + (res[hi] - res[lo]) * (i - lo); };
  return [pct(0.02), pct(0.98)];
})();
const uBtc = age => (btcLnAt(age) - btcPredict(age) - BTC_BAND_LO) / (BTC_BAND_HI - BTC_BAND_LO);

// ---- SPX rainbow
const RBW = buildModel(DEFAULT_RAW);
const SPX_SPAN = RBW.bands[8] - RBW.bands[0];
const bubbleAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[8]);
const fireAt = age => Math.exp(RBW.predict(age + 1) + RBW.bands[0]);
const centerAt = age => Math.exp(RBW.predict(age + 1));
const HALVINGS = ["2024-04-20", "2028-04-15"].map(d => new Date(d).getTime());

const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fP = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4);

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const get = k => payload.find(p => p.dataKey === k)?.value;
  const spx = get("spx"), fut = get("btcFut"), cone = get("cone");
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{new Date(label).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
      {spx != null && <div>SPX6900: <b style={{ fontFamily: MONO, color: "#4ade80" }}>{fP(spx)}</b></div>}
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
    const btcDay = age => SHIFT + age * SCALE;

    // FIXED anchor at the last bundled point — painted once, never re-fit.
    const anchorAge = Math.round((new Date(DEFAULT_RAW.at(-1).date).getTime() - SPX0) / DAY);
    const anchorLn = Math.log(DEFAULT_RAW.at(-1).price);
    const uSpxNow = (anchorLn - RBW.predict(anchorAge + 1) - RBW.bands[0]) / SPX_SPAN;
    const uBtcNow = uBtc(btcDay(anchorAge));
    // BTC's analog landmarks ahead: the bear bottom and the cycle top in band-space
    let uBtcBot = 9;
    for (let a = anchorAge; a <= anchorAge + 1100; a += 2) { const v = uBtc(btcDay(a)); if (v < uBtcBot) uBtcBot = v; }
    let uBtcPeak = -9;
    for (let a = anchorAge; a <= FUT_YEARS * 365.25; a += 2) { const bd = btcDay(a); if (bd > btcMaxAge) break; const v = uBtc(bd); if (v > uBtcPeak) uBtcPeak = v; }
    // Piecewise band-position map, continuous at the anchor: downside heads to the
    // universal bottom zone; upside scales to the decay-derived next-cycle peak.
    const mapU = (v, decay) => {
      const uPeakTarget = SPX_C1_PEAK_U * decay;
      return v >= uBtcNow
        ? uSpxNow + (v - uBtcNow) * (uPeakTarget - uSpxNow) / (uBtcPeak - uBtcNow)
        : U_BOT + (v - uBtcBot) * (uSpxNow - U_BOT) / (uBtcNow - uBtcBot);
    };
    const proj = (age, decay) => Math.exp(RBW.predict(age + 1) + RBW.bands[0] + mapU(uBtc(btcDay(age)), decay) * SPX_SPAN);

    // price-shape correlation (overlay fit across SPX's full history)
    const xs = [], ys = [];
    for (const p of spxPts) { const bd = btcDay(p.age); if (bd >= 0 && bd <= btcMaxAge) { xs.push(p.ln); ys.push(btcLnAt(bd)); } }
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const r = sxy / Math.sqrt(sxx * syy);

    const futCap = FUT_YEARS * 365.25, data = [];
    for (let age = 0; age <= futCap; age += 7) {
      const bd = btcDay(age), valid = bd >= 0 && bd <= btcMaxAge, ahead = age >= anchorAge;
      data.push({
        ts: SPX0 + age * DAY,
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        bubble: bubbleAt(age),
        floor: fireAt(age),
        center: centerAt(age),
        btcFut: valid && ahead ? proj(age, DECAY_MID) : null,
        cone: valid && ahead ? [proj(age, DECAY_LO), proj(age, DECAY_HI)] : null,
      });
    }
    let peak = { p: 0, age: 0 };
    for (let age = anchorAge; age <= futCap; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, DECAY_MID); if (pv > peak.p) peak = { p: pv, age }; }
    let low = { p: Infinity, age: 0 };
    for (let age = anchorAge; age <= anchorAge + 1000; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, DECAY_MID); if (pv < low.p) low = { p: pv, age }; }
    const peakLo = proj(peak.age, DECAY_LO), peakHi = proj(peak.age, DECAY_HI);
    const peakDate = new Date(SPX0 + peak.age * DAY), lowDate = new Date(SPX0 + low.age * DAY);
    return { data, stats: { r, peak, peakLo, peakHi, peakDate, low, lowDate, todayTs: SPX0 + anchorAge * DAY } };
  }, [series]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 22 : 48, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Stat k="SHAPE MATCH (r)" v={stats.r.toFixed(2)} c="#4ade80" isMobile={isMobile} />
        <Stat k="PROJECTED LOW" v={`${fP(stats.low.p)}`} c="#38bdf8" isMobile={isMobile} />
        <Stat k="CYCLE PEAK" v={stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} c="#a78bfa" isMobile={isMobile} />
        <Stat k="PROJECTED PEAK" v={fP(stats.peak.p)} c="#fbbf24" isMobile={isMobile} />
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
          <ReferenceLine x={stats.todayTs} stroke="#64748b" strokeDasharray="4 5" label={{ value: "NOW", fill: "#94a3b8", fontSize: 12, position: "insideTopRight" }} />
          <Line dataKey="bubble" stroke="#a78bfa" strokeWidth={1.6} strokeDasharray="3 4" strokeOpacity={0.85} dot={false} activeDot={false} isAnimationActive={false} name="SPX bubble band" connectNulls />
          <Line dataKey="floor" stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="3 4" strokeOpacity={0.7} dot={false} activeDot={false} isAnimationActive={false} name="SPX fire-sale band" connectNulls />
          <Line dataKey="center" stroke="#a78bfa" strokeWidth={1} strokeDasharray="1 6" strokeOpacity={0.3} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Area dataKey="cone" stroke="none" fill="#f7931a" fillOpacity={0.13} isAnimationActive={false} connectNulls />
          <Line dataKey="btcFut" stroke="#f7931a" strokeWidth={2.4} strokeDasharray="7 6" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="spx" stroke="#4ade80" strokeWidth={2.6} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        <span style={{ color: "#4ade80" }}>■</span> SPX6900 actual &nbsp;·&nbsp; <span style={{ color: "#f7931a" }}>┄</span> projected on BTC's 4-year cycle (shaded = scenario range) &nbsp;·&nbsp; <span style={{ color: "#a78bfa" }}>┄</span> bubble band / <span style={{ color: "#38bdf8" }}>┄</span> fire-sale band.
        <br />Built by fitting Bitcoin its own rainbow (R²≈0.96) and mapping BTC's position inside its bands onto SPX's bands. The model reads SPX as <span style={{ color: "#38bdf8" }}>already in its bottom zone (~{fP(stats.low.p)})</span>, grinding sideways into the late-2026 cycle low, then the 2027-28 bull lifting it toward <span style={{ color: "#a78bfa" }}>~{fP(stats.peak.p)}</span> by {stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (scenario range {fP(stats.peakLo)}–{fP(stats.peakHi)}, depending on how much cycle amplitude decays). A for-fun <i>what-if</i>, NOT a forecast or financial advice.
        <br /><span style={{ color: "#475569" }}>Experiment created Jun 9, 2026 — the dashed path is fixed from that day; we're watching how closely SPX's future price action follows Bitcoin's past cycle.</span>
      </div>
    </div>
  );
}
