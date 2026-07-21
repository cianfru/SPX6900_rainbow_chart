// Weekly FIFO on-chain refresh — keeps URPD / LTH-STH / SOPR / HODL waves / concentration /
// supply-in-profit / diamond history FRESH without a manual BigQuery export. Runs in CI
// (.github/workflows/onchain-refresh.yml), NOT the dev sandbox (Dune is egress-blocked there).
//
// WEEKLY-FULL, not incremental: filtering evt_Transfer to the SPX token prunes the scan to a
// handful of credits (the CEX query proved it — ~6), so re-running the whole raw-transfer dump
// weekly is cheap AND avoids append-storage complexity. Pipeline:
//   1. Execute the raw-transfer Dune query (execute → poll → /results/csv) → transfers.csv (~2.6M rows)
//   2. Generate a daily price CSV from public/price-history.json (SPX_DAILY fallback)
//   3. Run the LOCAL FIFO engine (build-onchain-local.mjs) → public/onchain.json + public/urpd.json
// The workflow commits both + redeploys. Needs DUNE_API_KEY (repo secret). Query id via
// DUNE_RAW_TRANSFERS_QUERY_ID; if unset, the query is created once from the embedded SQL (its id
// is logged — set it as a repo var to reuse and avoid re-creating).
//
// VALIDATE the first run: latest row should reconcile to the known extract — rp ~$0.53, ~49.5k
// ETH holders, top100 ~58%. If it drifts, something changed in the query/labels.
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.dune.com/api/v1";
const THRESHOLD = process.env.LTH_THRESHOLD || "155"; // LTH/STH split day-boundary (Glassnode standard)
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The raw-transfer dump (Query 1 of dune/spx6900_raw_transfers.sql). Columns the FIFO engine reads:
// sender/receiver/time/value (raw 8-decimal value — the engine scales).
const RAW_SQL = `SELECT "from" AS sender, "to" AS receiver, evt_block_time AS time, value AS value
FROM erc20_ethereum.evt_Transfer
WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
ORDER BY evt_block_time`;

function H() {
  const key = process.env.DUNE_API_KEY;
  if (!key) throw new Error("no DUNE_API_KEY — set the repo secret");
  return { "X-Dune-API-Key": key, "Content-Type": "application/json" };
}

// Resolve the query id: reuse DUNE_RAW_TRANSFERS_QUERY_ID, else create the query once.
async function queryId() {
  const existing = process.env.DUNE_RAW_TRANSFERS_QUERY_ID;
  if (existing) return existing;
  const r = await fetch(`${BASE}/query`, {
    method: "POST", headers: H(),
    body: JSON.stringify({ name: "SPX6900 raw transfers (FIFO refresh)", query_sql: RAW_SQL, is_private: false }),
  });
  if (!r.ok) throw new Error(`create query ${r.status}: ${await r.text()} — set DUNE_RAW_TRANSFERS_QUERY_ID instead`);
  const id = (await r.json())?.query_id;
  console.log(`created query ${id} — set repo var DUNE_RAW_TRANSFERS_QUERY_ID=${id} to reuse it`);
  return id;
}

// Execute a query, poll to completion, return the results as CSV text (handles the ~2.6M-row dump
// in one download, unlike the paginated JSON /results).
async function runToCsv(id) {
  const ex = await fetch(`${BASE}/query/${id}/execute`, { method: "POST", headers: H() });
  if (!ex.ok) throw new Error(`execute ${ex.status}: ${await ex.text()}`);
  const execution_id = (await ex.json())?.execution_id;
  if (!execution_id) throw new Error("no execution_id");
  let state = "";
  for (let i = 0; i < 120; i++) {           // up to ~10 min
    await sleep(5000);
    const st = await fetch(`${BASE}/execution/${execution_id}/status`, { headers: H() });
    if (!st.ok) throw new Error(`status ${st.status}`);
    const j = await st.json();
    state = j?.state;
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") throw new Error(`execution ${state}: ${JSON.stringify(j?.error || {})}`);
  }
  if (state !== "QUERY_STATE_COMPLETED") throw new Error(`timed out (last state ${state})`);
  const res = await fetch(`${BASE}/execution/${execution_id}/results/csv`, { headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY } });
  if (!res.ok) throw new Error(`results/csv ${res.status}`);
  return res.text();
}

// Daily price CSV (date,price) from the CI-cleaned price-history.json (SPX_DAILY fallback).
async function pricesCsv() {
  let rows = [];
  try {
    const ph = JSON.parse(readFileSync(join(root, "public/price-history.json"), "utf8"));
    const arr = Array.isArray(ph) ? ph : (ph.prices || ph.data || []);
    rows = arr.map(x => [x.date ?? x[0], x.price ?? x[1]]).filter(([d, p]) => d && p > 0);
  } catch { /* fall back */ }
  if (rows.length < 100) {
    const { SPX_DAILY } = await import("../src/spx-daily.js");
    rows = SPX_DAILY.map(([d, p]) => [d, p]);
  }
  return "date,price\n" + rows.map(([d, p]) => `${d},${p}`).join("\n") + "\n";
}

function runFifo(tPath, pPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("node", [
      join(root, "scripts/build-onchain-local.mjs"),
      `--transfers=${tPath}`, `--prices=${pPath}`,
      `--out=${join(root, "public/onchain.json")}`, `--urpd=${join(root, "public/urpd.json")}`,
      `--threshold=${THRESHOLD}`,
    ], { stdio: "inherit" });
    p.on("close", c => (c === 0 ? resolve() : reject(new Error(`FIFO engine exited ${c}`))));
  });
}

async function main() {
  const id = await queryId();
  console.log(`executing Dune query ${id} (raw transfers)…`);
  const csv = await runToCsv(id);
  const tPath = join(root, "tmp-transfers.csv"), pPath = join(root, "tmp-prices.csv");
  await writeFile(tPath, csv);
  await writeFile(pPath, await pricesCsv());
  console.log(`transfers: ${csv.split("\n").length - 2} rows · running FIFO engine (threshold ${THRESHOLD}d)…`);
  await runFifo(tPath, pPath);
}

main().catch(e => { console.error("onchain refresh failed:", e.message); process.exit(1); });
