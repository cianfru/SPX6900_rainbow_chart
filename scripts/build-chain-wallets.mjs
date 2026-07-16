// AUTOMATED REFRESH of the multi-chain wallet-count series → public/chain-wallets.json
// (the ETH+Base+Solana headcount the wallet-growth card + site chart read; bundle fallback).
//
// ETH from public/onchain.json (holder_count_eth, refreshed weekly by onchain.yml). Base +
// Solana by EXECUTING their saved Dune queries via the API. Those queries use the LIGHT
// crossing/net-flow method (dune/spx6900_{base,solana}_wallets.sql) — no as-of interval
// join — so they run in seconds instead of hitting the free-tier 2-minute timeout. All
// three land on the same weekly Monday grid; ETH weeks are the spine, base/sol null before
// each chain's start. The empty/wrong-column guard aborts rather than regress the data.
//
// Needs DUNE_API_KEY + the two saved query IDs (defaulted below; override via repo vars
// DUNE_BASE_WALLETS_QUERY_ID / DUNE_SOL_WALLETS_QUERY_ID). ~2 light executions/run.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "public/chain-wallets.json";
const API = "https://api.dune.com/api/v1";
const BASE_ID = process.env.DUNE_BASE_WALLETS_QUERY_ID || "7996694"; // saved spx6900_base_wallets (light)
const SOL_ID = process.env.DUNE_SOL_WALLETS_QUERY_ID || "7991945";  // saved spx6900_solana_wallets (light)
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Execute a saved Dune query and return its result rows.
async function runQuery(queryId, key) {
  const H = { "X-Dune-API-Key": key };
  const ex = await fetch(`${API}/query/${queryId}/execute`, { method: "POST", headers: H });
  if (!ex.ok) throw new Error(`execute ${queryId}: ${ex.status} ${await ex.text()}`);
  const execution_id = (await ex.json())?.execution_id;
  if (!execution_id) throw new Error(`no execution_id for ${queryId}`);
  let state = "";
  for (let i = 0; i < 60; i++) {              // light queries finish in seconds; cap ~5 min
    await sleep(5000);
    const st = await fetch(`${API}/execution/${execution_id}/status`, { headers: H });
    if (!st.ok) throw new Error(`status ${st.status}`);
    state = (await st.json())?.state;
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") throw new Error(`${queryId} ${state}`);
  }
  if (state !== "QUERY_STATE_COMPLETED") throw new Error(`${queryId} timed out (${state})`);
  const res = await fetch(`${API}/execution/${execution_id}/results`, { headers: H });
  if (!res.ok) throw new Error(`results ${res.status}`);
  return (await res.json())?.result?.rows || [];
}

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

  const baseRows = await runQuery(BASE_ID, key);
  const solRows = await runQuery(SOL_ID, key);
  console.log(`base query ${BASE_ID}: ${baseRows.length} rows${baseRows[0] ? " · keys=" + Object.keys(baseRows[0]).join(",") : ""}`);
  console.log(`sol  query ${SOL_ID}: ${solRows.length} rows${solRows[0] ? " · keys=" + Object.keys(solRows[0]).join(",") : ""}`);
  const base = toMap(baseRows, "base_wallets");
  const sol = toMap(solRows, "sol_wallets");
  // Never regress: abort if a chain came back empty/mismatched (e.g. wrong query saved).
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-chain-wallets failed:", e.message); process.exit(1); });
}
