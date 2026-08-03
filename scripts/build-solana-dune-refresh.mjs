// Daily SPX-on-Solana refresh — the Solana sibling of build-onchain-dune-refresh.mjs (ETH). The full
// ≥5k daily-balance history lives as a GitHub RELEASE ASSET (solana-balances.csv.gz); each run pulls
// only the DAILY DELTA from Dune (`WHERE day >= <last day in archive>`), merges it in, and re-runs the
// local reconstruction → public/solana-onchain.json. The delta is a handful of days of ≥5k rows, so
// both the execution (~1 partition, ~0.03 cr) and the result-READ (a few hundred rows) are cheap —
// unlike the one-time bulk history pull, which is why the archive is SEEDED, not rebuilt each run.
//
//   node scripts/build-solana-dune-refresh.mjs --archive=solana-balances.csv
//
// SEED (one-time, owner): pull full history in ~90-day chunks (dune/spx6900_solana_balances.sql PHASE 2)
// + the 2026 CSV, concat → solana-balances.csv → gzip → `gh release create solana-archive
// solana-balances.csv.gz`. This script FAILS FAST if the archive is missing (never a silent full scan).
// ENV: DUNE_API_KEY (repo secret). DUNE_SOLANA_QUERY_ID (repo var) — a saved query PATCHed each run.
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const MINT = process.env.SOL_SPX || "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr";
const THRESH = Number(process.env.SOL_THRESH || 5000);
const BASE = "https://api.dune.com/api/v1";

export function splitCsv(line) { return line.split(",").map(s => s.trim().replace(/^"|"$/g, "")); }
export function colIdx(hdr) {
  const h = hdr.map(s => s.toLowerCase());
  const find = (...names) => { for (const n of names) { const i = h.findIndex(x => x === n || x.includes(n)); if (i >= 0) return i; } return -1; };
  return { owner: find("owner"), balance: find("balance"), day: find("day", "date", "time") };
}
// Midnight-UTC of the max `day` in the archive → the cutoff we re-pull from (boundary day replaced).
export function cutoffDay(maxIso) {
  const t = Date.parse(String(maxIso).replace(" ", "T").replace(/(\.\d+)?( UTC|Z)?$/, "Z"));
  if (!Number.isFinite(t)) throw new Error(`archive max day unparseable: ${maxIso}`);
  return new Date(t).toISOString().slice(0, 10);
}

const H = () => { const key = process.env.DUNE_API_KEY; if (!key) throw new Error("no DUNE_API_KEY — set the repo secret"); return { "X-Dune-API-Key": key, "Content-Type": "application/json" }; };

// The bounded delta query — day >= cutoff, ≥5k, mint-scoped. Month bound prunes partitions cheaply.
function deltaSql(cutoff) {
  const monthLo = cutoff.slice(0, 8) + "01";
  return `SELECT token_balance_owner AS owner, CAST(token_balance AS double) AS balance, CAST(day AS date) AS day
FROM solana_utils.daily_balances
WHERE token_mint_address = '${MINT}' AND token_balance >= ${THRESH}
  AND month >= DATE '${monthLo}' AND day >= TIMESTAMP '${cutoff}'
ORDER BY owner, day`;
}

async function ensureQuery(sql) {
  const id = process.env.DUNE_SOLANA_QUERY_ID;
  if (id) { const r = await fetch(`${BASE}/query/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ query_sql: sql }) }); if (!r.ok) throw new Error(`patch ${r.status}: ${await r.text()}`); return id; }
  const r = await fetch(`${BASE}/query`, { method: "POST", headers: H(), body: JSON.stringify({ name: "SPX6900 Solana daily_balances (incremental)", query_sql: sql, is_private: false }) });
  if (!r.ok) throw new Error(`create ${r.status}: ${await r.text()}`);
  const nid = (await r.json())?.query_id;
  console.log(`created query ${nid} — set repo var DUNE_SOLANA_QUERY_ID=${nid} to reuse it`);
  return nid;
}

async function runToCsv(id) {
  const ex = await fetch(`${BASE}/query/${id}/execute`, { method: "POST", headers: H() });   // free engine (no `performance`)
  if (!ex.ok) throw new Error(`execute ${ex.status}: ${await ex.text()}`);
  const { execution_id } = await ex.json();
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const st = await (await fetch(`${BASE}/execution/${execution_id}/status`, { headers: H() })).json();
    if (st.state === "QUERY_STATE_COMPLETED") break;
    if (st.state === "QUERY_STATE_FAILED" || st.state === "QUERY_STATE_CANCELLED") throw new Error(`execution ${st.state}`);
  }
  const res = await fetch(`${BASE}/execution/${execution_id}/results/csv`, { headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY } });
  if (!res.ok) throw new Error(`results ${res.status}: ${await res.text()}`);
  return res.text();
}

// Streaming max `day` in the archive (one pass, no full load).
export async function archiveMaxDay(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx = null, max = "";
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (idx === null) { idx = colIdx(c); if (idx.day < 0) throw new Error(`archive header missing a day column: ${line}`); continue; }
    const d = c[idx.day]; if (d > max) max = d;   // ISO dates sort lexicographically
  }
  if (!max) throw new Error("archive has no data rows — SEED it first (upload the full extract as the release asset)");
  return max;
}

// Merge: base rows with day < cutoff + the whole delta (day >= cutoff) → canonical owner,balance,day.
export function mergeArchive(baseText, deltaCsv, cutoff) {
  const out = ["owner,balance,day"];
  const bl = baseText.split(/\r?\n/); let bIdx = null;
  for (const line of bl) { if (!line.trim()) continue; const c = splitCsv(line); if (bIdx === null) { bIdx = colIdx(c); continue; }
    if (c[bIdx.day] < cutoff) out.push(`${c[bIdx.owner]},${c[bIdx.balance]},${c[bIdx.day]}`); }
  const dl = deltaCsv.split(/\r?\n/); let dIdx = null; let added = 0;
  for (const line of dl) { if (!line.trim()) continue; const c = splitCsv(line); if (dIdx === null) { dIdx = colIdx(c); if (dIdx.owner < 0 || dIdx.day < 0) throw new Error(`delta header missing columns: ${line}`); continue; }
    out.push(`${c[dIdx.owner]},${c[dIdx.balance]},${c[dIdx.day]}`); added++; }
  return { csv: out.join("\n") + "\n", added, kept: out.length - 1 - added };
}

async function main() {
  const archive = args.archive || join(root, "solana-balances.csv");
  const maxDay = await archiveMaxDay(archive);
  const cutoff = cutoffDay(maxDay);
  console.log(`archive last day ${maxDay} → pulling delta from ${cutoff}`);
  const id = await ensureQuery(deltaSql(cutoff));
  const delta = await runToCsv(id);
  const { csv, added, kept } = mergeArchive(readFileSync(archive, "utf8"), delta, cutoff);
  writeFileSync(archive, csv);
  console.log(`merged: kept ${kept} (day < ${cutoff}) + ${added} delta rows → ${archive}`);
  const r = spawnSync(process.execPath, [join(root, "scripts/build-solana-onchain.mjs"), `--in=${archive}`, "--scale=1", `--out=${join(root, "public/solana-onchain.json")}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("build-solana-onchain failed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
