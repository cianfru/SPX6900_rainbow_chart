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
// CADENCE: DAILY (both). Measured 2026-07-25 — transfers 0.163 credits/execution, sales
// 0.378, so a full refresh is 0.54 and daily costs ~16/month against a 2,500 quota. An
// earlier version throttled this to Mon/Thu on a guess of ~50 credits per pull, which was
// wrong by two orders of magnitude. Do not re-throttle without measuring first.
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
  // The credit cost is NOT on /status — its result_metadata carries only row/byte counts.
  // It lives on the RESULTS endpoint, so ask for one row purely to read the metadata. Cheap
  // (limit=1), and it turns the monthly budget from an estimate into a measurement.
  let credits = null;
  try {
    const m = await fetch(`${BASE}/execution/${eid}/results?limit=1`, { headers: H() });
    if (m.ok) {
      const j = await m.json();
      const md = j?.result?.metadata || {};
      credits = md.execution_cost_credits ?? md.executionCostCredits ?? null;
      if (credits == null) console.log(`    (no credit field on results; keys: ${Object.keys(md).join(", ")})`);
    }
  } catch { /* cost is nice-to-have; never fail the pull over it */ }
  const res = await fetch(`${BASE}/execution/${eid}/results/csv`, { headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY } });
  if (!res.ok) throw new Error(`results/csv ${res.status}: ${await res.text()}`);
  return { csv: await res.text(), meta, credits };
}

async function pull(sqlPath, outPath, name, idEnv) {
  const sql = readFileSync(sqlPath, "utf8");
  const id = await ensureQuery(sql, name, idEnv);
  const { csv, meta, credits } = await runToCsv(id);
  const rows = csv.split(/\r?\n/).filter(Boolean).length - 1;
  if (rows < 10) throw new Error(`only ${rows} rows back — refusing to overwrite ${outPath}`);
  writeFileSync(outPath, csv.endsWith("\n") ? csv : csv + "\n");
  const dp = meta?.datapoint_count ? ` · ${meta.datapoint_count.toLocaleString()} datapoints` : "";
  // Credit cost comes from runToCsv (the RESULTS endpoint, not /status). Measured
  // 2026-07-25: transfers 0.163, sales 0.378 — a full refresh is ~0.54 credits, so the
  // daily pull is ~16/month against a 2,500 quota. Logged every run so the budget stays a
  // measurement; see the credit-discipline note in CLAUDE.md for why estimating is banned.
  console.log(`  ${outPath}: ${rows.toLocaleString()} rows${dp}`
    + (credits != null ? ` · ${credits} credits` : ""));
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
  console.log("aeon-dune: done.");
}

main().catch(e => {
  // Soft-fail: keep the daily banker green; the reconstructions fall back to the committed CSVs.
  console.error("aeon-dune: refresh failed (using last committed CSVs) —", e.message);
});
