// Daily SPX-on-Base ≥5k snapshot via Blockscout's holders endpoint — keyless, dust-immune, zero
// Dune credits. Base's ~114k headcount is ~99% airdrop dust; only ~795 wallets hold ≥5k. The holders
// endpoint returns balances sorted DESC, so we page until we drop below the bar (~16 pages) — the ≥5k
// cohort only, no dust, no 6M-transfer pull. Appends today's snapshot to the committed archive and
// reconstructs residents (current membership = today's snapshot; age = first ≥5k day in the archive,
// accruing forward until the targeted history seed backfills it) — the same model as the Solana feed.
//
//   node scripts/build-base-snapshot.mjs --out=public/base-onchain.json
//
// Reuses the generic, unit-tested reconstruction (residents/parseBalances/mergeArchive) with the Base
// infra exclude set. ENV: BASE_BLOCKSCOUT_V2, BASE_SPX, BASE_THRESH (≥5k), BASE_DELAY_MS.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { residents, parseBalances } from "./build-solana-onchain.mjs";   // chain-agnostic helpers
import { mergeArchive } from "./build-solana-dune-refresh.mjs";           // boundary-day-replace merge
import { BASE_EXCLUDE } from "./build-base-onchain.mjs";                  // single source of truth for Base infra

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.BASE_BLOCKSCOUT_V2 || "https://base.blockscout.com/api/v2";
const SPX = process.env.BASE_SPX || "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C";
const THRESH = Number(process.env.BASE_THRESH || 5000);
const DELAY = Number(process.env.BASE_DELAY_MS || 150);

async function getWithRetry(url, fetchImpl) {
  for (let a = 0; a < 6; a++) {
    try {
      const r = await fetchImpl(url, { headers: { Accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) throw new Error(`http ${r.status}`);
      return await r.json();
    } catch (e) { if (a === 5) throw e; await new Promise(res => setTimeout(res, DELAY * 2 ** a)); }
  }
}

// Page the holders endpoint (balances DESC) until below the bar → [{owner, bal(human)}]. Pure aside
// from fetching; the item→row decode is what the test pins.
export function decodeHolders(items, threshold = THRESH) {
  const bar = BigInt(Math.round(threshold)) * 100000000n, out = [];
  let below = false;
  for (const it of items) {
    let v; try { v = BigInt(it.value); } catch { continue; }
    if (v < bar) { below = true; break; }              // sorted DESC → first sub-bar holder ends it
    const addr = (it.address?.hash || it.address || "").toLowerCase();
    if (addr) out.push({ owner: addr, bal: Number(v) / 1e8 });
  }
  return { rows: out, below };
}

export async function fetchHolders({ fetchImpl, threshold = THRESH, onProgress } = {}) {
  const rows = []; let next = null;
  for (let i = 0; i < 300; i++) {
    const url = `${API}/tokens/${SPX}/holders` + (next ? "?" + new URLSearchParams(next) : "");
    const j = await getWithRetry(url, fetchImpl);
    const items = j?.items || [];
    if (!items.length) break;
    const { rows: page, below } = decodeHolders(items, threshold);
    rows.push(...page);
    onProgress?.({ page: i + 1, total: rows.length });
    if (below || !j.next_page_params) break;
    next = j.next_page_params;
    if (DELAY) await new Promise(res => setTimeout(res, DELAY));
  }
  return rows;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  const archive = args.archive || join(root, "dune/out/spx6900_base_balances.csv");
  const outPath = args.out || join(root, "public/base-onchain.json");
  const day = args.now || new Date().toISOString().slice(0, 10);

  const holders = await fetchHolders({ fetchImpl: fetch, onProgress: ({ page, total }) => { if (page % 5 === 0) console.log(`  …page ${page} · ${total} ≥${THRESH}`); } });
  if (holders.length < 50) throw new Error(`only ${holders.length} ≥${THRESH} holders — endpoint issue; refusing to overwrite`);

  const snap = holders.map(h => `${h.owner},${h.bal.toFixed(2)},${day}`);
  const base = existsSync(archive) ? readFileSync(archive, "utf8") : "owner,balance,day";
  const { csv } = mergeArchive(base, ["owner,balance,day", ...snap].join("\n"), day);  // boundary-day replace
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(archive, csv);

  const rows = parseBalances(csv, 1);
  const wallets = residents(rows, { threshold: THRESH, nowTs: Date.parse(day), flowDays: 30, currentDay: day, exclude: BASE_EXCLUDE });
  const held = wallets.reduce((s, w) => s + w.bal, 0);
  const doc = {
    v: 1, updated: day, chain: "base", source: "Blockscout holders endpoint (≥5k, dust-immune) snapshot-forward",
    threshold: THRESH, excludedSupply: wallets.excludedSupply, excluded: Object.keys(BASE_EXCLUDE).length,
    note: "residents = today's ≥5k snapshot; age = first ≥5k day in the archive (forward until the targeted history seed backfills)",
    wallets,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc));
  console.log(`✓ ${outPath} — ${wallets.length} residents ≥${THRESH} · held ${(held / 1e6).toFixed(1)}M · snapshot ${day} (${holders.length} fetched)`);
  console.log(`  top holders to tag as infra (Basescan) → add to BASE_EXCLUDE in build-base-onchain.mjs:`);
  for (const w of wallets.slice(0, 12)) console.log(`    ${w.a}  ${(w.bal / 1e6).toFixed(2)}M`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
