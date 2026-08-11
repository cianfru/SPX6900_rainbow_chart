// PHASE 1 of the entity graph — classify addresses as CONTRACT vs EOA and cache it forever.
//
// The whole "who owns what" architecture rests on correctly telling apart EXTERNAL endpoints
// (Gnosis Safes, DEX routers, settlement contracts, any smart contract) from plain externally-owned
// accounts. That's a single eth_getCode per address: bytecode ⇒ contract, empty ⇒ EOA. The type is
// IMMUTABLE (a deployed contract never becomes an EOA and vice-versa), so we cache it in
// public/addr-types.json and only ever classify NEW addresses — cheap and monotonic.
//
// Right now the consumer is the self-move gate (build-onchain-local.mjs): a split/merge that touches
// a contract is surfaced but NOT re-aged (a Safe fan-out could be a treasury distribution). Phase 2's
// clustering will read the same cache to decide which transfers are "internal" (EOA→EOA) vs external.
//
// Input: reads public/self-moves.json for the addresses to classify (override with --from=file, or
// pass addresses via --addrs=a,b,c). Keyless — a public ETH RPC (ETH_RPC to override). Soft by design:
// any RPC failure leaves the cache untouched and exits 0, so it can never break the on-chain cron.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const RPC = process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com";
const CACHE = arg("out") || "public/addr-types.json";
const isAddr = a => /^0x[0-9a-f]{40}$/.test(a);

// gather the addresses to classify
function gatherAddrs() {
  if (arg("addrs")) return arg("addrs").split(",").map(s => s.trim().toLowerCase()).filter(isAddr);
  const src = arg("from") || "public/self-moves.json";
  if (!existsSync(src)) return [];
  const set = new Set();
  try {
    const d = JSON.parse(readFileSync(src, "utf8"));
    for (const e of d.events || []) {
      for (const a of [e.source, e.target, ...(e.recipients || []), ...(e.sources || [])]) if (a && isAddr(a.toLowerCase())) set.add(a.toLowerCase());
    }
  } catch { /* unreadable → nothing to add */ }
  return [...set];
}

async function getCode(addr) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [addr, "latest"] }),
    signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`getCode ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result && j.result !== "0x" ? "contract" : "eoa";
}

async function main() {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { updated: null, types: {} };
  cache.types = cache.types || {};
  const todo = gatherAddrs().filter(a => !(a in cache.types));   // classify only NEW addresses (type is immutable)
  if (!todo.length) { console.log(`addr-types: nothing new (cache holds ${Object.keys(cache.types).length})`); return; }

  let ok = 0, contracts = 0;
  for (const a of todo) {
    try { const t = await getCode(a); cache.types[a] = t; ok++; if (t === "contract") contracts++; }
    catch (e) { console.warn(`  ${a.slice(0, 10)}… skipped: ${e.message}`); }   // leave unclassified; retried next run
  }
  if (!ok) { console.warn("addr-types: RPC unavailable — cache untouched"); return; }   // soft: don't write an empty pass
  cache.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`addr-types: classified ${ok}/${todo.length} new (${contracts} contracts) → ${Object.keys(cache.types).length} cached → ${CACHE}`);
}

main().catch(e => { console.warn("enrich-addr-types soft-failed:", e.message); process.exit(0); });
