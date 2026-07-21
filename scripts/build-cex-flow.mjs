// Build the CEX / LP / custody flow series from the Dune extract → src/cex-flow.js bundle.
// Input: dune/out/spx6900_cex_lp_flows.csv (day,address,kind,net_tokens) — the signed daily
// net flow per tagged address (see dune/spx6900_cex_lp_balances.sql). Output: a weekly series
// the two exchange-flow cards read.
//
// ONBOARDING vs ORGANIC (the honesty split): the biggest CEX "inflows" are brand-new wallets
// filling zero→millions in days = exchange LISTINGS / distributions, NOT traders depositing to
// sell. We tag each address's first ONBOARD_DAYS of activity as "onboarding" (a one-time
// listing fill) and everything after as "organic" behavioural flow. The netflow card greys the
// onboarding so the real deposit/withdrawal behaviour underneath is visible.
//
// Everything is frozen at the extract (re-run the Dune query + this script to refresh).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SPX_DAILY } from "../src/spx-daily.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONBOARD_DAYS = 21; // an address's first 21 days of activity = one-time listing/onboarding fill

const rows = readFileSync(join(root, "dune/out/spx6900_cex_lp_flows.csv"), "utf8")
  .trim().split("\n").slice(1)
  .map(l => { const [d, a, k, n] = l.split(","); return { d, a, k, n: +n }; })
  .filter(r => r.d && r.k && Number.isFinite(r.n));

// per-address first-active date (first day its cumulative balance goes positive)
const firstActive = {};
{
  const run = {};
  const days = [...new Set(rows.map(r => r.d))].sort();
  const byDayAddr = {};
  for (const r of rows) { (byDayAddr[r.d] ??= {}); byDayAddr[r.d][r.a] = (byDayAddr[r.d][r.a] || 0) + r.n; }
  for (const d of days) for (const a of Object.keys(byDayAddr[d])) {
    if (!(a in firstActive) && (run[a] || 0) === 0 && byDayAddr[d][a] > 0) firstActive[a] = d;
    run[a] = (run[a] || 0) + byDayAddr[d][a];
  }
}
const isOnboarding = r => {
  const f = firstActive[r.a]; if (!f) return false;
  const age = (Date.parse(r.d) - Date.parse(f)) / 86400000;
  return age >= 0 && age < ONBOARD_DAYS;
};

// daily buckets: net per kind per day (with the onboarding split for CEX)
const perDay = {}; // day -> {cexOrg, cexOnb, lp, cust}
for (const r of rows) {
  (perDay[r.d] ??= { cexOrg: 0, cexOnb: 0, lp: 0, cust: 0 });
  if (r.k === "lp") perDay[r.d].lp += r.n;
  else if (r.k === "custody") perDay[r.d].cust += r.n;
  else if (r.k === "cex") { if (isOnboarding(r)) perDay[r.d].cexOnb += r.n; else perDay[r.d].cexOrg += r.n; }
}

const price = new Map(SPX_DAILY);
const allDays = Object.keys(perDay).sort();
// walk a continuous daily grid from first to last flow day → cumulative balances + forward-filled price
let cexBal = 0, lpBal = 0, custBal = 0, lastP = null;
const days = [];
for (let t = Date.parse(allDays[0]); t <= Date.parse(allDays.at(-1)); t += 86400000) {
  const d = new Date(t).toISOString().slice(0, 10);
  const w = perDay[d] || { cexOrg: 0, cexOnb: 0, lp: 0, cust: 0 };
  cexBal += w.cexOrg + w.cexOnb; lpBal += w.lp; custBal += w.cust;
  if (price.has(d)) lastP = price.get(d);
  days.push([d, +cexBal.toFixed(0), +lpBal.toFixed(0), +custBal.toFixed(0), +w.cexOrg.toFixed(0), +w.cexOnb.toFixed(0), lastP == null ? null : +lastP.toFixed(6)]);
}

const updated = rows.at(-1).d;
const org = days.reduce((a, r) => a + r[4], 0), onb = days.reduce((a, r) => a + r[5], 0);
const out = `// SPX6900 — CEX / LP / custody supply + flow, DAILY. Built by scripts/build-cex-flow.mjs
// from the Dune extract (dune/spx6900_cex_lp_balances.sql). Reconciles to the local FIFO
// engine's liqEx. Row = [dayISO, cexBal, lpBal, custodyBal, cexOrganicNet, cexOnboardNet, price].
// Balances are cumulative tokens; net columns are that day's signed flow (+in/-out). Onboarding
// = a new address's first ${ONBOARD_DAYS} days (listing/distribution fill), split from organic
// behaviour so the flow card can strip it. Cards read daily + apply a 7-day rolling sum (a thin
// token is too noisy raw). Frozen at the extract; re-run to refresh (or bank daily balances forward).
export const CEX_FLOW = {
  updated: ${JSON.stringify(updated)},
  onboardDays: ${ONBOARD_DAYS},
  days: ${JSON.stringify(days)}
};
`;
writeFileSync(join(root, "src/cex-flow.js"), out);
console.log(`wrote src/cex-flow.js — ${days.length} days, ${updated}`);
console.log(`latest: cex ${(cexBal/1e6).toFixed(1)}M · lp ${(lpBal/1e6).toFixed(1)}M · custody ${(custBal/1e6).toFixed(1)}M`);
console.log(`organic net ${(org/1e6).toFixed(1)}M · onboarding ${(onb/1e6).toFixed(1)}M`);
