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
const HOURS_DEFAULT = 6, HOURS_MAX = 24;
const BLOCKS_PER_HOUR = 300;                                // ~12s blocks
const TOP_N = 800;                                          // watch ALL ≥100k holders (~575) — the transfer
                                                            // window is pulled once and filtered locally, so a
                                                            // bigger watched set costs nothing extra on Alchemy

// Sum signed net flow per WATCHED wallet from a list of Alchemy transfers. Pure + exported so it
// can be unit-tested without the network. `value` from getAssetTransfers is already decimal-adjusted
// (token units), so no decimals math here.
export function aggregateFlow(transfers, watched) {
  const net = new Map();
  for (const t of transfers || []) {
    const v = Number(t.value) || 0;
    if (!v) continue;
    const from = (t.from || "").toLowerCase(), to = (t.to || "").toLowerCase();
    if (watched.has(from)) net.set(from, (net.get(from) || 0) - v);
    if (watched.has(to)) net.set(to, (net.get(to) || 0) + v);
  }
  return [...net.entries()]
    .filter(([, n]) => Math.abs(n) >= 1)                    // drop dust
    .map(([a, n]) => ({ a, net: Math.round(n) }))
    .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
}

const readJson = p => { try { return JSON.parse(readFileSync(join(process.cwd(), p), "utf8")); } catch { return null; } };

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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=180");
  const params = new URL(req.url, "http://x").searchParams;
  const hours = Math.min(HOURS_MAX, Math.max(1, Number(params.get("hours")) || HOURS_DEFAULT));

  // the watched set = the biggest N holders from the daily reconstruction
  const whales = readJson("public/whales.json");
  const watchedArr = (whales?.wallets || []).filter(w => w?.a && w.bal >= 1e5)
    .sort((a, b) => b.bal - a.bal).slice(0, TOP_N).map(w => w.a.toLowerCase());
  const watched = new Set(watchedArr);

  const key = process.env.ALCHEMY_KEY;
  const base = { updated: new Date().toISOString(), hours, watched: watched.size };
  if (!key || !watched.size) {
    return res.status(200).json({ ...base, moves: [], error: key ? "no watched wallets" : "no ALCHEMY_KEY" });
  }

  const url = `https://eth-mainnet.g.alchemy.com/v2/${key}`;
  try {
    const latestHex = await rpc(url, "eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const fromBlock = "0x" + Math.max(0, latest - hours * BLOCKS_PER_HOUR).toString(16);

    // page through the window's SPX transfers (a few hundred; cap the paging defensively)
    const transfers = [];
    let pageKey;
    for (let p = 0; p < 6; p++) {
      const r = await rpc(url, "alchemy_getAssetTransfers", [{
        fromBlock, toBlock: "latest", contractAddresses: [SPX], category: ["erc20"],
        withMetadata: false, excludeZeroValue: true, maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}),
      }]);
      if (r?.transfers?.length) transfers.push(...r.transfers);
      pageKey = r?.pageKey;
      if (!pageKey) break;
    }

    const moves = aggregateFlow(transfers, watched);
    return res.status(200).json({ ...base, block: latest, transfers: transfers.length, moves });
  } catch (err) {
    return res.status(200).json({ ...base, moves: [], error: String(err.message || err) });
  }
}
