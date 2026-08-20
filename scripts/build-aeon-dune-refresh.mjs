// ============================================================================
// PROJECT AEON — INCREMENTAL Dune refresh (transfers + sales)
// ============================================================================
// Pulls only the transfers/sales SINCE the archive's last day and merges them into the
// committed dune/out/*.csv the reconstructions read. The full history is already in-repo,
// so the delta is a handful of rows/day.
//
// WHY NOT re-pull the whole history (what this used to do): Dune bills TWO things — the
// QUERY EXECUTION and, separately, an "API Result Read" per download (by datapoints). The
// whole-history pull's EXECUTION was cheap (~0.2 credits) but its RESULT READ of all 25,289
// transfers + 17,040 sales was ~62 + ~73 credits — every day, twice ⇒ ~135/day, ~4,050/mo,
// OVER the 2,500 quota. The 2026-07-25 "0.54 credits" measurement read executionCostCredits
// only and never saw the result-read charge. Incremental drops that read to ~0.
//
//   node scripts/build-aeon-dune-refresh.mjs [--only=transfers|sales]
//
// MECHANISM (mirrors build-onchain-dune-refresh.mjs): read the committed CSV → find its last
// day → PATCH the saved query with `AND <block_time col> >= that day` → execute (small delta)
// → merge (archive rows strictly before the day + the whole re-pulled day) → write. The
// boundary day is cleanly replaced, so no gap and no duplicate.
//
// ENV: DUNE_API_KEY (repo secret). Optional repo vars AEON_TRANSFERS_QUERY_ID /
// AEON_SALES_QUERY_ID — saved queries whose SQL this PATCHes each run; if unset it
// CREATES one and logs the id (set the var to reuse it instead of making a new query).
// SOFT-FAILS (exit 0): a Dune outage must not break the daily floor/owners banker —
// the reconstructions then just run off the last committed CSVs.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE = "https://api.dune.com/api/v1";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = () => { const k = process.env.DUNE_API_KEY; if (!k) throw new Error("no DUNE_API_KEY"); return { "X-Dune-API-Key": k, "Content-Type": "application/json" }; };

// ── pure helpers (unit-tested in test/aeon-dune-refresh.test.mjs) ─────────────────────────────
// WHY INCREMENTAL: Dune bills an "API Result Read" per download by datapoints. Re-pulling the
// WHOLE 25,289-row transfer history (+17,040 sales) every day cost ~62 + ~73 = ~135 credits/day
// (≈4,050/mo — over the 2,500 quota) even though the query EXECUTION was only ~0.2 credits. The
// full history is already committed in dune/out/*.csv, so we pull only rows since the last day
// present (a handful) and merge — the delta read is ~0 credits, like the limit=1 meta read.
export const splitCsv = line => line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
export const findTimeIdx = hdr =>
  hdr.findIndex(h => ["time", "evt_block_time", "block_time", "block_timestamp"].includes(h.toLowerCase().trim()));

