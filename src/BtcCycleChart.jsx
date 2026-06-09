// "If SPX keeps rhyming with Bitcoin, here's the road ahead." A prescribed path
// painted from NOW on Bitcoin's 4-year halving cycle: timing tracks the halving
// clock, magnitude carries SPX's youth premium. The anchor is fixed at the last
// bundled point, so as live price prints it runs freely against the painted path —
// if the theory holds, it should follow it. For-fun what-if, not a forecast.
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { DEFAULT_RAW } from "./data.js";
import { BTC_HISTORY } from "./btc-history.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400, DAY = 86400000, YR = 365.25;
// SPX maps onto BTC's 2019–22 cycle (the matching post-halving cycle) at 1:1 tempo →
// bottom ~late 2026, bull 2027-28, next top ~mid-2029. β_up = youth premium (SPX
// bulls harder than mature BTC); β_down gentle (SPX already near its floor).
const SHIFT = 3395, SCALE = 1.0, BETA_UP = 3.7, BETA_DOWN = 0.6, SPREAD = 0.3, FUT_YEARS = 6.5;

const btcMaxAge = BTC_HISTORY.at(-1)[0];
const btcLnAt = a => {
  if (a <= BTC_HISTORY[0][0]) return Math.log(BTC_HISTORY[0][1]);
  if (a >= btcMaxAge) return Math.log(BTC_HISTORY.at(-1)[1]);
  let lo = 0, hi = BTC_HISTORY.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (BTC_HISTORY[m][0] <= a) lo = m; else hi = m; }
  const f = (a - BTC_HISTORY[lo][0]) / (BTC_HISTORY[hi][0] - BTC_HISTORY[lo][0] || 1);
  return Math.log(BTC_HISTORY[lo][1]) + (Math.log(BTC_HISTORY[hi][1]) - Math.log(BTC_HISTORY[lo][1])) * f;
};
const HALVINGS = ["2024-04-20", "2028-04-15"].map(d => new Date(d).getTime());
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMonY = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fP = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4);

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const get = k => payload.find(p => p.dataKey === k)?.value;
  const spx = get("spx"), proj = get("proj");
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>{fMonY(label)}</div>
      {spx != null && <div>SPX6900: <b style={{ fontFamily: MONO, color: "#f8fafc" }}>{fP(spx)}</b></div>}
      {proj != null && <div>BTC-cycle path: <b style={{ fontFamily: MONO, color: "#a78bfa" }}>{fP(proj)}</b></div>}
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
    // FIXED anchor at the last bundled point — the path is painted here once; live
    // price prints beyond it and runs freely against the path.
    const anchorAge = Math.round((new Date(DEFAULT_RAW.at(-1).date).getTime() - SPX0) / DAY);
    const anchorLn = Math.log(DEFAULT_RAW.at(-1).price);
    const btcDay = age => SHIFT + age * SCALE;
    const lnBtcAnchor = btcLnAt(btcDay(anchorAge));
    const proj = (age, bUp) => { const z = btcLnAt(btcDay(age)) - lnBtcAnchor; return Math.exp(anchorLn + (z >= 0 ? bUp : BETA_DOWN) * z); };

    // shape match over SPX's full history
    let sxy = 0, sxx = 0, syy = 0;
    const xs = spxPts.map(p => p.ln), ys = spxPts.map(p => btcLnAt(btcDay(p.age)));
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const r = sxy / Math.sqrt(sxx * syy);

    const futCap = FUT_YEARS * YR, data = [];
    for (let age = 0; age <= futCap; age += 7) {
      const bd = btcDay(age), valid = bd >= 0 && bd <= btcMaxAge, ahead = age >= anchorAge;
      data.push({
        ts: SPX0 + age * DAY,
        spx: age <= spxMaxAge ? Math.exp(spxLnAt(age)) : null,
        proj: valid && ahead ? proj(age, BETA_UP) : null,
        cone: valid && ahead ? [proj(age, BETA_UP - SPREAD), proj(age, BETA_UP + SPREAD)] : null,
      });
    }
    let peak = { p: 0, age: 0 };
    for (let age = anchorAge; age <= futCap; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, BETA_UP); if (pv > peak.p) peak = { p: pv, age }; }
    let low = { p: Infinity, age: 0 };
    for (let age = anchorAge; age <= anchorAge + 1100; age += 7) { const bd = btcDay(age); if (bd < 0 || bd > btcMaxAge) continue; const pv = proj(age, BETA_UP); if (pv < low.p) low = { p: pv, age }; }
    return {
      data,
      stats: { r, peak, low, peakDate: new Date(SPX0 + peak.age * DAY), lowDate: new Date(SPX0 + low.age * DAY), nowTs: SPX0 + anchorAge * DAY },
    };
  }, [series]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 22 : 48, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Stat k="SHAPE MATCH (r)" v={stats.r.toFixed(2)} c="#4ade80" isMobile={isMobile} />
        <Stat k="PROJECTED LOW" v={fP(stats.low.p)} c="#38bdf8" isMobile={isMobile} />
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
          <ReferenceLine x={stats.nowTs} stroke="#64748b" strokeDasharray="4 5" label={{ value: "NOW", fill: "#94a3b8", fontSize: 12, position: "insideTopRight" }} />
          <Area dataKey="cone" stroke="none" fill="#a78bfa" fillOpacity={0.13} isAnimationActive={false} activeDot={false} connectNulls />
          <Line dataKey="proj" stroke="#a78bfa" strokeWidth={2.2} strokeDasharray="7 6" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="spx" stroke="#f8fafc" strokeWidth={2.6} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        <span style={{ color: "#f8fafc" }}>━</span> SPX6900 live &nbsp;·&nbsp; <span style={{ color: "#a78bfa" }}>┄</span> prescribed BTC-cycle path (shaded = scenario range).
        <br />Painted from <b style={{ color: "#cbd5e1" }}>{fMonY(stats.nowTs)}</b> on Bitcoin's halving cycle — from here the live price runs free; if the rhyme holds it tracks the dashed path: a bottom around <b style={{ color: "#cbd5e1" }}>{stats.lowDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (~{fP(stats.low.p)})</b>, a 2027-28 bull, then a top near <b style={{ color: "#cbd5e1" }}>{fP(stats.peak.p)}</b> by {stats.peakDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}. A for-fun <i>what-if</i>, NOT a forecast or financial advice.
      </div>
    </div>
  );
}
