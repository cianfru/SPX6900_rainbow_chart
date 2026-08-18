// COHORT ROI — "which whale size band actually made money." For every wallet, reconstruct lifetime
// average-cost P&L from the city time-machine timeline (weekly net balances) + a daily price series,
// then bucket wallets by their CURRENT size into the same ten bands the Whale Spectrum uses, and score
// each band by how many of its wallets are in profit and the typical multiple they're sitting on.
//
// PURE (no node deps) so the build script, the site "Returns" view and the card all share one impl.
//
// ⚠ HONESTY — two caveats that ride on every surface:
//  1. SURVIVORSHIP / it's partly circular. A wallet is IN the 9M band largely BECAUSE it did well —
//     becoming a whale requires having bought early and cheap, and wallets that dumped to zero left
//     their band entirely. So "big bands are more profitable" is a scoreboard of survivors, not a
//     strategy you can copy. Say it.
//  2. Average-cost accounting on WEEKLY net balances: intra-week round-trips are invisible and a
//     falling balance is treated as a sale at that week's price. An approximation, not tax-grade P&L.
import { SPECTRUM_EDGES, SPECTRUM_LABELS, balAt } from "./whale-spectrum.js";

// price-at-time from a [{date,price}] series (forward-filled).
function mkPriceAt(prices) {
  const px = (Array.isArray(prices) ? prices : [])
    .map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0)
    .sort((a, b) => a.t - b.t);
  return (t) => { if (!px.length) return 0; let b = px[0].p; for (const r of px) { if (r.t <= t) b = r.p; else break; } return b; };
}

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cohortOf = (bal) => { for (let i = 0; i < SPECTRUM_EDGES.length - 1; i++) if (bal >= SPECTRUM_EDGES[i] && bal < SPECTRUM_EDGES[i + 1]) return i; return -1; };

// cohortRoi(tl, prices, {minBal}) → { updated, price, total, pctProfit, cohorts:[{label,lo,hi,n,pctProfit,
//   medMult,banked,held,spent,aggMult}] }. minBal is the residency floor (≥100k = the whale spectrum set).
export function cohortRoi(tl, prices, opts = {}) {
  const minBal = opts.minBal ?? 1e5;
  const week0 = Date.parse(tl.week0), W = tl.n - 1, DAY = 864e5;
  const priceAt = mkPriceAt(prices), pAtWk = (wk) => priceAt(week0 + wk * DAY * 7);
  const price = pAtWk(W);

  const B = SPECTRUM_LABELS.map((label, i) => ({ label, lo: SPECTRUM_EDGES[i], hi: SPECTRUM_EDGES[i + 1], n: 0, nProfit: 0, mult: [], banked: 0, held: 0, spent: 0 }));
  let total = 0, totalProfit = 0;

  for (const w of tl.wallets) {
    let pos = 0, avg = 0, realized = 0, spent = 0, prev = 0;
    for (const [wk, bal] of w.p) {
      const d = bal - prev, pr = pAtWk(wk);
      if (d > 0) { avg = (avg * pos + d * pr) / (pos + d); pos += d; spent += d * pr; }   // buy → weighted avg cost
      else if (d < 0) { realized += (-d) * (pr - avg); pos += d; }                          // sell → bank vs avg cost
      prev = bal;
    }
    const now = balAt(w, W);
    const ci = cohortOf(now);
    if (ci < 0 || now < minBal || spent <= 0) continue;
    const unreal = now * (price - avg);                 // paper P&L on the current bag
    const inProfit = (realized + unreal) > 0;
    const mult = (realized + now * price) / spent;      // (banked + current value) ÷ invested; 1 = breakeven
    const c = B[ci];
    c.n++; total++; if (inProfit) { c.nProfit++; totalProfit++; }
    c.mult.push(mult); c.banked += realized; c.held += now * price; c.spent += spent;
  }

  const cohorts = B.map(c => ({
    label: c.label, lo: c.lo, hi: Number.isFinite(c.hi) ? c.hi : null, n: c.n,
    pctProfit: c.n ? +(100 * c.nProfit / c.n).toFixed(1) : 0,
    medMult: c.n ? +median(c.mult).toFixed(2) : 0,
    banked: Math.round(c.banked), held: Math.round(c.held), spent: Math.round(c.spent),
    aggMult: c.spent > 0 ? +((c.banked + c.held) / c.spent).toFixed(2) : 0,
  }));

  return {
    updated: tl.updated || null, price: +price.toFixed(6), minBal,
    total, pctProfit: total ? +(100 * totalProfit / total).toFixed(1) : 0,
    cohorts,
  };
}
