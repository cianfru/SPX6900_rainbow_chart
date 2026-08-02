// Bank the on-chain city noticeboard into public/city-notes.json.
//
//   node scripts/build-city-notes.mjs [--out=public/city-notes.json]
//
// Reads CityNotes logs from every chain the contract is deployed on and writes the LATEST note per
// (city, wallet). We store nothing that isn't already public — this file is a cache of the chain,
// not a source of truth, and deleting it costs nothing but a re-read.
//
// Runs as a step in the daily snapshot cron. Needs ALCHEMY_KEY (already set for the AEON pipeline);
// with no key, or with no contract deployed yet, it writes an empty board and exits cleanly rather
// than failing the cron — the city just shows no signs.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NOTE_TOPIC, decodeNoteData, topicAddress } from "../src/evm.js";
import { CHAINS, CHAIN_IDS, CONTRACTS, displayable } from "../src/city-messages.js";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const KEY = process.env.ALCHEMY_KEY || "";

// ── where we READ logs from ─────────────────────────────────────────────────────────────────────
// eth_getLogs over historical ranges is where free RPC tiers bite: Alchemy's free tier now caps
// eth_getLogs at a *10-block* range, which makes a deploy→head backfill impossible (hundreds of
// thousands of blocks). So the noticeboard reads from KEYLESS public RPCs that allow wide ranges,
// tried in order per window (measured 2026-08: base.org and dRPC both serve archive getLogs at a
// 10k-block cap; base.org is the reliable one, dRPC free times out intermittently, publicnode
// refuses archive without a token, 1rpc caps at 50 blocks). Failover across the pool means one
// endpoint's blip doesn't lose the window; the span also auto-shrinks if an endpoint caps lower.
// Prepend your own endpoint(s) with NOTES_RPC_<CHAIN> (comma-separated) — e.g. a keyed provider.
const POOL = {
  base: [...(process.env.NOTES_RPC_BASE || process.env.NOTES_RPC || "").split(",").filter(Boolean),
    "https://mainnet.base.org", "https://base.drpc.org", "https://base.meowrpc.com"],
  ethereum: [...(process.env.NOTES_RPC_ETHEREUM || process.env.NOTES_RPC || "").split(",").filter(Boolean),
    "https://eth.drpc.org", "https://ethereum.publicnode.com", "https://eth.meowrpc.com"],
};
// A bare Alchemy template (…/v2/) still needs the key appended; a full public URL is used as-is.
const rpcUrl = u => (u.endsWith("/v2/") ? u + KEY : u);

// Window per chain, sized to the endpoints' cap (10k). Auto-shrinks on a range-limit error, so a
// stricter endpoint still works, just in more calls.
const SPAN = { ethereum: 10_000, base: 10_000 };

