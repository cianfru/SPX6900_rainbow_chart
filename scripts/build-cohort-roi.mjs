// Build public/cohort-roi.json — "which whale size band actually made money."
//   node scripts/build-cohort-roi.mjs --in=public/spx-timeline.json --prices=public/price-history.json --out=public/cohort-roi.json
// Reads the committed city timeline (weekly per-wallet balances) + the daily price series, reconstructs
// lifetime average-cost P&L per wallet, and scores each of the ten Whale-Spectrum size bands by % of
// wallets in profit + the typical multiple. Keyless, $0 — a step in onchain-dune.yml after the timeline
// rebuild (rides the same commit). See src/cohort-roi.js for the honesty caveats.
import { readFileSync, writeFileSync } from "node:fs";
import { cohortRoi } from "../src/cohort-roi.js";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

const tl = JSON.parse(readFileSync(arg("in", "public/spx-timeline.json"), "utf8"));
const prices = JSON.parse(readFileSync(arg("prices", "public/price-history.json"), "utf8"));
const out = arg("out", "public/cohort-roi.json");

const res = cohortRoi(tl, prices, { minBal: Number(arg("minBal", "100000")) });
writeFileSync(out, JSON.stringify(res));

const top = res.cohorts.filter(c => c.n).sort((a, b) => b.pctProfit - a.pctProfit)[0];
console.log(`Wrote ${out}: ${res.total} whales · ${res.pctProfit}% in profit overall · best band ${top?.label} (${top?.pctProfit}% green, ${top?.medMult}× typical)`);
