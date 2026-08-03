// Daily SPX-on-Base cohort refresh via ALCHEMY — keeps dune/out/spx6900_base_cohort.csv current the
// same way ETH/Solana stay current. The cohort (address, balance, status, first_5k_day, since_5k_day,
// exit_day) is the authoritative Alchemy transfer reconstruction of the ≥5k cohort — holders + everyone
// who ever crossed 5k and left. This script pulls transfers from Alchemy (alchemy_getAssetTransfers),
// replays them onto per-wallet running balances, and updates the cohort (new ≥5k crossings, exits).
//
//   node scripts/build-base-alchemy.mjs               # daily INCREMENTAL (delta since lastBlock)
//   node scripts/build-base-alchemy.mjs --full        # exact rebuild from genesis (seed / weekly self-heal)
//
// ENV: ALCHEMY_KEY (the AEON key), ALCHEMY_BASE_NETWORK (default base-mainnet), BASE_SPX.
// lastBlock is stored in the cohort CSV header comment. Seed once with --full (establishes lastBlock),
// then the daily cron runs incremental. Narrow gap: a wallet accumulating to ≥5k from an untracked
// sub-5k balance across the seam is caught by the periodic --full, not the daily delta.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NET = process.env.ALCHEMY_BASE_NETWORK || "base-mainnet";
const KEY = (process.env.ALCHEMY_KEY || "").trim();
const SPX = (process.env.BASE_SPX || "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C").toLowerCase();
const RPC = () => `https://${NET}.g.alchemy.com/v2/${KEY}`;
const THRESH = 5000n * 100000000n;   // ≥5k in raw 8-decimal units
const DEC = 100000000n;

// raw BigInt (8dp) ↔ human decimal string (exact, sign-aware)
export function rawToStr(b) { const s = b < 0n ? "-" : "", a = b < 0n ? -b : b; return `${s}${a / DEC}.${(a % DEC).toString().padStart(8, "0")}`; }
export function strToRaw(s) { s = s.trim(); const neg = s.startsWith("-"); if (neg) s = s.slice(1); const [i, f = ""] = s.split("."); const r = BigInt(i || "0") * DEC + BigInt((f + "00000000").slice(0, 8)); return neg ? -r : r; }

// The cohort state machine: replay transfers (ASC by block) onto per-wallet balances, tracking the
// first ≥5k day, the current-streak start, status, and exit day. `cohort` is a Map addr→record,
// mutated in place. Pure (no I/O) → unit-tested.
export function applyTransfers(cohort, transfers, { threshold = THRESH } = {}) {
  const get = a => { let r = cohort.get(a); if (!r) { r = { bal: 0n, first: "", since: "", status: "new", exit: "" }; cohort.set(a, r); } return r; };
  const bump = (a, delta, day) => {
    if (a === "0x0000000000000000000000000000000000000000") return;   // mint/burn sink
    const r = get(a), was = r.bal >= threshold;
    r.bal += delta;
    const now = r.bal >= threshold;
    if (now && !was) { if (!r.first) r.first = day; r.since = day; r.status = "holder"; r.exit = ""; }     // crossed up
    else if (!now && was) { r.status = "exited"; r.exit = day; r.since = ""; }                            // crossed down
  };
  for (const t of transfers) { bump(t.from, -t.value, t.day); bump(t.to, t.value, t.day); }
  return cohort;
}

