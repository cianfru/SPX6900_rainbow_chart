// ============================================================================
// ENS NAMES for the wallets we already show
// ============================================================================
//   node scripts/build-ens.mjs [--limit=600] [--force]
//
// The skyline, the trader leaderboard and the sale cards all show wallets as
// 0x1234…abcd, which identifies nobody. This resolves the reverse ENS record for the
// addresses those surfaces actually display and caches them in public/ens.json, so
// hovering a tower can say "vitalik.eth" instead of a hex stub.
//
// Keyless, via api.ensideas.com — reverse resolution needs keccak256 for the namehash
// and there is no crypto dependency in this project worth adding for one build script.
//
// CACHED AND INCREMENTAL. A name is a slow-moving fact, and re-resolving several
// hundred addresses every day would be rude to a free endpoint for no benefit: only
// addresses missing from the cache are looked up, and a miss is remembered as `null`
// so it is not retried daily. `--force` re-resolves everything.
//
// BEHIND THE SANDBOX PROXY: NODE_USE_ENV_PROXY=1 node scripts/build-ens.mjs
// Node's built-in fetch does not read HTTPS_PROXY on its own.
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "public/ens.json";
const API = "https://api.ensideas.com/ens/resolve/";
const arg = (k, d) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.split("=")[1] : d; };
const force = process.argv.includes("--force");
const LIMIT = +arg("limit", 600);
const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/** Every address any surface displays, most prominent first. */
export function addressesToResolve() {
  const seen = new Map();                       // addr -> first rank seen (lower = more prominent)
  const add = (a, rank) => {
    if (typeof a !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a)) return;
    const k = a.toLowerCase();
    if (!seen.has(k) || rank < seen.get(k)) seen.set(k, rank);
  };
  // Skyline towers — the surface that most needs a name on hover.
  (readJson("public/aeon-onchain.json")?.holders || []).forEach((h, i) => add(h.a, i));
  // Trader leaderboard, both ends plus the volume board.
  const tr = readJson("public/aeon-traders.json") || {};
  for (const list of [tr.top, tr.bottom, tr.byVolume]) (list || []).forEach((t, i) => add(t.a, 1000 + i));
  // Counterparties on the sales the watcher can post.
  for (const s of readJson("public/aeon-market.json")?.biggest || []) { add(s.buyer, 2000); add(s.seller, 2000); }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([a]) => a);
}

async function resolveOne(addr) {
  try {
    const r = await fetch(API + addr, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false };
    const j = await r.json();
    // The endpoint echoes the address back as `name` when there is no reverse record.
    const name = typeof j?.name === "string" && j.name.includes(".") ? j.name : null;
    return { ok: true, name };
  } catch { return { ok: false }; }
}

async function main() {
  const cache = force ? {} : (readJson(OUT)?.names || {});
  const want = addressesToResolve().slice(0, LIMIT);
  const todo = want.filter(a => !(a in cache));
  console.log(`ens: ${want.length} addresses displayed · ${Object.keys(cache).length} cached · ${todo.length} to resolve`);

  let named = 0, failed = 0;
  // Serial with a small gap. This runs once a day at most and the endpoint is free;
  // hammering it in parallel is how a keyless dependency gets taken away.
  for (const a of todo) {
    const { ok, name } = await resolveOne(a);
    if (!ok) { failed++; continue; }        // leave it absent so the next run retries
    cache[a] = name;                        // null is a REMEMBERED miss, not a retry
    if (name) named++;
    await new Promise(r => setTimeout(r, 120));
  }

  const total = Object.values(cache).filter(Boolean).length;
  writeFileSync(OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    resolved: Object.keys(cache).length,
    named: total,
    names: cache,
  }, null, 0) + "\n");
  console.log(`  +${named} new names, ${failed} lookups failed (will retry next run)`);
  console.log(`  wrote ${OUT}: ${total} of ${Object.keys(cache).length} addresses have an ENS name`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("ens:", e.message); process.exit(1); });
