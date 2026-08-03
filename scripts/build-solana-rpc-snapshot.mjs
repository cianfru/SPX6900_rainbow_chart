// Daily SPX-on-Solana snapshot via a FREE public RPC — the keyless, zero-Dune-credit daily feed.
// One getProgramAccounts call fetches every SPX SPL token account (base64 + dataSlice, the same
// lean transport snapshot.mjs already uses to COUNT holders), sums balances by OWNER, keeps the
// ≥5k cohort, and APPENDS today's rows to the committed archive (dune/out/spx6900_solana_balances.csv).
// Holder AGE + net-FLOW then build up FORWARD from the accumulating daily snapshots — no history
// walk needed (a point-in-time RPC can't reach the past; that's what the Dune 2026 base + the
// one-time PHASE-2 backfill are for). Reconstruction (build-solana-onchain.mjs) runs at the end.
//
//   node scripts/build-solana-rpc-snapshot.mjs [--archive=… --now=YYYY-MM-DD --out=…]
//
// ENV: SOL_RPC (default public mainnet-beta; set a FREE Helius/QuickNode URL if the public node
//   rate-limits the heavy getProgramAccounts), SOL_SPX (mint), SOL_THRESH (≥5k, human units).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeArchive } from "./build-solana-dune-refresh.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const RPC = process.env.SOL_RPC || "https://api.mainnet-beta.solana.com";
const MINT = process.env.SOL_SPX || "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const THRESH = Number(process.env.SOL_THRESH || 5000);
const DECIMALS = 8; // SPX on Solana

// base58 (Bitcoin/Solana alphabet). We fetch the token-account OWNER as raw bytes (offset 32) and
// must encode it to the same base58 string Dune's token_balance_owner uses, so a wallet keeps ONE
// identity across the Dune base + the RPC forward rows (else ages would reset every day).
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58encode(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil((bytes.length - zeros) * 138 / 100) + 1;   // ceil(n·log(256)/log(58))
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i], j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b58[k]; b58[k] = carry % 58; carry = (carry / 58) | 0;
    }
    length = j;
  }
  let str = "1".repeat(zeros);
  for (let it = size - length; it < size; it++) str += B58[b58[it]];
  return str;
}
export function b58decode(str) {
  const bytes = [0];
  for (const ch of str) {
    const val = B58.indexOf(ch); if (val < 0) throw new Error(`bad base58 char: ${ch}`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  let zeros = 0; while (zeros < str.length && str[zeros] === "1") zeros++;
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + bytes.length - 1 - i] = bytes[i];
  return out;
}

// Decode a getProgramAccounts base64 result (dataSlice offset 32, length 40 → [owner(32)|amount(8)])
// into a Map owner→human balance, summed across an owner's token accounts. Pure, so it's unit-tested.
export function sumByOwner(result) {
  const byOwner = new Map();
  for (const acc of result) {
    const b64 = acc?.account?.data?.[0]; if (!b64) continue;
    const buf = Buffer.from(b64, "base64"); if (buf.length < 40) continue;
    const owner = b58encode(buf.subarray(0, 32));
    const human = Number(buf.readBigUInt64LE(32)) / 10 ** DECIMALS;
    byOwner.set(owner, (byOwner.get(owner) || 0) + human);
  }
  return byOwner;
}

// ≥threshold owners → archive rows "owner,balance,day" (human balances, matching the Dune 2026 base
// which the reconstruction reads at --scale=1). Deterministic order for clean diffs.
export function snapshotRows(byOwner, day, threshold = THRESH) {
  const rows = [];
  for (const [owner, bal] of byOwner) if (bal >= threshold) rows.push([owner, bal]);
  rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return rows.map(([o, b]) => `${o},${b.toFixed(2)},${day}`);
}

async function fetchAccounts() {
  const payload = {
    jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
    params: [SPL_TOKEN_PROGRAM, {
      encoding: "base64",
      dataSlice: { offset: 32, length: 40 },              // owner (32) + amount (8) — lean payload
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: MINT } }],
    }],
  };
  const r = await fetch(RPC, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`rpc ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (j?.error) throw new Error(j.error.message || "rpc error");
  if (!Array.isArray(j?.result)) throw new Error("no result array");
  return j.result;
}

async function main() {
  const archive = args.archive || join(root, "dune/out/spx6900_solana_balances.csv");
  const day = args.now || new Date().toISOString().slice(0, 10);
  const base = readFileSync(archive, "utf8");

  const result = await fetchAccounts();
  const byOwner = sumByOwner(result);
  const rows = snapshotRows(byOwner, day);
  if (rows.length < 200) throw new Error(`only ${rows.length} ≥${THRESH} owners from RPC — expected ~2k; refusing to overwrite the archive (public node likely rate-limited — set SOL_RPC)`);
  console.log(`RPC snapshot ${day}: ${result.length} token accounts → ${byOwner.size} owners → ${rows.length} ≥${THRESH}`);

  // Boundary-day replace (idempotent same-day reruns): keep archive rows before today + today's snapshot.
  const { csv, added, kept } = mergeArchive(base, ["owner,balance,day", ...rows].join("\n"), day);
  writeFileSync(archive, csv);
  console.log(`merged: kept ${kept} (day < ${day}) + ${added} today → ${archive}`);

  const out = args.out || join(root, "public/solana-onchain.json");
  const r = spawnSync(process.execPath, [join(root, "scripts/build-solana-onchain.mjs"), `--in=${archive}`, "--scale=1", `--out=${out}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("build-solana-onchain failed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
