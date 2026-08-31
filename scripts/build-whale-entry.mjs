// Build public/whale-entry.json — "when the whales bought." Reconstructs each ≥100k wallet's
// buy-weighted entry (date × average price) + whether its bag is above water, off the committed
// timeline + price history. Keyless, $0 — a step in onchain-dune.yml after the timeline rebuild.
//   node scripts/build-whale-entry.mjs --in=public/spx-timeline.json --prices=public/price-history.json --out=public/whale-entry.json
import { readFileSync, writeFileSync } from "node:fs";
import { whaleEntries } from "../src/whale-entry.js";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

const tl = JSON.parse(readFileSync(arg("in", "public/spx-timeline.json"), "utf8"));
const prices = JSON.parse(readFileSync(arg("prices", "public/price-history.json"), "utf8"));
const out = arg("out", "public/whale-entry.json");
const lotsOut = arg("lots", "public/whale-lots.json");

const res = whaleEntries(tl, prices, { minBal: Number(arg("minBal", "100000")), withLots: true });
const lots = res.lots || [];
delete res.lots;                         // orbs feed (whale-entry.json) stays lean — no per-wallet lots
writeFileSync(out, JSON.stringify(res));
// Per-wallet buy/sell detail for the per-wallet page — SAME shape as smart-money.json's wallets[], so
// WalletDetail can search it identically. Members-only (addresses): pushed to KV + stripped from public.
writeFileSync(lotsOut, JSON.stringify({ updated: res.updated, price: res.price, wallets: lots }));
console.log(`Wrote ${out}: ${res.total} whales · ${res.pctProfit}% in profit · ${res.pctLate}% bought after year one · now $${res.price}`);
console.log(`Wrote ${lotsOut}: ${lots.length} wallets with buy/sell lots`);
