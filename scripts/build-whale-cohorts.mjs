// ============================================================================
// WHALE COHORTS OVER TIME — how many wallets sit in each size cohort, week by week
// ============================================================================
//   node scripts/build-whale-cohorts.mjs --in=public/spx-timeline.json --out=public/whale-cohort-history.json
//
// A re-slice of the city time-machine (per-wallet weekly net balances) into a COMPACT per-week count
// of the four whale cohorts (100–250k / 250k–1M / 1M–5M / 5M+), so the site chart can draw the
// evolution without fetching the 3MB timeline. Cohort boundaries + labels come from
// src/whale-cohorts.js so this can't drift from the 3D page and the behaviour card.
//
// Honesty caveats (stated on the chart): this is the WEEKLY NET-BALANCE reconstruction — the live
// snapshot (whales.json) counts a touch fewer using finer per-lot FIFO ages; infra (CEX/LP/bridge/
// burn) is excluded upstream in the timeline; a wallet moves BETWEEN cohorts as it grows or shrinks.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { balanceAt } from "./build-city-timeline.mjs";
import { COHORTS, cohortIndex, WHALE_FLOOR } from "../src/whale-cohorts.js";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;

export function whaleCohortHistory(tl) {
  const n = tl.n;
  const weekly = Array.from({ length: n }, () => new Array(COHORTS.length).fill(0));
  for (const w of tl.wallets) {
    // skip wallets that never reached whale size — most of the 26k never do
    let peak = 0; for (const pt of w.p) if (pt[1] > peak) peak = pt[1];
    if (peak < WHALE_FLOOR) continue;
    // walk the sparse change-points, forward-filling the balance across every week, and bin it
    let pi = 0, bal = 0;
    for (let wk = 0; wk < n; wk++) {
      while (pi < w.p.length && w.p[pi][0] <= wk) bal = w.p[pi++][1];
      const ci = cohortIndex(bal);
      if (ci >= 0) weekly[wk][ci]++;
    }
  }
  const week0 = Date.parse(tl.week0);
  const iso = t => new Date(t).toISOString().slice(0, 10);
  // rows: [date, c0, c1, c2, c3] — small enough to ship whole (~156 weeks)
  const rows = weekly.map((c, wk) => [iso(week0 + wk * 7 * DAY), ...c]);
  return {
    updated: tl.updated, week0: tl.week0, n, floor: WHALE_FLOOR,
    labels: COHORTS.map(c => c.label), colors: COHORTS.map(c => c.accent),
    rows,
  };
}

function main() {
  const inp = arg("in") || "public/spx-timeline.json";
  const out = arg("out") || "public/whale-cohort-history.json";
  const tl = JSON.parse(readFileSync(inp, "utf8"));
  if (!Array.isArray(tl.wallets) || !tl.n) { console.error("bad timeline input"); process.exit(1); }
  const o = whaleCohortHistory(tl);
  writeFileSync(out, JSON.stringify(o));
  const first = o.rows[0], last = o.rows.at(-1);
  const tot = a => a.slice(1).reduce((s, v) => s + v, 0);
  console.log(`whale-cohort-history: ${o.n} weeks · ${first[0]} ${tot(first)} whales → ${last[0]} ${tot(last)} whales · ` +
    o.labels.map((l, i) => `${l}=${last[i + 1]}`).join(" "));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main();
