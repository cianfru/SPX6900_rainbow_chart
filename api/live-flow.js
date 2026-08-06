// LIVE whale flow — near-real-time net SPX movement of the watched wallets, fetched on view
// (not on a cron) so the board is fresh when someone opens it, and edge-cached ~60s so many
// viewers share one Alchemy pull. This is the FAST layer: it detects who moved in the last few
// hours within minutes of the block. The DEEP layer (cost basis, profit/loss, holder age) stays
// the daily FIFO reconstruction — the board reads that from whales.json for the baseline and
// overlays these live moves on top.
//
// Graceful by design: no ALCHEMY_KEY or any upstream hiccup → {moves:[], error} with 200, so the
// board still renders its wallets (from whales.json) with just no live pulse.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SPX = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c"; // SPX6900 ERC-20 (Ethereum), 8 decimals
const DAYS_DEFAULT = 7, DAYS_MAX = 14;
const LIVE_HOURS = 6;                                       // the "moving right now" sub-window
const BLOCKS_PER_HOUR = 300, BLOCKS_PER_DAY = 7200;         // ~12s blocks (Ethereum defaults)
const TOP_N = 800;                                          // watch ALL ≥100k holders (~575) — the transfer

// EVM chains watched for live flow. Same Alchemy key, same getAssetTransfers mechanism; only the
// endpoint, SPX contract, whale source and BLOCK TIME differ (Base ~2s vs ETH ~12s → different
// blocks per hour/day, which the window + day-bucketing depend on). Solana is NOT here — it's
// non-EVM (getAssetTransfers is EVM-only) and stays on its daily 30-day flow.
const CHAINS = {
  eth:  { alchemy: "eth-mainnet",  spx: SPX,                                          whales: "public/whales.json",       bph: 300,  bpd: 7200 },
  base: { alchemy: "base-mainnet", spx: "0x50da645f148798f68ef2d7db7c1cb22a6819bb2c", whales: "public/base-onchain.json", bph: 1800, bpd: 43200 },
};
                                                            // window is pulled once and filtered locally, so a
                                                            // bigger watched set costs nothing extra on Alchemy

// Per-WATCHED-wallet footprint over the window: net flow, the last-`liveHours` sub-total (the live
// pulse), and how many distinct days it was active / selling — so a wallet slowly offloading across
// several days is earmarked and stays listed even on a quiet day, and a repeat sell reads as a
// pattern. Pure + exported for unit tests. `value` is already decimal-adjusted; `blockNum` is the hex
// block, which we bucket into days (no per-transfer timestamp fetch needed).
export function aggregateWindow(transfers, watched, latestBlock, opts = {}) {
  const liveHours = opts.liveHours ?? LIVE_HOURS;
  const bph = opts.bph ?? BLOCKS_PER_HOUR, bpd = opts.bpd ?? BLOCKS_PER_DAY;   // per-chain block time
  const liveFrom = latestBlock - liveHours * bph;
  const stat = new Map();    // a -> {net, live, lastBn, days: Map(dayBucket -> net)}
  const bump = (a, v, bn) => {
    let s = stat.get(a);
    if (!s) { s = { net: 0, live: 0, lastBn: 0, days: new Map() }; stat.set(a, s); }
    s.net += v;
    if (bn >= liveFrom) s.live += v;
    if (bn > s.lastBn) s.lastBn = bn;
    const bucket = Math.floor((latestBlock - bn) / bpd);
    s.days.set(bucket, (s.days.get(bucket) || 0) + v);
  };
  for (const t of transfers || []) {
    const v = Number(t.value) || 0; if (!v) continue;
    const bn = parseInt(t.blockNum, 16); if (!Number.isFinite(bn)) continue;
    const from = (t.from || "").toLowerCase(), to = (t.to || "").toLowerCase();
    if (watched.has(from)) bump(from, -v, bn);
    if (watched.has(to)) bump(to, v, bn);
  }
  const out = [];
  for (const [a, s] of stat) {
    if (Math.abs(s.net) < 1) continue;                     // net-flat over the window → not earmarked
    let activeDays = 0, sellDays = 0, buyDays = 0;
    for (const dn of s.days.values()) if (Math.abs(dn) >= 1) { activeDays++; if (dn < 0) sellDays++; else buyDays++; }
    out.push({
      a, net: Math.round(s.net), live: Math.round(s.live),
      activeDays, sellDays, buyDays, agoBlocks: Math.max(0, latestBlock - s.lastBn),
    });
  }
  out.sort((x, y) => x.net - y.net);                        // biggest NET SELLERS first
  return out;
}

