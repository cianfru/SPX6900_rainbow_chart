// "What if SPX keeps rhyming with Bitcoin?" — a for-fun overlay that aligns
// SPX6900 to its best-matching Bitcoin cycle (2019–22, r≈0.95) and projects BTC's
// actual path forward as a scenario cone. Locked to the best-fit narrative; the
// BTC rainbow itself is a recalibrated vibes model — we're in that tradition.
// Not a forecast. Just playing with numbers.
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { buildModel } from "./models.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "./btc-history.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400, DAY = 86400000;
// TIMING from BTC's current 4-year halving cycle: SPX maps to BTC's 2019-22 cycle
// (the structurally-matching post-halving cycle) → bottom ~Oct 2026, bull 2027-28,
// next top ~mid-2029, in step with the live market. MAGNITUDE from SPX's youth:
// β_up 3.5 amplifies the upside (younger/smaller bulls harder than mature BTC),
// β_down 0.6 is gentle (SPX is already near its fire-sale floor). For-fun what-if.
const SHIFT = 3395, SCALE = 1.0, BETA_UP = 3.5, BETA_DOWN = 0.6, SPREAD = 0.3, FUT_YEARS = 6.5;
const RBW = buildModel(DEFAULT_RAW);             // SPX rainbow model
const edgesAt = age => RBW.bands.map(b => Math.exp(RBW.predict(age + 1) + b)); // 10 band edges
// rainbow fill colours, cheap (blue) → expensive (red), for the 9 bands between edges
const BAND_COLORS = ["#3b82f6", "#38bdf8", "#22d3ee", "#4ade80", "#a3e635", "#facc15", "#fb923c", "#f97316", "#ef4444"];
// approximate Bitcoin halving dates (cycle clock the projection is pinned to)
const HALVINGS = ["2024-04-20", "2028-04-15"].map(d => new Date(d).getTime());

