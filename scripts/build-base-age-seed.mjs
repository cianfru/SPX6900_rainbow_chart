// ONE-TIME targeted age seed for the Base ≥5k cohort. The daily snapshot (build-base-snapshot.mjs)
// gives current residents but forward-only ages (everyone looks age-0 at launch — the same trap the
// 2M Solana wallet exposed). To back-date ages honestly WITHOUT the 6M-transfer dust pull, we fetch
// ONLY each current ≥5k wallet's OWN SPX transfer history (Blockscout per-address, dust-free), replay
// its running balance, and record the first day it crossed 5k. Those anchor rows are merged into the
// archive so residents() reads real ages; the daily snapshot then maintains them forward.
//
//   node scripts/build-base-age-seed.mjs           # seeds from public/base-onchain.json's residents
//   node scripts/build-base-age-seed.mjs --limit=20  # bounded trial run first
//
// Run ONCE (locally). Misses only historical EXITS (wallets no longer ≥5k) — negligible for ~800.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBalances, residents } from "./build-solana-onchain.mjs";  // generic reconstruction helpers
import { BASE_EXCLUDE } from "./build-base-onchain.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.BASE_BLOCKSCOUT_V2 || "https://base.blockscout.com/api/v2";
const SPX = (process.env.BASE_SPX || "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C").toLowerCase();
const THRESH = Number(process.env.BASE_THRESH || 5000);
const DELAY = Number(process.env.BASE_DELAY_MS || 120);

// Replay a wallet's SPX transfers (any order) → the first day its running balance reached ≥threshold.
// deltas: [{delta: BigInt(+in/-out), ts}]. Pure → unit-tested.
export function firstGe5kDay(deltas, threshold = THRESH) {
  const TH = BigInt(Math.round(threshold)) * 100000000n;
  const sorted = [...deltas].sort((a, b) => a.ts - b.ts);
  let bal = 0n;
  for (const d of sorted) { bal += d.delta; if (bal >= TH) return { ts: d.ts, bal }; }
  return null;   // never reached the bar in the data we have (data gap) — caller flags it
}

// One per-address token-transfer item → this wallet's signed delta, or null if not SPX / malformed.
export function deltaForWallet(item, wallet) {
  if ((item?.token?.address || item?.token?.address_hash || "").toLowerCase() !== SPX) return null;
  let v; try { v = BigInt(item.total?.value ?? item.value); } catch { return null; }
  const from = (item.from?.hash || item.from || "").toLowerCase();
  const to = (item.to?.hash || item.to || "").toLowerCase();
  const ts = Date.parse(item.timestamp || item.block_timestamp);
  if (!Number.isFinite(ts)) return null;
  let delta = 0n;
  if (to === wallet) delta += v;
  if (from === wallet) delta -= v;
  if (delta === 0n) return null;
  return { delta, ts };
}

async function getWithRetry(url, fetchImpl) {
  for (let a = 0; a < 6; a++) {
    try { const r = await fetchImpl(url, { headers: { Accept: "application/json" } }); if (r.status === 429 || r.status >= 500) throw new Error(`http ${r.status}`); return await r.json(); }
    catch (e) { if (a === 5) throw e; await new Promise(res => setTimeout(res, DELAY * 2 ** a)); }
  }
}

// All of a wallet's SPX transfer deltas (pages the per-address token-transfers endpoint).
export async function walletDeltas(fetchImpl, wallet, { maxPages = 400 } = {}) {
  const out = []; let next = null;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ token: SPX, type: "ERC-20", ...(next || {}) });
    const j = await getWithRetry(`${API}/addresses/${wallet}/token-transfers?${q}`, fetchImpl);
    for (const it of (j?.items || [])) { const d = deltaForWallet(it, wallet); if (d) out.push(d); }
    if (!j?.next_page_params) break;
    next = j.next_page_params;
    if (DELAY) await new Promise(res => setTimeout(res, DELAY));
  }
  return out;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  const archive = args.archive || join(root, "dune/out/spx6900_base_balances.csv");
  const outPath = args.out || join(root, "public/base-onchain.json");
  const day = args.now || new Date().toISOString().slice(0, 10);
  const cohort = JSON.parse(readFileSync(outPath, "utf8")).wallets.map(w => w.a);
  const list = args.limit ? cohort.slice(0, Number(args.limit)) : cohort;

  const anchors = []; let gaps = 0;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    try {
      const deltas = await walletDeltas(fetch, w);
      const a = firstGe5kDay(deltas);
      if (a) anchors.push(`${w},${(Number(a.bal) / 1e8).toFixed(2)},${new Date(a.ts).toISOString().slice(0, 10)}`);
      else gaps++;
    } catch (e) { gaps++; console.warn(`  ${w}: ${e.message}`); }
    if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${list.length} · ${anchors.length} anchors · ${gaps} gaps`);
  }

  // Merge anchor rows (historical) into the archive; dedupe (owner,day). Then reconstruct real ages.
  const lines = readFileSync(archive, "utf8").trim().split(/\r?\n/);
  const seen = new Set(); const merged = ["owner,balance,day"];
  for (const r of [...anchors, ...lines.slice(1)]) { const [o, , d] = r.split(","); const k = `${o}\t${d}`; if (seen.has(k)) continue; seen.add(k); merged.push(r); }
  writeFileSync(archive, merged.join("\n") + "\n");

  const rows = parseBalances(merged.join("\n"), 1);
  const wallets = residents(rows, { threshold: THRESH, nowTs: Date.parse(day), flowDays: 30, currentDay: day, exclude: BASE_EXCLUDE });
  const doc = JSON.parse(readFileSync(outPath, "utf8"));
  doc.wallets = wallets; doc.excludedSupply = wallets.excludedSupply;
  doc.note = "residents = latest ≥5k snapshot; age = first ≥5k day (targeted history seed + forward snapshots)";
  writeFileSync(outPath, JSON.stringify(doc));
  const ages = wallets.map(w => w.days).sort((a, b) => a - b);
  console.log(`✓ seeded ${anchors.length} ages (${gaps} gaps) → ${wallets.length} residents`);
  console.log(`  age percentiles(d): p10 ${ages[Math.floor(ages.length * .1)]} · p50 ${ages[Math.floor(ages.length * .5)]} · p90 ${ages[Math.floor(ages.length * .9)]} · max ${ages.at(-1)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
