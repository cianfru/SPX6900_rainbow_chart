// ============================================================================
// PROJECT AEON — whole-history Dune refresh (transfers + sales, scheduled apart)
// ============================================================================
// Re-pulls the ENTIRE transfer + sale history from Dune each run and overwrites the
// CSVs the reconstructions read. No archive / no incremental / no drift — the whole
// history for a 3,333 collection is only ~25k + ~17k rows (a few credits, no timeout,
// no 402), so re-pulling everything is simpler AND always correct (see CLAUDE.md).
//
//   node scripts/build-aeon-dune-refresh.mjs [--only=transfers|sales]
//
// CADENCE: transfers twice weekly (Mon+Thu), sales weekly (Mon). Transfers drive holder
// age / concentration / holder flow, which nothing free covers. The sales tail is already
// carried free by the Alchemy bank (build-aeon-live-bank.mjs), so its pull only has to keep
// the deep full-history reconstruction current.
//
// ENV: DUNE_API_KEY (repo secret). Optional repo vars AEON_TRANSFERS_QUERY_ID /
// AEON_SALES_QUERY_ID — saved queries whose SQL this PATCHes each run; if unset it
// CREATES one and logs the id (set the var to reuse it instead of making a new query).
// SOFT-FAILS (exit 0): a Dune outage must not break the daily floor/owners banker —
// the reconstructions then just run off the last committed CSVs.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://api.dune.com/api/v1";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = () => { const k = process.env.DUNE_API_KEY; if (!k) throw new Error("no DUNE_API_KEY"); return { "X-Dune-API-Key": k, "Content-Type": "application/json" }; };

// PATCH the saved query if we have an id, else create one (logged once).
async function ensureQuery(sql, name, idEnv) {
  const id = process.env[idEnv];
  if (id) {
    const r = await fetch(`${BASE}/query/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ query_sql: sql }) });
    if (!r.ok) throw new Error(`patch query ${r.status}: ${await r.text()}`);
    return id;
  }
  const r = await fetch(`${BASE}/query`, { method: "POST", headers: H(), body: JSON.stringify({ name, query_sql: sql, is_private: false }) });
  if (!r.ok) throw new Error(`create query ${r.status}: ${await r.text()}`);
  const nid = (await r.json())?.query_id;
  console.log(`  created query ${nid} — set repo var ${idEnv}=${nid} to reuse it`);
  return nid;
}

// Execute → poll → results CSV. No `performance` tier (that opts into a PAID engine → 400
// on the free/community tier; the tiny bounded query needs nothing more).
async function runToCsv(id) {
  const ex = await fetch(`${BASE}/query/${id}/execute`, { method: "POST", headers: H() });
  if (!ex.ok) throw new Error(`execute ${ex.status}: ${await ex.text()}`);
  const eid = (await ex.json())?.execution_id;
  if (!eid) throw new Error("no execution_id");
  let state = "", meta = null;
  for (let i = 0; i < 120; i++) {
    await sleep(3500);
    const st = await fetch(`${BASE}/execution/${eid}/status`, { headers: H() });
    if (!st.ok) throw new Error(`status ${st.status}`);
    const j = await st.json();
    state = j?.state; meta = j?.result_metadata || meta;
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") throw new Error(`execution ${state}: ${JSON.stringify(j?.error || {})}`);
  }
  if (state !== "QUERY_STATE_COMPLETED") throw new Error(`timed out (last state ${state})`);
  const res = await fetch(`${BASE}/execution/${eid}/results/csv`, { headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY } });
  if (!res.ok) throw new Error(`results/csv ${res.status}: ${await res.text()}`);
  return { csv: await res.text(), meta };
}

async function pull(sqlPath, outPath, name, idEnv) {
  const sql = readFileSync(sqlPath, "utf8");
  const id = await ensureQuery(sql, name, idEnv);
  const { csv, meta } = await runToCsv(id);
  const rows = csv.split(/\r?\n/).filter(Boolean).length - 1;
  if (rows < 10) throw new Error(`only ${rows} rows back — refusing to overwrite ${outPath}`);
  writeFileSync(outPath, csv.endsWith("\n") ? csv : csv + "\n");
  const dp = meta?.datapoint_count ? ` · ${meta.datapoint_count.toLocaleString()} datapoints` : "";
  // Surface the CREDIT cost so the monthly budget is observable rather than estimated.
  // Dune has moved this field around between API versions, so probe the likely names and
  // dump the metadata keys when none match — the next run then tells us what to read.
  const cost = meta?.execution_cost_credits ?? meta?.credits_used ?? meta?.total_credits ?? null;
  console.log(`  ${outPath}: ${rows.toLocaleString()} rows${dp}`
    + (cost != null ? ` · ${cost} credits` : ""));
  if (cost == null && meta) console.log(`    (no credit field; metadata keys: ${Object.keys(meta).join(", ")})`);
  return rows;
}

async function main() {
  if (!process.env.DUNE_API_KEY) { console.log("aeon-dune: no DUNE_API_KEY — soft-skipping (reconstructions use the committed CSVs)"); return; }
  // The two pulls are scheduled INDEPENDENTLY. Transfers feed holder age / concentration /
  // holder flow, which is the half worth refreshing more often. Sales feed the full-history
  // reconstruction (trader P&L, cost basis, MVRV) — and its recent tail is already carried
  // free by the Alchemy bank, so it does not need the extra run.
  const only = (process.argv.find(a => a.startsWith("--only=")) || "").split("=")[1] || "";
  const want = k => !only || only === k;
  console.log(`aeon-dune: refreshing ${only || "transfers + sales"} from Dune…`);
  if (want("transfers")) await pull("dune/aeon_transfers.sql", "dune/out/aeon_transfers.csv", "Project AEON — transfers (auto)", "AEON_TRANSFERS_QUERY_ID");
  if (want("sales")) await pull("dune/aeon_sales.sql", "dune/out/aeon_sales.csv", "Project AEON — sales (auto)", "AEON_SALES_QUERY_ID");
  console.log("aeon-dune: done · exact credit cost is in the Dune dashboard (per-execution).");
}

main().catch(e => {
  // Soft-fail: keep the daily banker green; the reconstructions fall back to the committed CSVs.
  console.error("aeon-dune: refresh failed (using last committed CSVs) —", e.message);
});