const readJson = p => { try { return JSON.parse(readFileSync(join(process.cwd(), p), "utf8")); } catch { return null; } };

// ── Solana (non-EVM) via Alchemy Account Archive ──────────────────────────────────────────────────
// getAssetTransfers is EVM-only, but Account Archive answers getAccountInfo at any past slot, so we
// read each whale's SPX balance NOW and at a past slot and diff → net flow, same Alchemy key. The
// whale SET is the daily reconstruction (solana-onchain.json, grows as wallets cross 100k); the flow
// is live. ~3 cheap RPC calls per whale, batched. Solana addresses are base58 (CASE-SENSITIVE — never
// lowercased). Amount lives at offset 64 (SPL token account: mint 0-32 | owner 32-64 | amount 64-72).
const SOL_MINT = "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr";
const SOL_DEC = 8, SOL_SPH = 9000, SOL_SPD = 216000;   // ~2.5 slots/sec → per hour / per day
const solAmount = d => { try { return Number(Buffer.from(d[0], "base64").readBigUInt64LE(0)) / 10 ** SOL_DEC; } catch { return null; } };

async function rpcBatch(url, calls) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ id: i, jsonrpc: "2.0", method: c.method, params: c.params }))) });
  if (!res.ok) throw new Error(`batch ${res.status}`);
  const out = new Array(calls.length);
  for (const r of await res.json()) out[r.id] = r;          // full entry {result, error} — callers must
  return out;                                               // distinguish a missing (error) read from a real value:null
}

