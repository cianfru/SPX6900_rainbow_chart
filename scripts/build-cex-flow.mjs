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
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONBOARD_DAYS = 21; // an address's first 21 days of activity = one-time listing/onboarding fill

// Kind comes from EXCLUDE_LABELS (the single source of truth — re-tag there, no Dune re-run). The
// CSV's own kind column is a fallback. Addresses tagged `other` (unlabeled non-exchange, e.g. an
// MM-style wallet) fall through the cex/lp/custody buckets → excluded from the exchange-flow cards.
const rows = readFileSync(join(root, "dune/out/spx6900_cex_lp_flows.csv"), "utf8")
  .trim().split("\n").slice(1)
  .map(l => { const [d, a, k, n] = l.split(","); return { d, a, k: EXCLUDE_LABELS[a]?.kind ?? k, n: +n }; })
  .filter(r => r.d && r.k && Number.isFinite(r.n));

// How many addresses the banked CSV actually covers, vs how many are tagged today. The gap between
// these two numbers is the whole failure mode the seam check below looks for.
const CSV_ADDRS = new Set(rows.map(r => r.a)).size;
const TAGGED_ADDRS = Object.values(EXCLUDE_LABELS)
  .filter(v => v.kind === "cex" || v.kind === "lp" || v.kind === "custody").length;

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

// Price context: prefer public/price-history.json (the dense, CI-cleaned series the main charts
// use — SPX_DAILY has noisy/mis-levelled daily prints in the volatile drawdown that the main app
// overrides). Fall back to SPX_DAILY for any date it doesn't cover.
const price = new Map(SPX_DAILY);
try {
  const ph = JSON.parse(readFileSync(join(root, "public/price-history.json"), "utf8"));
  const arr = Array.isArray(ph) ? ph : (ph.prices || ph.data || []);
  for (const x of arr) { const d = x.date ?? x[0], p = x.price ?? x[1]; if (d && p > 0) price.set(d, +p); }
} catch { /* SPX_DAILY only */ }
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

// ── SNAPSHOT-FORWARD: splice daily-banked balances (public/history.json cexBal/lpBal/custBal,
// keyless RPC via snapshot.mjs) onto the Dune baseline, so the cards' pulse stays fresh daily
// without re-running Dune. Each series is rebased by the seam gap so no definitional jump draws.
// Forward daily net = balance delta (onboarding can't be split from aggregate balances → all in
// organic).
//
// ⚠ THE REBASE HIDES A STALE BASELINE, SO CHECK THE OFFSET, NOT JUST THE CHART. This used to say
// the offset was "~0 because it's the SAME 13 addresses" — and that stopped being true the moment
// wallets were added to EXCLUDE_LABELS without re-running the Dune query. snapshot.mjs derives its
// address list from EXCLUDE_LABELS at runtime, so the FORWARD side picks up a new wallet the next
// day, while the baseline CSV keeps whatever set it was queried with. The rebase then quietly drags
// the correct live level DOWN onto the stale one: in Jul-2026 the CSV still held 13 addresses
// against 29 tagged, and these charts read 118M of exchange supply against a true 163M — a 28%
// understatement with a perfectly smooth line. The shape stays right, which is exactly why it went
// unnoticed. If `off.cex` is not near zero, the CSV is behind: re-run dune/spx6900_cex_lp_balances.sql.
function extendForward(base) {
  let hist = [];
  try { hist = JSON.parse(readFileSync(join(root, "public/history.json"), "utf8")); } catch { return base; }
  const seam = base.at(-1);
  const fwd = hist
    .filter(r => r.cexBal != null && r.lpBal != null && r.d > seam[0])
    .sort((a, b) => a.d.localeCompare(b.d));
  if (!fwd.length) return base;
  const off = { cex: seam[1] - fwd[0].cexBal, lp: seam[2] - fwd[0].lpBal, cust: seam[3] - (fwd[0].custBal ?? 0) };
  // A seam gap is meant to be a rounding-scale definitional nudge. Anything bigger means the two
  // sides are measuring different address SETS, and the rebase is about to bury that difference in
  // a smooth line — so say it out loud rather than let it publish silently.
  const drift = seam[1] > 0 ? Math.abs(off.cex) / seam[1] : 0;
  if (drift > 0.02) {
    console.warn(`⚠ CEX seam offset is ${(off.cex / 1e6).toFixed(1)}M (${(drift * 100).toFixed(1)}% of the ` +
      `${(seam[1] / 1e6).toFixed(1)}M baseline at ${seam[0]}). The Dune CSV covers ` +
      `${CSV_ADDRS} addresses; EXCLUDE_LABELS now tags ${TAGGED_ADDRS}. ` +
      `Re-run dune/spx6900_cex_lp_balances.sql — these charts are understating the level until you do.`);
  }
  const priceMap = new Map(SPX_DAILY);
  let prev = { cex: seam[1], lp: seam[2], cust: seam[3] };
  const rows = [];
  for (const r of fwd) {
    const cb = Math.round(r.cexBal + off.cex), lb = Math.round(r.lpBal + off.lp), cu = Math.round((r.custBal ?? 0) + off.cust);
    const p = r.p ?? priceMap.get(r.d) ?? null;
    rows.push([r.d, cb, lb, cu, cb - prev.cex, 0, p == null ? null : +Number(p).toFixed(6)]);
    prev = { cex: cb, lp: lb, cust: cu };
  }
  return [...base, ...rows];
}

