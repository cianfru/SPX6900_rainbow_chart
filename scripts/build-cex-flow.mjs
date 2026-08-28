// Build the CEX / LP supply + flow series from the FIFO engine's reconstructed public/onchain.json.
//
// WHY THIS CHANGED (2026-08-28): it used to read a FROZEN Dune extract (dune/out/spx6900_cex_lp_flows.csv)
// for the historical baseline, then snapshot-forward. That baseline was queried with whatever address
// set existed at extract time, so every time a wallet was added to EXCLUDE_LABELS WITHOUT re-running the
// Dune query, the level silently understated — the rebase dragged the true live level down onto the stale
// baseline (118M vs a true 163M in Jul-2026; ~168M vs 190M after the 2026-08-28 Bubblemaps sweep). The
// FIFO engine already recomputes row.cexBal / row.lpBal for EVERY day of the full transfer archive using
// the CURRENT EXCLUDE_LABELS (build-onchain-local.mjs), so onchain.json is a fully-reconstructed, always-
// current, Dune-free source. We read it directly — one source of truth, no seam, no re-extract needed.
//
// ONBOARDING vs ORGANIC: onchain.json is an AGGREGATE daily level, so we can't split by per-address age
// like the old per-wallet CSV. Instead we flag a day whose CEX balance STEPS UP by more than ONBOARD_STEP
// as a one-time listing / onboarding fill (a fresh venue wallet filling zero→millions in a day) and grey
// it; everything else is organic behavioural flow. Approximate, but it matches the intent — grey the big
// one-off listing spikes so the real deposit/withdrawal behaviour underneath stays visible.
//
// Output shape is UNCHANGED so the two exchange-flow cards + charts read it as-is:
//   row = [dayISO, cexBal, lpBal, custodyBal(=0, custody is folded into cex now), cexOrganicNet, cexOnboardNet, price]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONBOARD_DAYS = 21;              // kept for the JSON field the cards read (semantic label only)
const ONBOARD_STEP = 2_000_000;       // a single-day CEX step-up ≥2M ≈ a listing/onboarding fill, not a trader

const oc = JSON.parse(readFileSync(join(root, "public/onchain.json"), "utf8"))
  .filter(r => r.d && r.cexBal != null)
  .sort((a, b) => a.d.localeCompare(b.d));
if (!oc.length) { console.error("build-cex-flow: onchain.json has no cexBal rows — is the FIFO engine output present?"); process.exit(1); }

const days = [];
let prevCex = null;
for (const r of oc) {
  const cexBal = Math.round(r.cexBal), lpBal = Math.round(r.lpBal || 0);
  const price = r.spot != null ? +Number(r.spot).toFixed(6) : null;
  let org = 0, onb = 0;
  if (prevCex != null) {
    const net = cexBal - prevCex;
    if (net >= ONBOARD_STEP) onb = net; else org = net;   // big step-up = listing fill (greyed), else organic
  }
  days.push([r.d, cexBal, lpBal, 0, org, onb, price]);
  prevCex = cexBal;
}

const updated = days.at(-1)[0];
const orgSum = days.reduce((a, r) => a + r[4], 0), onbSum = days.reduce((a, r) => a + r[5], 0);

// public/cex-flow.json = what the cards/site read (regenerated in CI from the fresh onchain.json).
writeFileSync(join(root, "public/cex-flow.json"), JSON.stringify({ updated, onboardDays: ONBOARD_DAYS, days }));
console.log(`wrote public/cex-flow.json — ${days.length} days from onchain.json, ${updated}`);

// src/cex-flow.js = the committed fallback bundle. Only rewrite on an explicit --bundle run.
if (process.argv.includes("--bundle")) {
  const out = `// SPX6900 — CEX / LP supply + flow, DAILY. Built by scripts/build-cex-flow.mjs from the FIFO
// engine's reconstructed public/onchain.json (cexBal/lpBal per day, current EXCLUDE_LABELS — no Dune).
// Row = [dayISO, cexBal, lpBal, custodyBal(=0), cexOrganicNet, cexOnboardNet, price]. Cards/site prefer
// public/cex-flow.json; this src bundle is the committed fallback. Onboarding = a single-day CEX step-up
// ≥ ${ONBOARD_STEP} SPX (a listing fill).
export const CEX_FLOW = {
  updated: ${JSON.stringify(updated)},
  onboardDays: ${ONBOARD_DAYS},
  days: ${JSON.stringify(days)}
};
`;
  writeFileSync(join(root, "src/cex-flow.js"), out);
  console.log(`wrote src/cex-flow.js baseline — ${days.length} days`);
}
console.log(`latest: cex ${(days.at(-1)[1] / 1e6).toFixed(1)}M · lp ${(days.at(-1)[2] / 1e6).toFixed(1)}M`);
console.log(`organic net ${(orgSum / 1e6).toFixed(1)}M · onboarding ${(onbSum / 1e6).toFixed(1)}M`);
