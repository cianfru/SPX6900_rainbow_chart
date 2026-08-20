// ============================================================================
// PROJECT AEON — transfer history from Alchemy (replaces the Dune transfers pull)
// ============================================================================
// The Dune account is suspended, so the daily Dune transfers pull froze the whole
// holder-analytics half (holder age, concentration, holder flow, owners-over-time,
// timeline, skyline) at 2026-07-23. Alchemy `getAssetTransfers` returns the SAME
// data — from / to / tokenId / timestamp — and we already pay for the key, so this
// makes Alchemy the single source for AEON transfers.
//
//   node scripts/build-aeon-transfers-alchemy.mjs [--out=dune/out/aeon_transfers.csv]
//
// It writes the EXACT CSV the reconstructions already read (header
// `from_address,to_address,token_id,time`, ISO timestamps), so nothing downstream
// changes — build-aeon-onchain.mjs and build-city-timeline.mjs keep reading the same
// file. AEON is a 3,333-piece collection (~25k lifetime transfers), so we pull the
// WHOLE history every run (~26 pages) — no archive/merge complexity (the same call
// costs the same whether we ask for the delta or all of it).
//
// SOFT-FAILS (exit 0) and NEVER truncates: on any error, or if the fetch comes back
// with fewer rows than the committed CSV already has, it keeps the committed file so a
// half-finished pull can't wipe the archive. ENV: ALCHEMY_KEY (secret), ALCHEMY_NETWORK
// (default eth-mainnet), AEON_CONTRACT (default the mainnet contract).
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const NET = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const OUT = (process.argv.find(a => a.startsWith("--out=")) || "").split("=")[1] || "dune/out/aeon_transfers.csv";
const PAGE_MS = 260;                 // ~4 req/s — getAssetTransfers is ~150 CU, never trips 429
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── pure helpers (unit-tested in test/aeon-transfers-alchemy.test.mjs) ────────────────────────
// Alchemy returns the ERC-721 tokenId as a hex string (e.g. "0x0d05"); the CSV the
// reconstructions read has always carried a DECIMAL id, so convert. Bad/empty ids are dropped.
export function tokenIdToDecimal(hexOrDec) {
  if (hexOrDec == null) return null;
  const s = String(hexOrDec).trim();
  if (!s) return null;
  try { return (/^0x/i.test(s) ? BigInt(s) : BigInt(s)).toString(10); }
  catch { return /^\d+$/.test(s) ? s : null; }
}

// One Alchemy transfer → our row, or null to drop (missing id / timestamp). `from` for a
// mint is the zero address — KEPT, because the mint is a token's first transfer and the
// reconstructions need it to age the token. Addresses lowercased; timestamp kept as the
// ISO string Alchemy returns (build-aeon-onchain/city-timeline parseTime handle ISO).
export function normalizeTransfer(t) {
  const id = tokenIdToDecimal(t?.erc721TokenId ?? t?.tokenId);
  const time = t?.metadata?.blockTimestamp;
  const from = t?.from, to = t?.to;
  if (!id || !time || !from || !to) return null;
  return { from: String(from).toLowerCase(), to: String(to).toLowerCase(), id, time };
}

// Full transfer list → CSV text with the canonical header, sorted oldest-first so holder
// age reconstructs correctly. Deduped on (id, time, from, to) in case a pageKey overlaps.
export function transfersToCsv(transfers) {
  const seen = new Set(), rows = [];
  for (const t of transfers || []) {
    const r = normalizeTransfer(t);
    if (!r) continue;
    const k = `${r.id}|${r.time}|${r.from}|${r.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(r);
  }
  rows.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const body = rows.map(r => `${r.from},${r.to},${r.id},${r.time}`).join("\n");
  return { csv: `from_address,to_address,token_id,time\n${body}\n`, count: rows.length };
}

export function csvRowCount(text) {
  return String(text || "").split(/\r?\n/).filter(l => l.trim()).length - 1; // minus header
}

// ── Alchemy fetch ────────────────────────────────────────────────────────────────────────────
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

// Both transfer directions come back in one contract-scoped query; page through with pageKey.
async function fetchAllTransfers(key) {
  const all = [];
  let pageKey, pages = 0;
  do {
    const res = await rpc(key, "alchemy_getAssetTransfers", [{
      fromBlock: "0x0", toBlock: "latest", contractAddresses: [CONTRACT],
      category: ["erc721"], order: "asc", withMetadata: true, excludeZeroValue: false,
      maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
    }]);
    const batch = res?.transfers || [];
    all.push(...batch);
    pageKey = res?.pageKey;
    pages++;
    if (pageKey) await sleep(PAGE_MS);
  } while (pageKey);
  console.log(`  fetched ${all.length} raw transfers over ${pages} page(s)`);
  return all;
}

async function main() {
  if (!process.env.ALCHEMY_KEY) { console.log("aeon-transfers: no ALCHEMY_KEY — soft-skipping (reconstructions use the committed CSV)"); return; }
  console.log(`aeon-transfers: pulling full ERC-721 history for ${CONTRACT} from Alchemy (${NET})…`);
  const raw = await fetchAllTransfers(process.env.ALCHEMY_KEY);
  const { csv, count } = transfersToCsv(raw);
  const before = existsSync(OUT) ? csvRowCount(readFileSync(OUT, "utf8")) : 0;
  // NEVER truncate: a partial pull (network drop mid-pagination) must not shrink the archive.
  if (count < before * 0.9) throw new Error(`fetched ${count} rows vs ${before} committed — refusing to shrink the archive (keeping ${OUT})`);
  if (count < 3333) throw new Error(`only ${count} rows — below the 3,333 mint floor, treating as a bad pull (keeping ${OUT})`);
  writeFileSync(OUT, csv);
  const newest = csv.trimEnd().split("\n").at(-1).split(",")[3] || "?";
  console.log(`aeon-transfers: wrote ${count.toLocaleString()} rows to ${OUT} (was ${before.toLocaleString()}) · newest ${newest.slice(0, 10)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    // Soft-fail: keep the daily banker green; the reconstructions fall back to the committed CSV.
    console.error("aeon-transfers: failed (using last committed CSV) —", e.message);
  });
}
