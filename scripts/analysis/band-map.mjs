// Research: does BTC's POSITION WITHIN ITS OWN RAINBOW predict SPX's position in
// its rainbow? Builds a BTC offset-power-law rainbow with the same methodology as
// SPX's (models.js), normalizes both prices to a band coordinate u (0 = fire-sale
// edge, 1 = max-bubble edge), aligns the two series on the halving-cycle shift,
// and measures fit. Then projects: SPX future price = SPX bands evaluated at
// BTC's analog band-position. Dimensionless — no beta/amplitude hand-tuning.
import { DEFAULT_RAW } from "../../src/data.js";
import { buildModel, dayN } from "../../src/models.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "../../src/btc-history.js";

const DAY = 86400000, YR = 365.25;

// ---------- BTC rainbow (same method: ln P = a ln(t + t0) + b, percentile bands)
function fitBtcRainbow() {
  const pts = BTC_HISTORY.map(([age, p]) => ({ day: Math.max(1, age), lnP: Math.log(p) }));
  let best = { ss: Infinity };
  for (let t0 = 0; t0 <= 1500; t0 += 25) {
    let Sx = 0, Sy = 0, Sxx = 0, Sxy = 0; const N = pts.length;
    for (const p of pts) { const x = Math.log(p.day + t0); Sx += x; Sy += p.lnP; Sxx += x * x; Sxy += x * p.lnP; }
    const a = (N * Sxy - Sx * Sy) / (N * Sxx - Sx * Sx), b = (Sy - a * Sx) / N;
    let ss = 0; for (const p of pts) { const e = p.lnP - (a * Math.log(p.day + t0) + b); ss += e * e; }
    if (ss < best.ss) best = { ss, t0, a, b };
  }
  // refine
  for (let t0 = Math.max(0, best.t0 - 25); t0 <= best.t0 + 25; t0 += 1) {
    let Sx = 0, Sy = 0, Sxx = 0, Sxy = 0; const N = pts.length;
    for (const p of pts) { const x = Math.log(p.day + t0); Sx += x; Sy += p.lnP; Sxx += x * x; Sxy += x * p.lnP; }
    const a = (N * Sxy - Sx * Sy) / (N * Sxx - Sx * Sx), b = (Sy - a * Sx) / N;
    let ss = 0; for (const p of pts) { const e = p.lnP - (a * Math.log(p.day + t0) + b); ss += e * e; }
    if (ss < best.ss) best = { ss, t0, a, b };
  }
  const { t0, a, b } = best;
  const predict = day => a * Math.log(day + t0) + b;
  const resid = pts.map(p => p.lnP - predict(p.day)).sort((x, y) => x - y);
  const N = resid.length;
  const pct = p => { const i = p * (N - 1), lo = Math.floor(i), hi = Math.ceil(i); return resid[lo] + (resid[hi] - resid[lo]) * (i - lo); };
  const bands = [pct(0.02), pct(0.07), pct(0.16), pct(0.30), pct(0.50), pct(0.70), pct(0.84), pct(0.93), pct(0.98), pct(0.995)];
  // R^2
  const meanY = pts.reduce((s, p) => s + p.lnP, 0) / N;
  const ssTot = pts.reduce((s, p) => s + (p.lnP - meanY) ** 2, 0);
  return { t0, a, b, predict, bands, r2: 1 - best.ss / ssTot };
}

const btcM = fitBtcRainbow();
console.log(`BTC rainbow: ln P = ${btcM.a.toFixed(2)} ln(t+${btcM.t0}) ${btcM.b >= 0 ? "+" : "−"} ${Math.abs(btcM.b).toFixed(2)}  R²=${btcM.r2.toFixed(3)}  bandspan=[${btcM.bands[0].toFixed(2)}, ${btcM.bands[8].toFixed(2)}]`);

const spxM = buildModel(DEFAULT_RAW);
console.log(`SPX rainbow: R²=${spxM.r2.toFixed(3)}  bandspan=[${spxM.bands[0].toFixed(2)}, ${spxM.bands[8].toFixed(2)}]`);

// ---------- band coordinate u: 0 at band[0] (fire-sale), 1 at band[8] (max bubble)
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
const uBtc = age => (btcLnAt(age) - btcM.predict(Math.max(1, age)) - btcM.bands[0]) / (btcM.bands[8] - btcM.bands[0]);
const uSpxOf = (lnP, day) => (lnP - spxM.predict(day) - spxM.bands[0]) / (spxM.bands[8] - spxM.bands[0]);

// SPX series in u-space
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const spxU = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), u: uSpxOf(Math.log(r.price), dayN(r.date)) }));
const spxMaxAge = spxU.at(-1).age;

// ---------- search the best shift for the BAND-POSITION overlay (scale 1:1 first)
function uCorr(shift, scale) {
  const xs = [], ys = [];
  for (const p of spxU) { const bd = shift + p.age * scale; if (bd < 0 || bd > btcMaxAge) return null; xs.push(p.u); ys.push(uBtc(bd)); }
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  // also mean abs gap and today's gap (continuity)
  let gap = 0; for (let i = 0; i < n; i++) gap += Math.abs(xs[i] - ys[i]); gap /= n;
  return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / syy, gap, uSpxNow: xs[n - 1], uBtcNow: ys[n - 1] };
}

console.log("\n— band-position overlay (u vs u), scale 1.0, shift scan —");
let bestU = { r: -2 };
for (let s = 2800; s <= 4200; s += 25) { const c = uCorr(s, 1.0); if (c && c.r > bestU.r) bestU = { shift: s, ...c }; }
console.log(`best shift ${bestU.shift}: r=${bestU.r.toFixed(3)} slope=${bestU.slope.toFixed(2)} meanGap=${bestU.gap.toFixed(3)}`);
const c3395 = uCorr(3395, 1.0);
console.log(`halving shift 3395:  r=${c3395.r.toFixed(3)} slope=${c3395.slope.toFixed(2)} meanGap=${c3395.gap.toFixed(3)}`);
console.log(`today: SPX u=${c3395.uSpxNow.toFixed(3)} vs BTC-analog u=${c3395.uBtcNow.toFixed(3)}  (continuity gap ${(c3395.uSpxNow - c3395.uBtcNow).toFixed(3)})`);

// ---------- projection via band mapping at the chosen shift
function project(shift, scale, label) {
  const c = uCorr(shift, scale);
  const dt = a => new Date(SPX0 + a * DAY).toISOString().slice(0, 7);
  let pk = { p: 0, age: 0 }, low = { p: 1e9, age: 0 };
  for (let age = spxMaxAge; age <= 6.5 * YR; age += 3) {
    const bd = shift + age * scale; if (bd > btcMaxAge) break;
    const u = uBtc(bd);
    const lnP = spxM.predict(age + 1) + spxM.bands[0] + u * (spxM.bands[8] - spxM.bands[0]);
    const p = Math.exp(lnP);
    if (p > pk.p) pk = { p, age, u };
    if (age < spxMaxAge + 1100 && p < low.p) low = { p, age, u };
  }
  console.log(`${label}: r=${c.r.toFixed(2)} | low $${low.p.toFixed(3)} (${dt(low.age)}, u=${low.u.toFixed(2)}) | peak $${pk.p.toFixed(2)} (${dt(pk.age)}, u=${pk.u.toFixed(2)})`);
}
console.log("\n— projections (no beta, pure band mapping) —");
project(3395, 1.0, "halving 3395");
project(bestU.shift, 1.0, `best ${bestU.shift}`);