// Midnight (UTC) of the day of the archive's newest row → the cutoff we re-pull from, so the
// boundary day is cleanly REPLACED (no partial-day gap or duplicate).
export function cutoffDay(maxIso) {
  const t = Date.parse(maxIso);
  if (!Number.isFinite(t)) throw new Error(`archive max time unparseable: ${maxIso}`);
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function archiveMaxTime(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("archive has no data rows");
  const ti = findTimeIdx(splitCsv(lines[0]));
  if (ti < 0) throw new Error(`archive header missing a time column: ${lines[0]}`);
  let max = "";
  for (const line of lines.slice(1)) { const t = splitCsv(line)[ti]; if (t > max) max = t; } // ISO/space ts sort lexicographically
  return max;
}
// Add `AND <dbTimeCol> >= TIMESTAMP '<cutoff> 00:00:00'` before the trailing ORDER BY.
export function injectSince(sql, dbTimeCol, cutoff) {
  const clause = `AND ${dbTimeCol} >= TIMESTAMP '${cutoff} 00:00:00'`;
  const noSemi = sql.replace(/;\s*$/, "");
  const m = /\bORDER\s+BY\b/i.exec(noSemi);
  if (!m) return `${noSemi.trimEnd()}\n  ${clause}`;
  return `${noSemi.slice(0, m.index).trimEnd()}\n  ${clause}\n${noSemi.slice(m.index)}`;
}
// Merge base (rows strictly before the cutoff day) + the whole delta (>= cutoff) → canonical
// CSV, preserving every column verbatim. base<cutoff and delta>=cutoff never overlap → no dupes.
export function mergeCsv(baseText, deltaText, cutoff) {
  const cutoffMs = Date.parse(`${cutoff}T00:00:00Z`);
  const baseLines = baseText.split(/\r?\n/).filter(l => l.trim());
  const deltaLines = deltaText.split(/\r?\n/).filter(l => l.trim());
  if (baseLines.length < 1) throw new Error("empty base archive");
  const header = baseLines[0];
  const ti = findTimeIdx(splitCsv(header));
  if (ti < 0) throw new Error(`base header missing a time column: ${header}`);
  const dti = deltaLines.length ? findTimeIdx(splitCsv(deltaLines[0])) : -1;
  if (dti < 0) throw new Error("delta header missing a time column (no rows back?)");
  const out = [header];
  let kept = 0, dropped = 0, added = 0;
  for (const line of baseLines.slice(1)) {
    const t = Date.parse(splitCsv(line)[ti]);
    if (Number.isFinite(t) && t < cutoffMs) { out.push(line); kept++; } else dropped++;
  }
  for (const line of deltaLines.slice(1)) { out.push(line); added++; }
  return { csv: out.join("\n") + "\n", kept, dropped, added };
}

// PATCH the saved query if we have an id, else create one (logged once).
async function ensureQuery(sql, name, idEnv) {
  const id = process.env[idEnv];
  if (id) {
    const r = await fetch(`${BASE}/query/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ query_sql: sql }) });
    if (r.ok) return id;
    // ⭐ SELF-HEAL: a saved query can be DELETED from Dune (or the key loses access to it), which
    // returns 404 "Query not found" — and that used to throw and stall the whole daily refresh, so
    // the AEON transfers/sales froze while the workflow stayed green (this is exactly what happened
    // to queries 8097520/8097522). On 404, fall through and recreate the query instead of dying; the
    // new query still runs the incremental SQL (cutoff from the committed CSV), so it just pulls the
    // missing delta. Other errors (auth, rate limit) still throw. Set the repo var to the logged new
    // id to avoid creating a fresh query each run.
    if (r.status !== 404) throw new Error(`patch query ${r.status}: ${await r.text()}`);
    console.warn(`  saved query ${id} (${idEnv}) is gone (404) — recreating it`);
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

// INCREMENTAL pull: read the committed archive, re-pull only rows since its last day, merge.
// dbTimeCol = the SOURCE column the SQL filters on (evt_block_time for transfers, block_time
// for sales) — distinct from the aliased output column, which is always `time`.
async function pull(sqlPath, outPath, name, idEnv, dbTimeCol) {
  const baseText = readFileSync(outPath, "utf8");        // the archive is committed in-repo
  const baseRows = baseText.split(/\r?\n/).filter(Boolean).length - 1;
  const cutoff = cutoffDay(archiveMaxTime(baseText));
  const sql = injectSince(readFileSync(sqlPath, "utf8"), dbTimeCol, cutoff);
  const id = await ensureQuery(sql, name, idEnv);
  const { csv: deltaCsv, credits } = await runToCsv(id); // small result → ~0-credit result read
  const { csv, kept, dropped, added } = mergeCsv(baseText, deltaCsv, cutoff);
  // The delta re-pulls the whole boundary day it replaces, so it must at least reproduce those
  // rows. Fewer means a short/failed read — keep the committed archive rather than truncate it.
  if (added < dropped) throw new Error(`delta short: ${added} new vs ${dropped} replaced (>= ${cutoff}) — keeping ${outPath}`);
  writeFileSync(outPath, csv);
  const total = kept + added;
  console.log(`  ${outPath}: +${(added - dropped).toLocaleString()} new since ${cutoff} → ${total.toLocaleString()} rows (was ${baseRows.toLocaleString()})`
    + (credits != null ? ` · ${credits} credits` : ""));
  return total;
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
  if (want("transfers")) await pull("dune/aeon_transfers.sql", "dune/out/aeon_transfers.csv", "Project AEON — transfers (auto)", "AEON_TRANSFERS_QUERY_ID", "evt_block_time");
  if (want("sales")) await pull("dune/aeon_sales.sql", "dune/out/aeon_sales.csv", "Project AEON — sales (auto)", "AEON_SALES_QUERY_ID", "block_time");
  // ⭐ HEARTBEAT for the feed audit + control panel. `updated` is the newest SALES DATA date
  // actually in the CSV — NOT the run date — so a pull that COMPLETES but returns nothing new (a
  // frozen source, or a suspended Dune account whose executions never leave PENDING) still reports
  // the real staleness and turns the freshness RED. A run-stamp here is exactly what masked the
  // stall: the control panel read "2 days old" while the chart sat in July. TRANSFERS now come from
  // Alchemy (build-aeon-transfers-alchemy.mjs) and are tracked by aeon-onchain.json's own date, so
  // this heartbeat covers ONLY sales — the one feed still on Dune. `checked` keeps the run date. A
  // thrown pull skips this line and leaves the last honest date. Deploy-ignored.
  const newestDataDate = ["dune/out/aeon_sales.csv"]
    .map(f => { try { return cutoffDay(archiveMaxTime(readFileSync(f, "utf8"))); } catch { return null; } })
    .filter(Boolean).sort().pop() || null;
  writeFileSync("public/aeon-dune-status.json", JSON.stringify({
    updated: newestDataDate || new Date().toISOString().slice(0, 10),
    checked: new Date().toISOString().slice(0, 10),
    ok: true, pulled: only || "transfers+sales",
  }));
  console.log(`aeon-dune: done. newest data ${newestDataDate}`);
}

// Only run when invoked directly (`node build-aeon-dune-refresh.mjs`), not when the pure helpers
// are imported by the tests — importing must not fire a Dune refresh.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    // Soft-fail: keep the daily banker green; the reconstructions fall back to the committed CSVs.
    console.error("aeon-dune: refresh failed (using last committed CSVs) —", e.message);
  });
}
