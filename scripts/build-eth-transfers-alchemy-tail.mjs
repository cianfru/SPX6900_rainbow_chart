// ============================================================================
// ETH SPX transfers — LEADING-EDGE TAIL from Alchemy (freshness fix)
// ============================================================================
// The ETH transfer archive is rebuilt daily from Google's PUBLIC BigQuery dataset
// (bigquery-public-data.crypto_ethereum.token_transfers), which is a batch export
// that runs ~1–2 DAYS behind real time. So onchain.json / whales.json / exit-flow /
// smart-money and every FIFO-derived feed reconstructed only up to ~2 days ago.
//
// Alchemy reads a LIVE node (the same thing Zerion/Etherscan do), and we already use
// `alchemy_getAssetTransfers` for Base + AEON. This script pulls ONLY the leading edge
// — SPX transfers from the archive's last timestamp up to the latest block, a couple
// days / a few hundred rows / a handful of pages — and APPENDS them to transfers.csv
// so the engine reconstructs through TODAY. Near-zero cost (Alchemy free tier).
//
//   node scripts/build-eth-transfers-alchemy-tail.mjs --archive=transfers.csv
//
// Runs AFTER the BigQuery export step, BEFORE the FIFO engine, in onchain-dune.yml.
// The tail is written to the CSV only, NEVER back to the BigQuery table — tomorrow the
// public dataset catches up and the BigQuery append covers the same days from canonical
// data, so there is no duplication in the persistent archive.
//
// SOFT-FAILS (exit 0, leaves the CSV as the BigQuery export left it) so a bad Alchemy
// pull can never break the daily pipeline — worst case the feeds stay ~2 days old, as
// they were before this existed. ENV: ALCHEMY_KEY, ALCHEMY_NETWORK (default eth-mainnet),
// SPX_TOKEN (default the mainnet contract).
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = (process.env.SPX_TOKEN || "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c").toLowerCase();
const NET = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const ARCHIVE = (process.argv.find(a => a.startsWith("--archive=")) || "").split("=")[1] || "transfers.csv";
const BLOCKS_PER_DAY = 7200;         // ETH ≈ 12s/block
const PAGE_MS = 260;                 // ~4 req/s — getAssetTransfers is ~150 CU, never trips 429
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── pure helpers (unit-tested in test/eth-transfers-alchemy-tail.test.mjs) ─────────────────────
export function splitCsv(line) { return line.split(",").map(s => s.trim().replace(/^"|"$/g, "")); }