// The block each CityNotes was deployed at. The first run starts here instead of block 0 — nothing
// exists before the contract, so scanning genesis→deploy is pure waste (~60 empty Base windows).
// After the first run the saved head takes over and this is moot. Fill one in when a chain goes
// live; a chain with no entry falls back to 0 (correct, just slower on run one).
const DEPLOY_BLOCK = { base: 49_240_526 };              // 0xa167867B…C282262, Jul 2026

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callRpc(url, method, params) {
  const r = await fetch(rpcUrl(url), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// A provider rejecting a getLogs window says so in a dozen different ways ("block range too large",
// "up to a 10 block range", "limited to a 10,000 range", "more than N results"). Match loosely so
// the auto-shrink triggers on any of them. Every endpoint caps the same way, so a range error means
// shrink — not "try the next endpoint".
const isRangeError = m => /\brange\b|too large|too many results|\b10,?000\b|more than \d+ results/i.test(m || "");

async function blockNumber(chain) {
  let last;
  for (const url of POOL[chain]) { try { return Number(await callRpc(url, "eth_blockNumber", [])); } catch (e) { last = e; } }
  throw new Error(`${chain} eth_blockNumber: ${last?.message || "no endpoint"}`);
}

// One window, tried across the whole pool (a couple passes with backoff). A range error propagates
// immediately so the caller shrinks; anything else (timeout/429/blip) rotates to the next endpoint.
async function getLogsWindow(chain, from, to) {
  const params = [{ address: CONTRACTS[chain], topics: [NOTE_TOPIC], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }];
  let last;
  for (let pass = 0; pass < 3; pass++) {
    for (const url of POOL[chain]) {
      try { return await callRpc(url, "eth_getLogs", params); }
      catch (e) { last = e; if (isRangeError(e.message)) throw e; }
    }
    await sleep(500 * (pass + 1));
  }
  throw last || new Error(`${chain}: all endpoints failed`);
}

export async function readChain(chain, fromBlock, log = console.log) {
  const address = CONTRACTS[chain];
  if (!address) return { notes: [], head: fromBlock };
  const head = await blockNumber(chain);
  const out = [];
  let from = fromBlock, span = SPAN[chain];
  while (from <= head) {
    const to = Math.min(head, from + span - 1);
    let logs;
    try {
      logs = await getLogsWindow(chain, from, to);
    } catch (e) {
      // Window too wide for the pool → shrink and retry the SAME window (floor 10 blocks, the
      // tightest known cap). Any other failure across every endpoint is a genuine stuck window →
      // rethrow so main() keeps the previous head and retries the whole range next run.
      if (span > 10 && isRangeError(e.message)) { span = Math.max(10, Math.floor(span / 4)); continue; }
      throw e;
    }
    for (const l of logs) {
      const { city, text } = decodeNoteData(l.data);
      out.push({
        chain, city, text,
        who: topicAddress(l.topics[1]),
        block: Number(l.blockNumber),
        tx: l.transactionHash,
      });
    }
    from = to + 1;
    await sleep(150);                       // pace the walk so the free tier doesn't start timing out
  }
  log(`  ${chain}: ${out.length} notes up to block ${head} (window ${span})`);
  return { notes: out, head };
}

// Latest note per (city, wallet) wins — that IS the "one message, replaceable" rule, applied by
// the reader rather than by the contract. Ordering is by block then log position, so two notes in
// the same block still resolve deterministically. Pure, so it can be tested without a chain.
export function foldNotes(all) {
  const cities = {};
  const ordered = all.slice().sort((a, b) => a.block - b.block || a.chain.localeCompare(b.chain));
  for (const n of ordered) {
    if (!n.city || !n.text) continue;
    // Filtered here as well as at render time: no reason to ship text the city will refuse to draw.
    if (!displayable(n.text)) continue;
    (cities[n.city] ||= {})[n.who] = { text: n.text, chain: n.chain, block: n.block, tx: n.tx };
  }
  return cities;
}

async function main() {
  const out = arg("out", "public/city-notes.json");
  const live = CHAIN_IDS.filter(c => CONTRACTS[c]);

  let prev = { heads: {}, cities: {} };
  try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }

  if (!live.length) {
    console.log("CityNotes isn't deployed yet — skipping");
    // Seed an empty board so the site fetch 200s instead of 404ing on every load.
    if (!prev.updated && !Object.keys(prev.cities || {}).length) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ updated: null, heads: {}, cities: {} }, null, 2));
    }
    return;
  }

  const notes = [], heads = { ...prev.heads };
  let ok = 0;
  for (const chain of live) {
    // Resume from the last block we read, but never before the contract's own deploy block. Re-
    // reading the last block is harmless (latest-wins), and it means a reorg at the tip self-
    // corrects on the next run.
    const from = Math.max(DEPLOY_BLOCK[chain] ?? 0, prev.heads?.[chain] ?? 0);
    try {
      const { notes: n, head } = await readChain(chain, from);
      notes.push(...n);
      heads[chain] = head;                 // only advance the head for a chain that fully read
      ok++;
    } catch (e) {
      // One chain's RPC hiccup must not lose the noticeboard: keep the old head so we retry this
      // range next run, keep the notes already banked, and never fail the cron over a sign.
      console.error(`  ${chain}: read failed — ${e.message} (keeping previous head, will retry)`);
    }
  }

  // Carry forward what we already had — the walk above only covers new blocks.
  const merged = foldNotes(notes);
  const cities = structuredClone(prev.cities || {});
  for (const [city, wallets] of Object.entries(merged)) Object.assign((cities[city] ||= {}), wallets);

  mkdirSync(dirname(out), { recursive: true });
  // Stamp `updated` only when at least one chain read cleanly, so a day where every RPC failed
  // doesn't masquerade as fresh in the freshness strip.
  const updated = ok ? new Date().toISOString().slice(0, 10) : (prev.updated ?? null);
  writeFileSync(out, JSON.stringify({ updated, heads, cities }, null, 2));
  const total = Object.values(cities).reduce((s, w) => s + Object.keys(w).length, 0);
  console.log(`✓ ${out} — ${total} notes across ${Object.keys(cities).length} cities (${ok}/${live.length} chains read)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
