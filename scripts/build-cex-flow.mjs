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

// weekly buckets (Monday key)
const monday = ds => { const dt = new Date(ds + "T00:00:00Z"); const m = new Date(dt); m.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return m.toISOString().slice(0, 10); };
const wk = {}; // key -> {cexOrg, cexOnb, lp, cust}
for (const r of rows) {
  const k = monday(r.d); (wk[k] ??= { cexOrg: 0, cexOnb: 0, lp: 0, cust: 0 });
  if (r.k === "lp") wk[k].lp += r.n;
  else if (r.k === "custody") wk[k].cust += r.n;
  else if (r.k === "cex") { if (isOnboarding(r)) wk[k].cexOnb += r.n; else wk[k].cexOrg += r.n; }
}

const price = new Map(SPX_DAILY);
const keys = Object.keys(wk).sort();
// cumulative balances + forward-filled weekly price
let cexBal = 0, lpBal = 0, custBal = 0, lastP = null;
const weeks = keys.map(k => {
  const w = wk[k];
  cexBal += w.cexOrg + w.cexOnb; lpBal += w.lp; custBal += w.cust;
  // price as of the Friday of that week (or last known)
  for (let i = 0; i <= 6; i++) { const ds = new Date(Date.parse(k) + i * 86400000).toISOString().slice(0, 10); if (price.has(ds)) lastP = price.get(ds); }
  return [k,
    +cexBal.toFixed(0), +lpBal.toFixed(0), +custBal.toFixed(0), // balances (tokens)
    +(w.cexOrg).toFixed(0), +(w.cexOnb).toFixed(0),             // weekly organic net / onboarding net
    lastP == null ? null : +lastP.toFixed(6)];                  // weekly price
});

const updated = rows.at(-1).d;
const out = `// SPX6900 — CEX / LP / custody supply + flow, weekly. Built by scripts/build-cex-flow.mjs
// from the Dune extract (dune/spx6900_cex_lp_balances.sql). Reconciles to the local FIFO
// engine's liqEx. Row = [mondayISO, cexBal, lpBal, custodyBal, cexOrganicNet, cexOnboardNet, price].
// Balances are cumulative tokens; net columns are that week's signed flow (+in/-out). Onboarding
// = a new address's first ${ONBOARD_DAYS} days (listing/distribution fill), split out from organic
// behaviour so the netflow card can grey it. Frozen at the extract; re-run to refresh.
export const CEX_FLOW = {
  updated: ${JSON.stringify(updated)},
  onboardDays: ${ONBOARD_DAYS},
  weeks: ${JSON.stringify(weeks)}
};
`;
writeFileSync(join(root, "src/cex-flow.js"), out);
console.log(`wrote src/cex-flow.js — ${weeks.length} weeks, ${updated}`);
console.log(`latest: cex ${(cexBal/1e6).toFixed(1)}M · lp ${(lpBal/1e6).toFixed(1)}M · custody ${(custBal/1e6).toFixed(1)}M`);
