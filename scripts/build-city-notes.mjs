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

// Alchemy caps eth_getLogs at 10k results and a bounded block span, so walk in windows. Deploy
// blocks are recorded per chain so we never rescan from genesis — that's the difference between a
// few requests and thousands.
const SPAN = { ethereum: 100_000, base: 500_000 };      // Base blocks are 2s, mainnet 12s

// The block each CityNotes was deployed at. The first run starts here instead of block 0 — nothing
// exists before the contract, so scanning genesis→deploy is pure waste (~60 empty Base windows).
// After the first run the saved head takes over and this is moot. Fill one in when a chain goes
// live; a chain with no entry falls back to 0 (correct, just slower on run one).
const DEPLOY_BLOCK = { base: 49_240_526 };              // 0xa167867B…C282262, Jul 2026

async function rpc(chain, method, params) {
  const r = await fetch(CHAINS[chain].rpc + KEY, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${chain} ${method}: ${j.error.message}`);
  return j.result;
}

export async function readChain(chain, fromBlock, log = console.log) {
  const address = CONTRACTS[chain];
  if (!address) return [];
  const head = Number(await rpc(chain, "eth_blockNumber", []));
  const out = [];
  for (let from = fromBlock; from <= head; from += SPAN[chain]) {
    const to = Math.min(head, from + SPAN[chain] - 1);
    const logs = await rpc(chain, "eth_getLogs", [{
      address, topics: [NOTE_TOPIC], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
    }]);
    for (const l of logs) {
      const { city, text } = decodeNoteData(l.data);
      out.push({
        chain, city, text,
        who: topicAddress(l.topics[1]),
        block: Number(l.blockNumber),
        tx: l.transactionHash,
      });
    }
  }
  log(`  ${chain}: ${out.length} notes up to block ${head}`);
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
  if (!live.length || !KEY) {
    console.log(live.length ? "no ALCHEMY_KEY — skipping" : "CityNotes isn't deployed yet — skipping");
    // Seed an empty board so the site fetch 200s instead of 404ing on every load.
    let prev = null;
    try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }
    if (!prev) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ updated: null, heads: {}, cities: {} }, null, 2)); }
    return;
  }

  let prev = { heads: {}, cities: {} };
  try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }

  const notes = [], heads = { ...prev.heads };
  for (const chain of live) {
    // Resume from the last block we read, but never before the contract's own deploy block. Re-
    // reading the last block is harmless (latest-wins), and it means a reorg at the tip self-
    // corrects on the next run.
    const from = Math.max(DEPLOY_BLOCK[chain] ?? 0, prev.heads?.[chain] ?? 0);
    const { notes: n, head } = await readChain(chain, from);
    notes.push(...n);
    heads[chain] = head;
  }

  // Carry forward what we already had — the walk above only covers new blocks.
  const merged = foldNotes(notes);
  const cities = structuredClone(prev.cities || {});
  for (const [city, wallets] of Object.entries(merged)) Object.assign((cities[city] ||= {}), wallets);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), heads, cities }, null, 2));
  const total = Object.values(cities).reduce((s, w) => s + Object.keys(w).length, 0);
  console.log(`✓ ${out} — ${total} notes across ${Object.keys(cities).length} cities`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
