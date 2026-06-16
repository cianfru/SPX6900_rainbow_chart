// "What if SPX6900 traces Bitcoin's last cycle?" — overlay the REAL BTC price
// path (BTC_HISTORY) forward from today, anchored at SPX's current price and
// scaled by an amplitude beta. Shared by the website BTC Cycle tab and the bot's
// cycle posts so they always agree (same role as models.js).
//
// Alignment (best-fit): SPX's launch ≈ BTC 2019-10, so today ≈ BTC 2022-08 and
// the projection rides BTC's real 2022→2025 run. beta = how hard SPX swings vs
// BTC (SPX has historically been ~3x as volatile); the cone is beta ± spread.
import { DEFAULT_RAW } from "./data.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "./btc-history.js";

const DAY = 86400000, YR = 365.25;
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const BTC_MAX_AGE = BTC_HISTORY.at(-1)[0];

// Tunables. beta drives the projected top (~$85–90 base, ≈$49–$158 cone).
export const BTC_CYCLE = { shift: 3395, scale: 1.0, beta: 3.4, spread: 0.35 };

// log-price of BTC at a given BTC "age" (days since BTC genesis), interpolated.
function btcLnAt(a) {
  const pts = BTC_HISTORY;
  if (a <= pts[0][0]) return Math.log(pts[0][1]);
  if (a >= pts.at(-1)[0]) return Math.log(pts.at(-1)[1]);
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= a) lo = m; else hi = m; }
  const f = (a - pts[lo][0]) / ((pts[hi][0] - pts[lo][0]) || 1);
  return Math.log(pts[lo][1]) + (Math.log(pts[hi][1]) - Math.log(pts[lo][1])) * f;
}

// Project forward, anchored at the last bundled SPX point (kept frozen so the
// path is stable). Returns weekly [ts, price] arrays for the central path and the
// bear/bull cone, plus peak/low/anchor summary — same shape the bot posts expect.
export function btcCycleProjection(opts = {}) {
  const { shift, scale, beta, spread } = { ...BTC_CYCLE, ...opts };
  const anchor = DEFAULT_RAW.at(-1);
  const anchorAge = Math.round((new Date(anchor.date).getTime() - SPX0) / DAY);
  const lnSpxNow = Math.log(anchor.price);
  const btcDay = age => shift + age * scale;
  const lnBtcNow = btcLnAt(btcDay(anchorAge));
  const projB = (age, b) => Math.exp(lnSpxNow + b * (btcLnAt(btcDay(age)) - lnBtcNow));
  const bLo = Math.max(0.3, beta - spread), bHi = beta + spread;
  // Don't project past the end of BTC history.
  const endAge = Math.min(7 * YR, (BTC_MAX_AGE - shift) / scale);

  const projPts = [], projLo = [], projHi = [];
  for (let age = anchorAge; age <= endAge; age += 7) {
    const ts = SPX0 + age * DAY;
    projPts.push([ts, projB(age, beta)]);
    projLo.push([ts, projB(age, bLo)]);
    projHi.push([ts, projB(age, bHi)]);
  }
  let peak = { p: 0, age: anchorAge };
  for (let age = anchorAge; age <= endAge; age += 2) { const pv = projB(age, beta); if (pv > peak.p) peak = { p: pv, age }; }
  let low = { p: Infinity, age: anchorAge };
  for (let age = anchorAge; age < peak.age; age += 2) { const pv = projB(age, beta); if (pv < low.p) low = { p: pv, age }; }

  return {
    projPts, projLo, projHi,
    peak: peak.p, peakTs: SPX0 + peak.age * DAY,
    peakLo: projB(peak.age, bLo), peakHi: projB(peak.age, bHi),
    low: low.p, lowTs: SPX0 + low.age * DAY,
    anchorTs: SPX0 + anchorAge * DAY, anchorPrice: anchor.price,
    btcFrom: new Date((new Date(BTC_FIRST_DATE).getTime()) + btcDay(anchorAge) * DAY),
  };
}