// newest transfer time already in the archive → ms (so we only append strictly newer rows).
// The archive header is `sender,receiver,time,value` (BigQuery) — time is the 3rd column.
export function archiveMaxTimeMs(csvText) {
  const lines = String(csvText || "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return 0;
  const hdr = splitCsv(lines[0]).map(s => s.toLowerCase());
  let ti = hdr.indexOf("time"); if (ti < 0) ti = hdr.indexOf("evt_block_time"); if (ti < 0) ti = 2;
  let max = 0;
  for (let i = 1; i < lines.length; i++) {
    const t = Date.parse(splitCsv(lines[i])[ti]);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

// One Alchemy erc20 transfer → { sender, receiver, time(ISO), value(raw integer string) } or null.
// value = the RAW on-chain integer (8-decimal base units) — the archive's `value` column is raw and
// the FIFO engine divides by 1e8. rawContract.value is a hex string; BigInt→decimal keeps it exact.
export function normalizeEthTransfer(t) {
  const from = t?.from, to = t?.to, time = t?.metadata?.blockTimestamp, rawHex = t?.rawContract?.value;
  if (!from || !to || !time || rawHex == null) return null;
  let value;
  try { value = BigInt(rawHex).toString(10); } catch { return null; }
  return { sender: String(from).toLowerCase(), receiver: String(to).toLowerCase(), time, value };
}

// filter to strictly-newer-than-sinceMs, dedup on (time,from,to,value), sort oldest-first.
export function tailRows(rawTransfers, sinceMs) {
  const seen = new Set(), rows = [];
  for (const t of rawTransfers || []) {
    const r = normalizeEthTransfer(t);
    if (!r) continue;
    if (!(Date.parse(r.time) > sinceMs)) continue;             // strict > so the boundary second can't duplicate
    const k = `${r.time}|${r.sender}|${r.receiver}|${r.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(r);
  }
  rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return rows;
}

// append rows to the archive CSV text (rows already in `sender,receiver,time,value` order).
export function appendToArchive(csvText, rows) {
  const base = String(csvText || "").replace(/\n+$/, "");
  if (!rows.length) return base + "\n";
  const body = rows.map(r => `${r.sender},${r.receiver},${r.time},${r.value}`).join("\n");
  return base + "\n" + body + "\n";
}

// ── Alchemy fetch ──────────────────────────────────────────────────────────────────────────────
async function rpc(key, method, params) {
  const url = `https://${NET}.g.alchemy.com/v2/${key}`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  if (!r.ok) throw new Error(`alchemy ${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (j.error) throw new Error(`alchemy ${method}: ${JSON.stringify(j.error).slice(0, 200)}`);
  return j.result;
}

async function fetchTail(key, fromBlockHex) {
  const all = [];
  let pageKey, pages = 0;
  do {
    const res = await rpc(key, "alchemy_getAssetTransfers", [{
      fromBlock: fromBlockHex, toBlock: "latest", contractAddresses: [CONTRACT],
      category: ["erc20"], order: "asc", withMetadata: true, excludeZeroValue: false,
      maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
    }]);
    all.push(...(res?.transfers || []));
    pageKey = res?.pageKey;
    pages++;
    if (pageKey) await sleep(PAGE_MS);
  } while (pageKey && pages < 60);   // safety cap — the tail is a couple days, never 60 pages
  console.log(`  fetched ${all.length} raw transfers over ${pages} page(s) from block ${fromBlockHex}`);
  return all;
}

async function main() {
  if (!process.env.ALCHEMY_KEY) { console.log("eth-tail: no ALCHEMY_KEY — soft-skipping (feeds stay at the BigQuery edge)"); return; }
  if (!existsSync(ARCHIVE)) { console.log(`eth-tail: ${ARCHIVE} not found — soft-skipping`); return; }
  const csv = readFileSync(ARCHIVE, "utf8");
  const maxMs = archiveMaxTimeMs(csv);
  if (!maxMs) { console.log("eth-tail: archive has no parseable timestamps — soft-skipping"); return; }
  const daysBehind = Math.max(1, Math.ceil((Date.now() - maxMs) / 86400000));
  console.log(`eth-tail: archive edge ${new Date(maxMs).toISOString().slice(0, 10)} (${daysBehind}d behind); pulling the SPX leading edge from Alchemy (${NET})…`);

  const key = process.env.ALCHEMY_KEY;
  const latest = parseInt(await rpc(key, "eth_blockNumber", []), 16);
  // pull a generous block window (daysBehind + 2, min 3 days) and filter by timestamp — cheap over-pull.
  const fromBlock = Math.max(0, latest - (daysBehind + 2) * BLOCKS_PER_DAY);
  const raw = await fetchTail(key, "0x" + fromBlock.toString(16));
  const rows = tailRows(raw, maxMs);
  if (!rows.length) { console.log("eth-tail: no transfers newer than the archive edge — nothing to append (already current)"); return; }

  writeFileSync(ARCHIVE, appendToArchive(csv, rows));
  const newest = rows.at(-1).time.slice(0, 10);
  console.log(`eth-tail: appended ${rows.length.toLocaleString()} SPX transfers → newest ${newest} (was ${new Date(maxMs).toISOString().slice(0, 10)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    // Soft-fail: keep the daily pipeline green; feeds stay at the BigQuery edge (~2 days), as before.
    console.error("eth-tail: failed (leaving the BigQuery archive as-is) —", e.message);
  });
}
