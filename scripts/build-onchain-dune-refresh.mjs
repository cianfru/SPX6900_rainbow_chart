// Weekly hands-off on-chain FIFO refresh via the Dune API — INCREMENTAL (no BigQuery, no GCP).
//
// WHY THIS WORKS ON THE FREE TIER (owner's insight, 2026-07-22): the 402 only ever hit the
// FULL 2.6M-row export (a result-SIZE limit). We keep the full transfer history in a persisted
// ARCHIVE (a GitHub Release asset — the workflow downloads it before / re-uploads it after) and
// only pull the WEEKLY DELTA from Dune (`WHERE evt_block_time >= <last day in archive>`). That
// delta is ~17k rows → tiny result (no 402) and a partition-pruned scan (~a few credits). We then
// re-run the LOCAL FIFO engine over the merged archive ($0) → onchain.json + urpd.json.
//
// PIPELINE (this script; the workflow handles the release-asset download/upload + commit):
//   1. Read the base archive (--archive=transfers.csv, canonical or the owner's BigQuery columns).
//   2. Find the last day present → cutoff. Pull Dune transfers WHERE evt_block_time >= cutoff.
//   3. Merge: base rows STRICTLY BEFORE cutoff  +  the delta (>= cutoff) → rewrites --archive
//      canonically (sender,receiver,time,value). The boundary day is fully replaced (no dupes,
//      no gaps; self-heals stragglers next week).
//   4. Generate a daily price CSV from price-history.json (SPX_DAILY fallback).
//   5. Run build-onchain-local.mjs over the merged archive → public/onchain.json + urpd.json.
//
// SEED ONCE (can't be pulled from Dune — that's the 402 export): upload the existing 2.6M-row
// raw-transfer extract as the release asset `transfers.csv.gz`. After that it's fully hands-off.
//
// ENV: DUNE_API_KEY (repo secret). DUNE_INCREMENTAL_QUERY_ID (repo var) — a saved query whose SQL
// this script PATCHes each run; if unset, it creates one and logs the id (set it as the var to reuse).
// LTH_THRESHOLD (default 155). Reconcile the first run: rp ~$0.53, ~49.5k ETH holders, top100 ~58%.
import { writeFile } from "node:fs/promises";
import { readFileSync, createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.dune.com/api/v1";
const THRESHOLD = process.env.LTH_THRESHOLD || "155";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── pure helpers (unit-tested in test/onchain-dune-refresh.test.mjs) ─────────────────────────
export function splitCsv(line) { return line.split(",").map(s => s.trim().replace(/^"|"$/g, "")); }
export function colIdx(hdr) {
  const find = (...names) => hdr.findIndex(h => names.includes(h.toLowerCase()));
  return {
    from: find("from", "sender", "from_address"),
    to: find("to", "receiver", "to_address"),
    time: find("time", "evt_block_time", "block_time", "block_timestamp", "day"),
    value: find("value", "amount"),
  };
}
// Midnight (UTC) of the day of the max time in the archive → the cutoff we re-pull from.
export function cutoffDay(maxIso) {
  const t = Date.parse(maxIso);
  if (!Number.isFinite(t)) throw new Error(`archive max time unparseable: ${maxIso}`);
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function H() {
  const key = process.env.DUNE_API_KEY;
  if (!key) throw new Error("no DUNE_API_KEY — set the repo secret");
  return { "X-Dune-API-Key": key, "Content-Type": "application/json" };
}

// Token-filtered raw-transfer SQL. Incremental = open-ended (>= since); range = a bounded
// [since, until) window used to SEED the full history in chunks small enough to dodge the 402.
const COLS = `SELECT "from" AS sender, "to" AS receiver, evt_block_time AS time, value AS value
FROM erc20_ethereum.evt_Transfer
WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c`;
const incSql = since => `${COLS}\n  AND evt_block_time >= DATE '${since}'\nORDER BY evt_block_time`;
const rangeSql = (since, until) => `${COLS}\n  AND evt_block_time >= DATE '${since}' AND evt_block_time < DATE '${until}'\nORDER BY evt_block_time`;

// Set the query SQL: PATCH the saved query if we have an id, else create one (logged once).
async function ensureQuery(sql) {
  const id = process.env.DUNE_INCREMENTAL_QUERY_ID;
  if (id) {
    const r = await fetch(`${BASE}/query/${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ query_sql: sql }) });
    if (!r.ok) throw new Error(`patch query ${r.status}: ${await r.text()}`);
    return id;
  }
  const r = await fetch(`${BASE}/query`, { method: "POST", headers: H(), body: JSON.stringify({ name: "SPX6900 raw transfers (incremental FIFO)", query_sql: sql, is_private: false }) });
  if (!r.ok) throw new Error(`create query ${r.status}: ${await r.text()} — set DUNE_INCREMENTAL_QUERY_ID`);
  const nid = (await r.json())?.query_id;
  console.log(`created query ${nid} — set repo var DUNE_INCREMENTAL_QUERY_ID=${nid} to reuse it`);
  return nid;
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function runToCsv(id) {
  const ex = await fetch(`${BASE}/query/${id}/execute`, { method: "POST", headers: H(), body: JSON.stringify({ performance: "medium" }) });
  if (!ex.ok) throw new Error(`execute ${ex.status}: ${await ex.text()}`);
  const execution_id = (await ex.json())?.execution_id;
  if (!execution_id) throw new Error("no execution_id");
  let state = "";
  for (let i = 0; i < 150; i++) {
    await sleep(4000);
    const st = await fetch(`${BASE}/execution/${execution_id}/status`, { headers: H() });
    if (!st.ok) throw new Error(`status ${st.status}`);
    const j = await st.json();
    state = j?.state;
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") throw new Error(`execution ${state}: ${JSON.stringify(j?.error || {})}`);
  }
  if (state !== "QUERY_STATE_COMPLETED") throw new Error(`timed out (last state ${state})`);
  const res = await fetch(`${BASE}/execution/${execution_id}/results/csv`, { headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY } });
  if (!res.ok) throw new HttpError(res.status, `results/csv ${res.status}`);
  return res.text();
}

// ── SEED (one-time bootstrap) — build the full-history archive from Dune in chunks ───────────
// The full 2.6M-row history 402s in ONE export, but each bounded window is a small result.
// Walk month-by-month from launch; if a window still 402s (a hot month), split it in half and
// recurse. Writes canonical rows to `out`. ~35 months → ~35-70 cheap credits, one-time.
const LAUNCH = "2023-08-01";
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonth = iso => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const midDay = (a, b) => addDays(a, Math.max(1, Math.floor((Date.parse(b) - Date.parse(a)) / 86400000 / 2)));

async function fetchWindow(since, until) {          // returns data rows (no header), splitting on 402
  try {
    const id = await ensureQuery(rangeSql(since, until));
    const csv = await runToCsv(id);
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const idx = colIdx(splitCsv(lines[0]));
    return lines.slice(1).map(l => { const c = splitCsv(l); return `${c[idx.from]},${c[idx.to]},${c[idx.time]},${c[idx.value]}`; });
  } catch (e) {
    if (e.status === 402 && addDays(since, 1) < until) {   // too big → split the window
      const mid = midDay(since, until);
      console.log(`  window ${since}→${until} 402'd; splitting at ${mid}`);
      return [...await fetchWindow(since, mid), ...await fetchWindow(mid, until)];
    }
    throw e;
  }
}

async function seedArchive(out, fromISO) {
  const today = new Date().toISOString().slice(0, 10);
  const w = createWriteStream(out);
  w.write("sender,receiver,time,value\n");
  let total = 0;
  for (let s = fromISO; s < today; s = addMonth(s)) {
    const u = addMonth(s) < today ? addMonth(s) : today;
    const rows = await fetchWindow(s, u);
    for (const r of rows) w.write(r + "\n");
    total += rows.length;
    console.log(`seeded ${s}→${u}: +${rows.length} (total ${total})`);
  }
  await new Promise((res, rej) => w.end(err => (err ? rej(err) : res())));
  if (!total) throw new Error("seed produced 0 rows — check the token address / Dune access");
  return total;
}

// Stream the base archive → find the max time (last day = cutoff). One pass, no full load.
export async function archiveMaxTime(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx = null, max = "";
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (idx === null) { idx = colIdx(splitCsv(line)); if (idx.time < 0) throw new Error(`archive header missing a time column: ${line}`); continue; }
    const t = splitCsv(line)[idx.time];
    if (t > max) max = t; // ISO/space timestamps sort lexicographically by time
  }
  if (!max) throw new Error("archive has no data rows — SEED it first (upload the full extract as the release asset)");
  return max;
}

// Merge base (rows strictly before cutoff midnight) + delta (>= cutoff) → canonical archive.
export async function mergeArchive(basePath, deltaCsv, cutoff, outPath) {
  const cutoffMs = Date.parse(`${cutoff}T00:00:00Z`);
  const out = createWriteStream(outPath);
  out.write("sender,receiver,time,value\n");
  let kept = 0, dropped = 0, added = 0;
  // base rows before cutoff
  const rl = createInterface({ input: createReadStream(basePath), crlfDelay: Infinity });
  let bIdx = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (bIdx === null) { bIdx = colIdx(c); continue; }
    const t = Date.parse(c[bIdx.time]);
    if (Number.isFinite(t) && t < cutoffMs) { out.write(`${c[bIdx.from]},${c[bIdx.to]},${c[bIdx.time]},${c[bIdx.value]}\n`); kept++; }
    else dropped++;
  }
  // delta rows (all — they are >= cutoff by construction; replace the boundary day)
  const dl = deltaCsv.split(/\r?\n/).filter(l => l.trim());
  let dIdx = null;
  for (const line of dl) {
    const c = splitCsv(line);
    if (dIdx === null) { dIdx = colIdx(c); if (dIdx.from < 0 || dIdx.time < 0) throw new Error(`delta header missing columns: ${line}`); continue; }
    out.write(`${c[dIdx.from]},${c[dIdx.to]},${c[dIdx.time]},${c[dIdx.value]}\n`); added++;
  }
  await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
  return { kept, dropped, added };
}

