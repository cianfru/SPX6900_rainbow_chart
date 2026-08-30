// PERSISTENT WHALE SELL-CAMPAIGNS — the memory the on-view live board can't have.
//
// A "campaign" is a run of a wallet's activity where the gaps stay under IDLE_DAYS. It starts on the
// first move after a quiet spell, ACCUMULATES the whole run (cumulative net, the days it sold), and
// its idle clock RESETS on every new move — so a wallet slowly offloading over weeks stays earmarked
// with its full footprint, and only drops off after IDLE_DAYS of silence. This is what "the 7-day
// window resets from the last sale" actually means, and it needs state, so a cron maintains it in
// public/whale-campaigns.json via cheap Alchemy DELTAs (only the transfers since the last head block).
//
// The heavy lifting (updateCampaigns) is pure + exported for offline unit tests; only the Alchemy
// pull + file IO live in main(). Runs daily; the minute-fresh "still going" pulse stays on the
// on-view /api/live-flow layer.

import { readFileSync, writeFileSync } from "node:fs";

const SPX = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const IDLE_DAYS = 7;
const DAY = 864e5;
const BLOCKS_PER_DAY = 7200;
const OUT = "public/whale-campaigns.json";
const dayKey = ts => new Date(ts).toISOString().slice(0, 10);

// prev: [{a, firstTs, lastTs, net, days:[[dayKey,net],…]}]. transfers MUST be chronological, each
// {from, to, value, ts}. nowTs anchors the idle expiry. `known` (optional) = the set of addresses
// still in whales.json (i.e. tracked holders); a campaign wallet ABSENT from it has since been
// excluded as infrastructure (a market maker / CEX) or fully exited, so we DROP it rather than let it
// linger. Without this an MM never goes idle → it stays "accumulating" forever. Returns the campaigns.
export function updateCampaigns(prev, transfers, nowTs, { watched, known, idleDays = IDLE_DAYS } = {}) {
  const idleMs = idleDays * DAY;
  const state = new Map((prev || []).map(c => [c.a, { ...c, days: c.days.map(d => [d[0], d[1]]) }]));
  for (const t of transfers || []) {
    const v = Number(t.value) || 0; if (!v) continue;
    const ts = t.ts; if (!Number.isFinite(ts)) continue;
    const from = (t.from || "").toLowerCase(), to = (t.to || "").toLowerCase();
    for (const [a, delta] of [[from, -v], [to, v]]) {
      if (!watched || !watched.has(a)) continue;
      let c = state.get(a);
      if (!c || ts - c.lastTs > idleMs) { c = { a, firstTs: ts, lastTs: ts, net: 0, days: [] }; state.set(a, c); } // gap → new campaign
      c.lastTs = Math.max(c.lastTs, ts);
      c.net += delta;
      const dk = dayKey(ts), last = c.days[c.days.length - 1];
      if (last && last[0] === dk) last[1] += delta; else c.days.push([dk, delta]);
    }
  }
  const out = [];
  for (const c of state.values()) {
    if (nowTs - c.lastTs > idleMs) continue;           // IDLE_DAYS of silence → campaign ends
    if (known && !known.has(c.a)) continue;            // no longer a tracked holder (excluded infra / exited) → drop
    out.push({ a: c.a, firstTs: c.firstTs, lastTs: c.lastTs, net: Math.round(c.net), days: c.days.map(([d, n]) => [d, Math.round(n)]) });
  }
  out.sort((x, y) => x.net - y.net);                   // biggest net sellers first
  return out;
}

// ── Alchemy shell ────────────────────────────────────────────────────────────────────────────────
async function rpc(url, method, params) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }) });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || "rpc error"}`);
  return j.result;
}

async function pullTransfers(url, fromBlock) {
  const out = [];
  let pageKey;
  for (let p = 0; p < 30; p++) {
    const r = await rpc(url, "alchemy_getAssetTransfers", [{
      fromBlock, toBlock: "latest", contractAddresses: [SPX], category: ["erc20"],
      withMetadata: true, excludeZeroValue: true, maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
    }]);
    for (const t of r?.transfers || []) out.push({ from: t.from, to: t.to, value: Number(t.value) || 0, ts: Date.parse(t.metadata?.blockTimestamp) });
    pageKey = r?.pageKey;
    if (!pageKey) break;
  }
  return out.filter(t => Number.isFinite(t.ts)).sort((a, b) => a.ts - b.ts);
}

const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

async function main() {
  const key = process.env.ALCHEMY_KEY;
  const prevDoc = readJson(OUT) || { headBlock: null, wallets: [] };
  const whales = readJson("public/whales.json");
  const watched = new Set((whales?.wallets || []).filter(w => w?.a && w.bal >= 1e5).map(w => w.a.toLowerCase()));
  // Every address still in whales.json (any balance) — the FIFO engine has already stripped excluded
  // infrastructure (market makers / CEX) from it, so a campaign wallet absent here is infra or exited
  // and must be pruned. Derived from whales.json (not a second copy of EXCLUDE_LABELS) so it can't drift.
  const known = new Set((whales?.wallets || []).map(w => w?.a?.toLowerCase()).filter(Boolean));

  if (!key) { console.error("no ALCHEMY_KEY — leaving whale-campaigns.json unchanged"); return; }
  if (!watched.size) { console.error("no watched wallets (whales.json missing?) — skipping"); return; }

  const url = `https://eth-mainnet.g.alchemy.com/v2/${key}`;
  const latest = parseInt(await rpc(url, "eth_blockNumber", []), 16);
  // delta since last head; first run bootstraps a full IDLE window so nothing in-flight is missed
  const from = prevDoc.headBlock ? prevDoc.headBlock + 1 : Math.max(0, latest - IDLE_DAYS * BLOCKS_PER_DAY);
  const transfers = await pullTransfers(url, "0x" + from.toString(16));

  const wallets = updateCampaigns(prevDoc.wallets, transfers, Date.now(), { watched, known, idleDays: IDLE_DAYS });
  const doc = { updated: new Date().toISOString(), headBlock: latest, idleDays: IDLE_DAYS, watched: watched.size, wallets };
  writeFileSync(OUT, JSON.stringify(doc));
  const sellers = wallets.filter(w => w.net < 0).length;
  console.log(`whale-campaigns: ${transfers.length} new transfers · ${wallets.length} active campaigns (${sellers} net sellers) → ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
