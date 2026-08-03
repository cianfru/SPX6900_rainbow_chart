// Reconstruct the SPX-on-Base RESIDENT set from the FULL transfer history (build-base-transfers.mjs
// → base-transfers.csv: sender,receiver,value,time; value RAW uint256). Base has the whole history
// (every holder, incl. sub-5k + exits), so this is full parity with the ETH suite: current balance,
// holder age (first ≥5k day), net-flow, and — because drops below the bar are visible — correct
// forward-fill membership (no dense-snapshot trick) plus a total holder count to validate against
// Blockscout (~114k).
//
//   node scripts/build-base-onchain.mjs --in=base-transfers.csv --out=public/base-onchain.json
//
// The fetcher writes in block order, so the CSV is already chronological → we STREAM it (no 6M-row
// sort, small heap). Balances are exact BigInt (raw 8-decimal); scaled to human only at output.
import { createReadStream, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DAY = 86400000;
const ZERO = "0x0000000000000000000000000000000000000000";
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : (process.argv.includes(`--${k}`) ? true : d); };

// LP / bridge / CEX / airdrop infra to EXCLUDE — NOT residents. Keys lowercase. kind ∈ bridge|lp|cex|airdrop.
//
// ⚠ ON BASE, "is a contract" does NOT mean infra — account abstraction is everywhere. EIP-7702 proxies,
// Coinbase Smart Wallet, and Safe/Gnosis multisigs are all REAL HOLDERS (a person's smart wallet), and
// must NOT be excluded. Only true AMM/LP pools (+ bridge/CEX hot wallets) are infra. The three LP pools
// below were confirmed via Blockscout contract names; the rest of the top holders are EOAs or smart wallets.
//
// 🔲 OWNER — verify on Basescan (EOAs, so no contract name to auto-detect): the #1 holder
//    0x9ab9ced0… (9.23M ≈ 30% of ≥5k supply) and 0x69ce7509… (1.69M). If either is a Coinbase/bridge
//    hot wallet, add it here (kind:"cex"/"bridge"); if a whale, leave it. It swings "held" a lot.
export const BASE_EXCLUDE = {
  "0xe96a4e9ea3a2c6db214174738a19eb7dbb8a3069": { kind: "lp", name: "Aerodrome vAMM WETH/SPX" },
  "0x037818b04ac34ea8b54b6683b79ef24d23c0e7cb": { kind: "lp", name: "Uniswap V3 SPX" },
  "0x4ba1e3e9280facbacafa7baf4ae0b78bea60beca": { kind: "lp", name: "Aerodrome CLPool SPX" },
};

// Streaming reconstruction. `rows` is any iterable of {from,to,value(BigInt),ts} — a generator over the
// CSV in main, or a plain array in tests. nowTs is an absolute reference (so the 30d flow window is
// known upfront in one pass). Pure aside from iterating.
export function reconstruct(rows, { threshold = 5000, nowTs, flowDays = 30, exclude = BASE_EXCLUDE } = {}) {
  const TH = BigInt(Math.round(threshold)) * 100000000n;          // ≥threshold in raw 8-decimal units
  const cut30 = nowTs - flowDays * DAY;
  const bal = new Map(), firstGE = new Map();
  let bal30 = null;
  const bump = (o, d, ts) => { const b = (bal.get(o) || 0n) + d; bal.set(o, b); if (b >= TH && !firstGE.has(o)) firstGE.set(o, ts); };
  for (const r of rows) {
    if (bal30 === null && r.ts >= cut30) bal30 = new Map(bal);    // snapshot balances as of ~30d ago
    bump(r.from, -r.value, r.ts);
    bump(r.to, r.value, r.ts);
  }
  if (bal30 === null) bal30 = new Map(bal);                       // all data older than the window
  const out = []; let exBal = 0n, totalHolders = 0;
  for (const [o, b] of bal) {
    if (o === ZERO || b <= 0n) continue;
    totalHolders++;                                               // any positive balance = a holder (validate ~114k)
    if (exclude[o]) { if (b >= TH) exBal += b; continue; }        // infra — not a resident
    if (b < TH) continue;
    const days = Math.max(0, Math.round((nowTs - (firstGE.get(o) ?? nowTs)) / DAY));
    const flow = Number(b - (bal30.get(o) || 0n)) / 1e8;
    out.push({ a: o, bal: Math.round(Number(b) / 1e8), days, flow: Math.round(flow) });
  }
  out.sort((a, b) => b.bal - a.bal);
  return { residents: out, totalHolders, excludedSupply: Math.round(Number(exBal) / 1e8) };
}

// Stream the CSV (sender,receiver,value,time) → {from,to,value:BigInt,ts}. Tolerant header detection.
async function* streamTransfers(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split(",");
    if (idx === null) {
      const h = c.map(s => s.trim().toLowerCase());
      idx = {
        from: h.findIndex(x => x.includes("send") || x === "from" || x.includes("from")),
        to: h.findIndex(x => x.includes("recei") || x === "to" || x.includes("to")),
        val: h.findIndex(x => x.includes("value") || x.includes("amount")),
        time: h.findIndex(x => x.includes("time") || x.includes("date") || x.includes("day")),
      };
      if (idx.from < 0 || idx.to < 0 || idx.val < 0 || idx.time < 0) throw new Error(`bad header: ${line}`);
      continue;
    }
    let value; try { value = BigInt(c[idx.val].trim()); } catch { continue; }   // raw integer string
    const ts = Date.parse(c[idx.time].trim());
    if (!Number.isFinite(ts)) continue;
    yield { from: c[idx.from].trim().toLowerCase(), to: c[idx.to].trim().toLowerCase(), value, ts };
  }
}

async function main() {
  const inPath = arg("in", "base-transfers.csv");
  const outPath = arg("out", "public/base-onchain.json");
  const threshold = Number(arg("threshold", 5000));
  const nowTs = arg("now", null) ? Date.parse(arg("now")) : Date.now();

  const { residents, totalHolders, excludedSupply } = await reconstruct(streamTransfers(inPath), { threshold, nowTs });
  if (!residents.length) throw new Error("no residents — check the CSV/columns and that value is the RAW integer");
  const held = residents.reduce((s, w) => s + w.bal, 0);
  const doc = {
    v: 1, updated: new Date(nowTs).toISOString().slice(0, 10), chain: "base",
    source: "Blockscout getLogs full transfer history → local net-balance reconstruction",
    threshold, totalHolders, excludedSupply, excluded: Object.keys(BASE_EXCLUDE).length,
    note: "residents = current ≥5k holders (forward-fill; exits visible from full history); age = first ≥5k day",
    wallets: residents,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc));
  console.log(`✓ ${outPath} — ${residents.length} residents ≥${threshold} · held ${(held / 1e6).toFixed(1)}M · ${totalHolders.toLocaleString()} total holders`
    + (excludedSupply ? ` · excluded ${(excludedSupply / 1e6).toFixed(1)}M` : ""));
  console.log(`  ⚠ validate totalHolders ≈ 114k (Blockscout). Top holders to tag as infra on Basescan:`);
  for (const w of residents.slice(0, 20)) console.log(`    ${w.a}  ${(w.bal / 1e6).toFixed(2)}M  age ${w.days}d`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
