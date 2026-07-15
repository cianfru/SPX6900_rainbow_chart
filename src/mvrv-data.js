// Shared MVRV history builder. Merges the owner-provided Dune realized-price
// reconstruction (SPX_MVRV, launch→2026-07) with our dense daily price line
// (SPX_DAILY over DEFAULT_RAW) so MVRV = price / realized has full launch-era
// history, then lets the live daily HolderScan snapshots (history.json: price `p`
// + break-even `be`) win on the recent tail — they align (~$0.55) so the join is
// seamless. Returns [{ date, ts, p, be }] sorted ascending; MVRV = p / be.
import { DEFAULT_RAW } from "./data.js";
import { SPX_DAILY } from "./spx-daily.js";
import { SPX_MVRV } from "./spx-mvrv.js";

export function mvrvHistory(snapshotHistory) {
  const priceBy = new Map(DEFAULT_RAW.map(r => [r.date, r.price]));
  for (const [d, p] of SPX_DAILY) if (p > 0) priceBy.set(d, p); // dense daily over weekly

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
