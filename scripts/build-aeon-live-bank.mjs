// ============================================================================
// PROJECT AEON — bank the live Alchemy sales (snapshot-forward, zero Dune credits)
// ============================================================================
// The Dune pull is WEEKLY, because what it reconstructs from full history — holder age,
// concentration, holder flow, trader P&L — moves in months. But three things DO move
// daily and were going stale between pulls:
//
//   • daily volume + sale counts (the floor & sales chart)
//   • the MARKET LEVEL, which sets fair value — and fair value drives both the listings
//     verdict and the notable-sale alert threshold
//   • MVRV / supply-in-profit
//
// So this banks each day's sales from Alchemy into an append-only file, and the sales +
// market builders splice that tail onto the Dune baseline. Same snapshot-forward pattern
// the repo already uses for chain-wallets and cex-flow: Dune owns the deep history, a
// free live feed carries the recent edge.
//
//   node scripts/build-aeon-live-bank.mjs
//
// ENV: ALCHEMY_KEY. No key → soft-skip. Never throws: a bad run must not break the banker.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { fetchLiveSales } from "./bot/aeon-live-sales.mjs";

const OUT = "public/aeon-live-sales.json";
const KEEP_DAYS = 120;                  // enough to cover any plausible Dune outage
const HOURS = Number(process.env.AEON_LIVE_HOURS || 72);   // overlap so nothing slips through

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

/**
 * Merge freshly-fetched sales into the bank. Dedupe key is tx@token — one token can
 * legitimately trade twice in a day, but never twice in the same transaction.
 * Pure + unit-tested.
 */
export function mergeBank(existing, fresh, { keepDays = KEEP_DAYS, nowMs = Date.now() } = {}) {
  const byKey = new Map();
  for (const s of [...(existing || []), ...(fresh || [])]) {
    if (!(s?.price > 0) || s.id == null) continue;
    byKey.set(`${s.tx || s.ts}@${s.id}`, s);
  }
  const cutoff = nowMs - keepDays * 86400e3;
  return [...byKey.values()]
    .filter(s => (s.ts ?? Date.parse(s.d)) >= cutoff)
    .sort((a, b) => (a.ts ?? Date.parse(a.d)) - (b.ts ?? Date.parse(b.d)));
}

async function main() {
  const key = (process.env.ALCHEMY_KEY || "").trim();
  if (!key) { console.log("aeon-live-bank: no ALCHEMY_KEY — soft-skipping"); return; }
  const prev = readJson(OUT, { sales: [] });
  const fresh = await fetchLiveSales({ key, hours: HOURS });
  const sales = mergeBank(prev.sales, fresh);
  const added = sales.length - (prev.sales?.length || 0);
  writeFileSync(OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10), source: "alchemy-getNFTSales",
    windowHours: HOURS, keepDays: KEEP_DAYS, count: sales.length, sales,
  }) + "\n");
  const last = sales[sales.length - 1];
  console.log(`aeon-live-bank: ${fresh.length} fetched (${HOURS}h) · bank now ${sales.length} sales`
    + (added > 0 ? ` (+${added} new)` : " (no new)")
    + (last ? ` · newest #${last.id} ${last.price}Ξ ${last.d}` : ""));
}

main().catch(e => console.error("aeon-live-bank: failed (bank left as-is) —", e.message));
