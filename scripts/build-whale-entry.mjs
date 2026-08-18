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

const res = whaleEntries(tl, prices, { minBal: Number(arg("minBal", "100000")) });
writeFileSync(out, JSON.stringify(res));
console.log(`Wrote ${out}: ${res.total} whales · ${res.pctProfit}% in profit · ${res.pctLate}% bought after year one · now $${res.price}`);