const merged = extendForward(days);
const updated = merged.at(-1)[0];
const bundleUpdated = rows.at(-1).d;
const org = merged.reduce((a, r) => a + r[4], 0), onb = merged.reduce((a, r) => a + r[5], 0);

// public/cex-flow.json = baseline + daily forward (regenerated in CI). This is what the cards/site
// read; the src bundle is the frozen Dune baseline fallback.
writeFileSync(join(root, "public/cex-flow.json"), JSON.stringify({ updated, onboardDays: ONBOARD_DAYS, days: merged }));
console.log(`wrote public/cex-flow.json — ${merged.length} days (${merged.length - days.length} forward), ${updated}`);

// src/cex-flow.js = the Dune baseline bundle. Only rewrite it on an explicit --bundle run (a fresh
// extract); CI must NOT rewrite a source file.
if (process.argv.includes("--bundle")) {
  const out = `// SPX6900 — CEX / LP / custody supply + flow, DAILY (Dune baseline). Built by
// scripts/build-cex-flow.mjs --bundle from dune/spx6900_cex_lp_balances.sql. Reconciles to the
// local FIFO engine's liqEx. Row = [dayISO, cexBal, lpBal, custodyBal, cexOrganicNet, cexOnboardNet,
// price]. Cards/site prefer public/cex-flow.json (baseline + daily snapshot-forward) and fall back
// to this bundle. Onboarding = a new address's first ${ONBOARD_DAYS} days (listing fill). Re-run on a
// fresh extract to refresh the baseline.
export const CEX_FLOW = {
  updated: ${JSON.stringify(bundleUpdated)},
  onboardDays: ${ONBOARD_DAYS},
  days: ${JSON.stringify(days)}
};
`;
  writeFileSync(join(root, "src/cex-flow.js"), out);
  console.log(`wrote src/cex-flow.js baseline — ${days.length} days, ${bundleUpdated}`);
}
console.log(`latest: cex ${(merged.at(-1)[1]/1e6).toFixed(1)}M · lp ${(merged.at(-1)[2]/1e6).toFixed(1)}M · custody ${(merged.at(-1)[3]/1e6).toFixed(1)}M`);
console.log(`organic net ${(org/1e6).toFixed(1)}M · onboarding ${(onb/1e6).toFixed(1)}M`);