// ---- Alchemy fetch ----
async function rpc(method, params) {
  for (let a = 0; a < 6; a++) {
    try {
      const r = await fetch(RPC(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }) });
      if (r.status === 429 || r.status >= 500) throw new Error(`http ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    } catch (e) { if (a === 5) throw e; await new Promise(res => setTimeout(res, 400 * 2 ** a)); }
  }
}

export function decodeTransfer(t) {
  let value; try { value = BigInt(t.rawContract?.value ?? "0x0"); } catch { return null; }
  const day = (t.metadata?.blockTimestamp || "").slice(0, 10);
  const block = parseInt(t.blockNum, 16);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(block)) return null;
  return { from: (t.from || "").toLowerCase(), to: (t.to || "").toLowerCase(), value, day, block };
}

async function fetchTransfers(fromBlock, onPage) {
  const out = []; let pageKey, maxBlock = fromBlock, pages = 0;
  do {
    const res = await rpc("alchemy_getAssetTransfers", [{
      fromBlock: "0x" + fromBlock.toString(16), toBlock: "latest",
      contractAddresses: [SPX], category: ["erc20"], order: "asc", withMetadata: true,
      maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
    }]);
    for (const t of (res?.transfers || [])) { const d = decodeTransfer(t); if (d) { out.push(d); if (d.block > maxBlock) maxBlock = d.block; } }
    pageKey = res?.pageKey; onPage?.(++pages, out.length);
  } while (pageKey);
  return { transfers: out, maxBlock };
}

// ---- cohort CSV I/O (with a lastBlock header comment) ----
const HEADER = "address,balance,status,first_5k_day,since_5k_day,exit_day";
export function loadCohort(text) {
  const cohort = new Map(); let lastBlock = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^#\s*lastBlock=(\d+)/); if (m) { lastBlock = Number(m[1]); continue; }
    if (line.startsWith("address,")) continue;
    const [a, bal, status, first, since, exit] = line.split(",");
    cohort.set(a.trim().toLowerCase(), { bal: strToRaw(bal), status: status?.trim() || "holder", first: first?.trim() || "", since: since?.trim() || "", exit: exit?.trim() || "" });
  }
  return { cohort, lastBlock };
}
export function dumpCohort(cohort, lastBlock) {
  const rows = [`# lastBlock=${lastBlock}`, HEADER];
  const arr = [...cohort.entries()].filter(([, r]) => r.status !== "new" || r.bal >= THRESH);   // ever-≥5k only
  arr.sort((a, b) => (b[1].bal > a[1].bal ? 1 : -1));
  for (const [a, r] of arr) rows.push(`${a},${rawToStr(r.bal)},${r.status === "holder" ? "holder" : "exited"},${r.first},${r.since},${r.exit}`);
  return rows.join("\n") + "\n";
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  if (!KEY) { console.log("base-alchemy: no ALCHEMY_KEY — soft-skipping (no write)"); return; }
  const csv = args.cohort || join(root, "dune/out/spx6900_base_cohort.csv");
  let cohort = new Map(), lastBlock = 0, full = !!args.full;
  if (!full && existsSync(csv)) ({ cohort, lastBlock } = loadCohort(readFileSync(csv, "utf8")));
  if (!full && !lastBlock) { console.log("no '# lastBlock=' yet — auto-seeding with a FULL rebuild"); full = true; cohort = new Map(); }
  const from = full ? 0 : lastBlock + 1;
  console.log(`base-alchemy: ${full ? "FULL rebuild" : `incremental from block ${from}`}`);
  const { transfers, maxBlock } = await fetchTransfers(from, (p, n) => { if (p % 20 === 0) console.log(`  …${p} pages · ${n} transfers`); });
  console.log(`  ${transfers.length} transfers to block ${maxBlock}`);
  applyTransfers(cohort, transfers);
  const newLast = Math.max(lastBlock, maxBlock);
  mkdirSync(dirname(csv), { recursive: true });
  writeFileSync(csv, dumpCohort(cohort, newLast));

  const holders = [...cohort.values()].filter(r => r.status === "holder" && r.bal >= THRESH).length;
  console.log(`✓ cohort ${csv} — ${holders} holders · lastBlock ${newLast}`);
  // regenerate base-onchain.json from the updated cohort
  const r = spawnSync(process.execPath, [join(root, "scripts/build-base-cohort.mjs"), `--in=${csv}`, `--out=${join(root, "public/base-onchain.json")}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("build-base-cohort failed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