const BTC0 = new Date(BTC_FIRST_DATE).getTime();
const btcMaxAge = BTC_HISTORY.at(-1)[0];
const btcLnAt = a => {
  if (a <= BTC_HISTORY[0][0]) return Math.log(BTC_HISTORY[0][1]);
  if (a >= btcMaxAge) return Math.log(BTC_HISTORY.at(-1)[1]);
  let lo = 0, hi = BTC_HISTORY.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BTC_HISTORY[m][0] <= a) lo = m; else hi = m; }
  const f = (a - BTC_HISTORY[lo][0]) / (BTC_HISTORY[hi][0] - BTC_HISTORY[lo][0] || 1);
  return Math.log(BTC_HISTORY[lo][1]) + (Math.log(BTC_HISTORY[hi][1]) - Math.log(BTC_HISTORY[lo][1])) * f;
};
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
      {fut != null && <div>BTC analog: <b style={{ fontFamily: MONO, color: "#f7931a" }}>{fP(fut)}</b></div>}
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
    const SPX0 = new Date(src[0].date).getTime();
    const spxPts = src.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), ln: Math.log(r.price) }));
    const spxMaxAge = spxPts.at(-1).age, spxNow = src.at(-1).price;
    const spxLnAt = a => {
      if (a <= spxPts[0].age) return spxPts[0].ln; if (a >= spxMaxAge) return spxPts.at(-1).ln;
      let lo = 0, hi = spxPts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (spxPts[m].age <= a) lo = m; else hi = m; }
      const f = (a - spxPts[lo].age) / (spxPts[hi].age - spxPts[lo].age || 1);
      return spxPts[lo].ln + (spxPts[hi].ln - spxPts[lo].ln) * f;
    };
    const btcDay = age => SHIFT + age * SCALE;
    const lnBtcNow = btcLnAt(btcDay(spxMaxAge)), lnSpxNow = Math.log(spxNow);
    // Asymmetric: amplify BTC's deviation from today's level by BETA_UP when BTC
    // is above today (upside) and the gentler BETA_DOWN when below (SPX is already
    // near its floor). Continuous at today, where the deviation is 0.
    const proj = (age, bUp) => { const z = btcLnAt(btcDay(age)) - lnBtcNow; return Math.exp(lnSpxNow + (z >= 0 ? bUp : BETA_DOWN) * z); };

    // correlation (shape)
    const xs = [], ys = [];
    for (const p of spxPts) { const bd = btcDay(p.age); if (bd >= 0 && bd <= btcMaxAge) { xs.push(p.ln); ys.push(btcLnAt(bd)); } }
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const r = sxy / Math.sqrt(sxx * syy);

    const futCap = FUT_YEARS * 365.25, data = [];
    for (let age = 0; age <= futCap; age += 7) {
      const bd = btcDay(age), valid = bd >= 0 && bd <= btcMaxAge, ahead = age >= spxMaxAge;
      const e = edgesAt(age);
      const row = {
        ts: SPX0 + age * DAY,
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        btcFut: valid && ahead ? proj(age, BETA_UP) : null,
      };
      for (let i = 0; i < 9; i++) row["rb" + i] = [e[i], e[i + 1]]; // rainbow band fills
      data.push(row);
    }
    let peak = { p: 0, age: 0 };
    for (let age = spxMaxAge; age <= futCap; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, BETA_UP); if (pv > peak.p) peak = { p: pv, age }; }
    let low = { p: Infinity, age: 0 };
    for (let age = spxMaxAge; age <= spxMaxAge + 1000; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, BETA_UP); if (pv < low.p) low = { p: pv, age }; }
    const peakLo = proj(peak.age, BETA_UP - SPREAD), peakHi = proj(peak.age, BETA_UP + SPREAD);
    const todayBtc = new Date(BTC0 + btcDay(spxMaxAge) * DAY);
    const peakDate = new Date(SPX0 + peak.age * DAY), lowDate = new Date(SPX0 + low.age * DAY);
    return { data, stats: { r, spxNow, peak, peakLo, peakHi, peakDate, low, lowDate, todayTs: SPX0 + spxMaxAge * DAY, todayBtc } };
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
          {BAND_COLORS.map((c, i) => (
            <Area key={i} dataKey={"rb" + i} stroke="none" fill={c} fillOpacity={0.22} isAnimationActive={false} connectNulls />
          ))}
          {HALVINGS.map((h, i) => (
            <ReferenceLine key={i} x={h} stroke="rgba(255,255,255,0.22)" label={{ value: "Halving", fill: "#94a3b8", fontSize: 11, position: "insideBottomLeft", angle: -90, offset: 8 }} />
          ))}
          <ReferenceLine x={stats.todayTs} stroke="#e2e8f0" strokeDasharray="4 5" strokeOpacity={0.6} label={{ value: "TODAY", fill: "#e2e8f0", fontSize: 12, position: "insideTopRight" }} />
          <Line dataKey="btcFut" stroke="#f8fafc" strokeWidth={2.2} strokeDasharray="7 6" dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="spx" stroke="#0b0b14" strokeWidth={4.2} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="spx" stroke="#f8fafc" strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        <b style={{ color: "#f8fafc" }}>━</b> SPX6900 actual &nbsp;·&nbsp; <b style={{ color: "#f8fafc" }}>┄</b> projected on Bitcoin's 4-year cycle &nbsp;·&nbsp; the rainbow is SPX's own valuation bands (<span style={{ color: "#3b82f6" }}>fire-sale</span> → <span style={{ color: "#ef4444" }}>bubble</span>).
        <br />Timing tracks BTC's halving cycle — a bottom around <b style={{ color: "#cbd5e1" }}>{stats.lowDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (~{fP(stats.low.p)})</b>, a 2027-28 bull, then a possible top near <b style={{ color: "#cbd5e1" }}>{fP(stats.peak.p)}</b> around {stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}. Size reflects SPX's youth (it bulls harder than mature BTC). A for-fun <i>what-if</i>, NOT a forecast or financial advice.
      </div>
    </div>
  );
}
