// WHEN THE WHALES BOUGHT — for every wallet ≥100k SPX, reconstruct its buy-weighted entry (when its
// coins actually arrived + the average price paid) and whether the bag is in profit now. The reveal:
// today's whale base is NOT a club of early buyers — a dozen early giants aside, most built big
// bags LATE, near the 2025 highs, and sit underwater. Plotted as bubbles on the SPX price curve at
// the point each whale bought, this shows at a glance.
//
// PURE (no node deps) — shared by the build script, the card and the site chart. See caveats: average-
// cost on weekly ETH balances; current ≥100k holders only (early buyers who sold are gone → survivorship).
import { balAt, SPECTRUM_EDGES } from "./whale-spectrum.js";

function mkPriceAt(prices) {
  const px = (Array.isArray(prices) ? prices : []).map(r => ({ t: Date.parse(r.date), p: +r.price }))
    .filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  return { at: (t) => { if (!px.length) return 0; let b = px[0].p; for (const r of px) { if (r.t <= t) b = r.p; else break; } return b; }, px };
}
const cohortOf = (bal) => { for (let i = 0; i < SPECTRUM_EDGES.length - 1; i++) if (bal >= SPECTRUM_EDGES[i] && bal < SPECTRUM_EDGES[i + 1]) return i; return -1; };

export function whaleEntries(tl, prices, opts = {}) {
  const minBal = opts.minBal ?? 1e5;
  const week0 = Date.parse(tl.week0), W = tl.n - 1, DAY = 864e5;
  const { at: priceAt, px } = mkPriceAt(prices);
  const wkT = (wk) => week0 + wk * 7 * DAY, pAtWk = (wk) => priceAt(wkT(wk));
  const price = pAtWk(W);
  const launchT = px.length ? px[0].t : week0;

  const whales = [];
  let early = 0, late = 0, profit = 0;
  for (const w of tl.wallets) {
    let pos = 0, avg = 0, realized = 0, spent = 0, prev = 0, firstBuyWk = -1, boughtQty = 0, boughtWkSum = 0;
    for (const [wk, bal] of w.p) {
      const d = bal - prev, pr = pAtWk(wk);
      if (d > 0) { avg = (avg * pos + d * pr) / (pos + d); pos += d; spent += d * pr; boughtQty += d; boughtWkSum += d * wk; if (firstBuyWk < 0) firstBuyWk = wk; }
      else if (d < 0) { realized += (-d) * (pr - avg); pos += d; }
      prev = bal;
    }
    const now = balAt(w, W);
    if (cohortOf(now) < 0 || now < minBal || spent <= 0 || boughtQty <= 0) continue;
    // COIN-weighted entry week — matches the coin-weighted avg cost on the y-axis, so a bubble's
    // (date, price) is a single coherent point (its average coin) that sits on the price curve. Using
    // dollar-weighting here instead made barbell buyers (many cheap coins early, few pricey coins late)
    // float below the curve — plotted late but priced low.
    const entryWk = Math.round(boughtWkSum / boughtQty);
    // colour = is the bag they still hold above water — average cost below today's price. This keeps the
    // card self-consistent ("below the line = green") since position is that same average cost. It's an
    // on-current-bag lens; realized gains from earlier sells aren't credited here (stated in the caveat).
    const inProfit = avg < price;
    const firstT = wkT(Math.max(0, firstBuyWk));
    const daysIn = (firstT - launchT) / DAY;
    if (daysIn <= 365) early++; else late++;
    if (inProfit) profit++;
    whales.push({
      a: w.a,                          // wallet address (site chart → Zerion; card ignores it)
      t: wkT(entryWk),                 // entry date (ms) → x
      cost: +avg.toFixed(6),           // avg price paid → y (sits on the curve)
      bag: Math.round(now),            // current balance → bubble size
      roi: spent > 0 ? +((realized + now * price) / spent).toFixed(2) : 0,
      up: inProfit,
    });
  }
  whales.sort((a, b) => b.bag - a.bag);   // biggest last-drawn on top handled by renderer; keep sorted

  // downsampled price curve for the backdrop (weekly is plenty, keeps the JSON small)
  const step = Math.max(1, Math.floor(px.length / 260));
  const curve = [];
  for (let i = 0; i < px.length; i += step) curve.push([px[i].t, +px[i].p.toFixed(6)]);
  if (px.length) curve.push([px.at(-1).t, +px.at(-1).p.toFixed(6)]);

  const total = whales.length;
  return {
    updated: tl.updated || null, price: +price.toFixed(6),
    total, pctProfit: total ? +(100 * profit / total).toFixed(1) : 0,
    pctEarly: total ? +(100 * early / total).toFixed(1) : 0,
    pctLate: total ? +(100 * late / total).toFixed(1) : 0,
    launch: launchT, now: px.length ? px.at(-1).t : wkT(W),
    curve, whales,
  };
}