// Solana live flow needs Account Archive's historical `slot` param on getAccountInfo. That param is
// gated to Alchemy's Pay-As-You-Go+ tier — on Free it errors per call. When that happens every
// wallet's baseline is unknown, so we honestly emit NOTHING (never fabricate a full-balance move)
// and the board falls back to the daily 30-day reconstruction. The instant the key is on PAYG this
// lights up live with no code change.
async function solanaFlow(key, days, liveHours) {
  const owners = (readJson("public/solana-onchain.json")?.wallets || [])
    .filter(w => w?.a && w.bal >= 1e5).sort((a, b) => b.bal - a.bal).slice(0, TOP_N).map(w => w.a);
  if (!owners.length) return [];
  const url = `https://solana-mainnet.g.alchemy.com/v2/${key}`;
  const slot = await rpc(url, "getSlot", []);
  const past7 = Math.max(0, slot - days * SOL_SPD), pastLive = Math.max(0, slot - liveHours * SOL_SPH);

  // current SPX token account + balance per owner
  const cur = await rpcBatch(url, owners.map(o => ({ method: "getTokenAccountsByOwner", params: [o, { mint: SOL_MINT }, { encoding: "jsonParsed" }] })));
  const rows = owners.map((o, i) => {
    let bal = 0, ta = null;
    for (const a of cur[i]?.result?.value || []) { const ui = a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0; bal += ui; if (!ta || ui > 0) ta = a.pubkey; }
    return { o, ta, bal };
  }).filter(r => r.ta);
  if (!rows.length) return [];

  // historical balances at the 7-day and live slots (Account Archive) → diff. A read that ERRORED
  // (Free-tier gate / rate limit) is unknown — skip it rather than fabricate a full-balance move; a
  // successful value:null means the token account didn't exist then = a real zero (new buyer).
  const hist = s => rpcBatch(url, rows.map(r => ({ method: "getAccountInfo", params: [r.ta, { encoding: "base64", dataSlice: { offset: 64, length: 8 }, slot: s }] })));
  const [h7, hL] = await Promise.all([hist(past7), hist(pastLive)]);
  const out = [];
  rows.forEach((r, i) => {
    if (h7[i]?.error) return;                                          // 7-day baseline unknown → no honest net
    const p7 = solAmount(h7[i]?.result?.value?.data) ?? 0;
    const pl = hL[i]?.error ? p7 : (solAmount(hL[i]?.result?.value?.data) ?? 0);  // live read failed → assume flat since 7d
    const net = r.bal - p7, live = r.bal - pl;
    if (Math.abs(net) < 1) return;
    out.push({ a: r.o, chain: "sol", net: Math.round(net), live: Math.round(live), sellDays: net < 0 ? 1 : 0, activeDays: 1 });
  });
  return out.sort((a, b) => a.net - b.net);
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || "rpc error"}`);
  return j.result;
}

// One chain's movers: pull its SPX-transfer window from Alchemy, filtered to its ≥100k whales.
async function chainFlow(id, cfg, key, days) {
  const whales = readJson(cfg.whales);
  const watched = new Set((whales?.wallets || []).filter(w => w?.a && w.bal >= 1e5)
    .sort((a, b) => b.bal - a.bal).slice(0, TOP_N).map(w => w.a.toLowerCase()));
  if (!watched.size) return [];
  const url = `https://${cfg.alchemy}.g.alchemy.com/v2/${key}`;
  const latest = parseInt(await rpc(url, "eth_blockNumber", []), 16);
  const fromBlock = "0x" + Math.max(0, latest - days * cfg.bpd).toString(16);
  const transfers = [];
  let pageKey;
  for (let p = 0; p < 25; p++) {
    const r = await rpc(url, "alchemy_getAssetTransfers", [{
      fromBlock, toBlock: "latest", contractAddresses: [cfg.spx], category: ["erc20"],
      withMetadata: false, excludeZeroValue: true, maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
    }]);
    if (r?.transfers?.length) transfers.push(...r.transfers);
    pageKey = r?.pageKey;
    if (!pageKey) break;
  }
  return aggregateWindow(transfers, watched, latest, { liveHours: LIVE_HOURS, bph: cfg.bph, bpd: cfg.bpd })
    .map(w => ({ ...w, chain: id }));
}

export default async function handler(req, res) {
  // A 7-day earmark tolerates a few minutes of lag — cache 3 min so the CDN absorbs the (heavier)
  // 7-day pull and Alchemy is hit at most ~once per 3 min however many people are watching.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=180, stale-while-revalidate=600");
  const params = new URL(req.url, "http://x").searchParams;
  const days = Math.min(DAYS_MAX, Math.max(1, Number(params.get("days")) || DAYS_DEFAULT));

  // ALCHEMY_KEY must be set in the VERCEL env (production). A dashboard env change only applies to a
  // NEW deployment, so adding it requires a redeploy to take effect (it does not hot-apply). The same
  // key works across all Alchemy networks (ETH + Base).
  const key = process.env.ALCHEMY_KEY;
  const meta = { updated: new Date().toISOString(), days, liveHours: LIVE_HOURS };
  if (!key) return res.status(200).json({ ...meta, wallets: [], error: "no ALCHEMY_KEY" });

  // per chain, in parallel + isolated: one chain erroring never kills the others. EVM chains use the
  // getAssetTransfers window; Solana uses Account Archive (historical getAccountInfo) — same key, its
  // own job appended after the EVM loop.
  const jobs = [
    ...Object.entries(CHAINS).map(([id, cfg]) => ["evm:" + id, () => chainFlow(id, cfg, key, days)]),
    ["sol", () => solanaFlow(key, days, LIVE_HOURS)],
  ];
  const results = await Promise.allSettled(jobs.map(([, run]) => run()));
  const wallets = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
  const errors = results.map((r, i) => (r.status === "rejected" ? `${jobs[i][0]}: ${r.reason?.message || r.reason}` : null)).filter(Boolean);
  return res.status(200).json({ ...meta, wallets, ...(errors.length ? { errors } : {}) });
}
