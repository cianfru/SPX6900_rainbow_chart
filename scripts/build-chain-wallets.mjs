// AUTOMATED REFRESH of the multi-chain wallet-count series → public/chain-wallets.json
// (the ETH+Base+Solana headcount the wallet-growth card + site chart read, with
// src/chain-wallets.js as the bundled fallback).
//
// ETH comes from public/onchain.json (holder_count_eth, refreshed weekly by onchain.yml).
// Base + Solana are READ from their CACHED Dune results (free, never rate-limited): both
// are heavy per-wallet as-of reconstructions that are UNRELIABLE to execute on the free-
// tier API (Solana returns empty, Base intermittently fails), so we never execute them —
// the owner re-runs each query in the Dune UI when they want it fresh and we read the
// cached result. All three land on the same weekly Monday grid, so we join by date (ETH
// weeks are the spine; base/sol null before each chain's start). ETH updating weekly keeps
// chain-wallets.json changing every week even when Base/Solana caches are unchanged.
//
// Needs DUNE_API_KEY + DUNE_BASE_WALLETS_QUERY_ID (+ DUNE_SOL_WALLETS_QUERY_ID, default
// 7991945 = the saved spx6900_solana_wallets query). Soft-fails to the bundle without
// them. ~2 executions/run (~100 credits) — WEEKLY is well within the 2,500/mo budget.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "public/chain-wallets.json";
const API = "https://api.dune.com/api/v1";
const BASE_ID = process.env.DUNE_BASE_WALLETS_QUERY_ID || "7996694"; // saved spx6900_base_wallets
const SOL_ID = process.env.DUNE_SOL_WALLETS_QUERY_ID || "7991945";  // saved spx6900_solana_wallets

// Read a saved Dune query's LATEST CACHED result (free, no re-execution, never
// rate-limited). Both the Base and Solana wallet queries are heavy per-wallet as-of
// reconstructions that are unreliable to EXECUTE on the free-tier API (Solana returns
// empty, Base intermittently QUERY_STATE_FAILED). So we don't execute them — we read the
// cached result the owner populates by running each query in the Dune UI. They're
// slow-moving (~114k / ~66k), so occasional manual refreshes suffice; ETH stays weekly-
// automatic via onchain.json, which keeps chain-wallets.json changing every week.
async function readResults(queryId, key) {
  const res = await fetch(`${API}/query/${queryId}/results?limit=1000`, { headers: { "X-Dune-API-Key": key } });
  if (!res.ok) throw new Error(`results ${queryId}: ${res.status} ${await res.text()}`);
  return (await res.json())?.result?.rows || [];
}

// Dune rows (column-keyed) → Map<YYYY-MM-DD, count>.
function toMap(rows, valKey) {
  const m = new Map();
  for (const r of rows || []) {
    const d = r?.d != null ? String(r.d).slice(0, 10) : null;
    const v = Number(r?.[valKey]);
    if (d && Number.isFinite(v)) m.set(d, Math.round(v));
  }
  return m;
}

// Pure, unit-testable merge (ETH weeks are the spine; base/sol null before their start).
export function mergeChains(ethMap, baseMap, solMap) {
  return [...ethMap.keys()].sort().map(d => ({
    d, eth: ethMap.get(d),
    base: baseMap.has(d) ? baseMap.get(d) : null,
    sol: solMap.has(d) ? solMap.get(d) : null,
  }));
}

async function main() {
  const key = process.env.DUNE_API_KEY;
  if (!key) throw new Error("no DUNE_API_KEY — skipping (bundle keeps serving)");

  // ETH from onchain.json (weekly holder_count_eth).
  const eth = new Map();
  try {
    const oc = JSON.parse(await readFile("public/onchain.json", "utf8"));
    for (const r of oc) if (r?.d && r.holders > 0) eth.set(r.d, Math.round(r.holders));
  } catch { /* handled below */ }
  if (!eth.size) throw new Error("public/onchain.json missing ETH holders — run the on-chain refresh first");

  const baseRows = await readResults(BASE_ID, key);  // cached (owner re-runs in UI)
  const solRows = await readResults(SOL_ID, key);    // cached (owner re-runs in UI)
  console.log(`base query ${BASE_ID} (cached): ${baseRows.length} rows${baseRows[0] ? " · keys=" + Object.keys(baseRows[0]).join(",") : ""}`);
  console.log(`sol  query ${SOL_ID} (cached): ${solRows.length} rows${solRows[0] ? " · keys=" + Object.keys(solRows[0]).join(",") : ""}`);
  const base = toMap(baseRows, "base_wallets");
  const sol = toMap(solRows, "sol_wallets");
  // Never regress: if a chain query came back empty/mismatched, abort rather than
  // silently drop that whole chain (which would wipe ~66k Solana wallets, etc.).
  if (!base.size) throw new Error(`Base query ${BASE_ID} produced no usable rows (expected column base_wallets) — aborting`);
  if (!sol.size) throw new Error(`Solana query ${SOL_ID} produced no usable rows (expected column sol_wallets) — aborting`);
  const series = mergeChains(eth, base, sol);
  if (series.length < 50) throw new Error(`only ${series.length} rows — refusing to overwrite`);

  const next = JSON.stringify(series);
  let prev = null;
  try { prev = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (prev === next) { console.log(`No change (${series.length} weeks).`); return; }

  await writeFile(OUT, next);
  const c = series.at(-1);
  console.log(`Wrote ${OUT}: ${series.length} weeks · latest ETH ${c.eth} · Base ${c.base} · Sol ${c.sol} = ${c.eth + (c.base || 0) + (c.sol || 0)}`);
}

// Only run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-chain-wallets failed:", e.message); process.exit(1); });
}
