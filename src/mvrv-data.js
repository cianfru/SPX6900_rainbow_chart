// Shared MVRV history builder. Merges the owner-provided Dune realized-price
// reconstruction (SPX_MVRV, launch→2026-07) with our daily price line so
// MVRV = price / realized has full launch-era history, then lets the live daily
// HolderScan snapshots (history.json: price `p` + break-even `be`) win on the recent
// tail — they align (~$0.55) so the join is seamless.
//
// ⚠ PASS `densePrice` (price-history.json) WHENEVER YOU HAVE IT. SPX_DAILY is the
// bundled CoinGecko export and its prints are mis-levelled through the 2026 drawdown:
// 2026-03-24 reads $0.558 against a true $0.298, snapping back four days later. In the
// numerator of MVRV that is an 87% spike and a vertical cliff, and it carries into the
// mvrv page, NUPL, the Bitcoin comparison and the valuation composite's MVRV lens.
// price-history.json is the CI-cleaned dense series and wins wherever it reaches;
// SPX_DAILY stays as the launch-era fallback. Same lesson as the cexflow card.
//
// Returns [{ date, ts, p, be }] sorted ascending; MVRV = p / be.
import { DEFAULT_RAW } from "./data.js";
import { SPX_DAILY } from "./spx-daily.js";
import { SPX_MVRV } from "./spx-mvrv.js";

export function mvrvHistory(snapshotHistory, densePrice) {
  const priceBy = new Map(DEFAULT_RAW.map(r => [r.date, r.price]));
  for (const [d, p] of SPX_DAILY) if (p > 0) priceBy.set(d, p); // dense daily over weekly
  // CI-cleaned dense series overrides the bundle wherever it reaches.
  for (const r of (densePrice || [])) {
    const d = r?.date ?? r?.d ?? (Array.isArray(r) ? r[0] : null);
    const v = +(r?.price ?? r?.p ?? (Array.isArray(r) ? r[1] : NaN));
    if (d && v > 0) priceBy.set(d, v);
  }

  const byDate = new Map();
  // Dune realized-price backfill, priced off our own daily line for consistency.
  for (const [d, realized] of SPX_MVRV) {
    const p = priceBy.get(d);
    if (p > 0 && realized > 0) byDate.set(d, { date: d, ts: Date.parse(d), p, be: realized });
  }
  // Live snapshots win on overlap (fresher price + HolderScan cost basis).
  for (const r of (snapshotHistory || [])) {
    if (r?.d && r.be > 0 && r.p > 0) byDate.set(r.d, { date: r.d, ts: Date.parse(r.d), p: r.p, be: r.be });
  }
  return [...byDate.values()].sort((a, b) => a.ts - b.ts);
}