async function pricesCsv() {
  let rows = [];
  try {
    const ph = JSON.parse(readFileSync(join(root, "public/price-history.json"), "utf8"));
    const arr = Array.isArray(ph) ? ph : (ph.prices || ph.data || []);
    rows = arr.map(x => [x.date ?? x[0], x.price ?? x[1]]).filter(([d, p]) => d && p > 0);
  } catch { /* fall back */ }
  if (rows.length < 100) { const { SPX_DAILY } = await import("../src/spx-daily.js"); rows = SPX_DAILY.map(([d, p]) => [d, p]); }
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
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const archive = args.archive || join(root, "transfers.csv");
  const pPath = join(root, "tmp-prices.csv");
  const haveArchive = existsSync(archive) && statSync(archive).size >= 100;

  // SEED MODE — EXPLICIT ONLY (--seed). Rebuilds the full history from Dune in monthly chunks
  // (each split on 402). This is a full-history SCAN — one-time and ~cheap (the owner's prior full
  // SPX scan was ~6 credits), but it is NEVER triggered automatically, so a missing archive can't
  // silently spend credits. PREFERRED zero-credit seed = re-run the FREE BigQuery extract + upload
  // (see the workflow header). Use --seed only if you'd rather Dune rebuild it (watch the meter).
  if (args.seed) {
    const from = typeof args.from === "string" ? args.from : LAUNCH;
    console.log(`SEED (explicit): building full archive from Dune, ${from} → today (monthly chunks, split on 402)…`);
    const total = await seedArchive(archive, from);            // writes canonical archive in place
    console.log(`seed complete: ${total} transfers → ${archive}`);
    await writeFile(pPath, await pricesCsv());
    await runFifo(archive, pPath);
    return;
  }
  if (!haveArchive) {
    throw new Error(`no archive at ${archive} — SEED it ONCE first (won't auto-seed, to protect Dune credits):\n` +
      `  • preferred (0 credits): re-run the FREE BigQuery extract → gzip → 'gh release create onchain-archive transfers.csv.gz …'\n` +
      `  • or (Dune, ~6 credits one-time): run this script locally with --seed`);
  }

  // INCREMENTAL MODE — archive exists: pull only the weekly delta, merge, FIFO.
  const maxT = await archiveMaxTime(archive);
  const cutoff = cutoffDay(maxT);
  console.log(`archive last transfer ${maxT} → pulling Dune delta from ${cutoff}…`);
  const id = await ensureQuery(incSql(cutoff));
  const deltaCsv = await runToCsv(id);
  console.log(`delta: ${deltaCsv.split("\n").length - 2} rows · merging…`);
  const merged = join(root, "tmp-transfers.csv");
  const stats = await mergeArchive(archive, deltaCsv, cutoff, merged);
  console.log(`merged: kept ${stats.kept} + added ${stats.added} (replaced ${stats.dropped} on/after ${cutoff})`);
  await writeFile(archive, readFileSync(merged)); // grown archive back to the asset path
  await writeFile(pPath, await pricesCsv());
  await runFifo(merged, pPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("dune onchain refresh failed:", e.message); process.exit(1); });
}
