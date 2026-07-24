// ============================================================================
// PROJECT AEON — live sales feed (Alchemy getNFTSales)
// ============================================================================
// The notable-sale watcher originally rode the DAILY Dune pull, so a sale could be ~a day
// old before it fired. This reads sales straight off Alchemy, so the watcher can run
// hourly and post while the trade is still news.
//
// It only supplies the SALE. Rarity/rank/art still come from public/aeon-rarity.json
// (traits are immutable) and "typical for this rarity" from aeon-market.json's fairModel
// (slow-moving, refreshed daily) — so the live path needs no Dune at all.
//
// Alchemy's getNFTSales returns blockNumber but no wall-clock time, so the window is set
// with fromBlock (latest − blocks-per-hour × hours) and each sale is dated by block delta
// at ~12s/block. That is accurate to a few minutes, which is far finer than we need.
//
// ⚠ RESPONSE SHAPE: normalizeSales is written against Alchemy NFT API v3 and unit-tested
// against a captured fixture. `node scripts/bot/aeon-live-sales.mjs --probe` prints what
// the endpoint actually returns, which is the fastest way to re-verify if Alchemy changes it.
// ============================================================================

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const NET = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const SEC_PER_BLOCK = 12;
const ETHLIKE = new Set(["ETH", "WETH"]);

const nftBase = key => `https://${NET}.g.alchemy.com/nft/v3/${key}`;
const rpcBase = key => `https://${NET}.g.alchemy.com/v2/${key}`;

async function getJson(url, opts, fetchImpl = fetch, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, 800 * 2 ** (i - 1)));
    try {
      const res = await fetchImpl(url, opts);
      if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — check ALCHEMY_KEY`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { last = e; }
  }
  throw last;
}

/** A fee leg → a number in whole tokens. Alchemy gives amounts as integer strings. */
const legAmount = leg => {
  if (!leg) return 0;
  const raw = Number(leg.amount);
  if (!Number.isFinite(raw)) return 0;
  const dec = Number(leg.decimals);
  return raw / 10 ** (Number.isFinite(dec) ? dec : 18);
};

/**
 * Alchemy nftSales[] → our sale shape, newest first.
 * PRICE = what the buyer actually paid = seller proceeds + protocol fee + royalty, all
 * legs of the same trade. Taking sellerFee alone would understate every sale by the
 * marketplace cut, which would then read as a fake "steal" against our fair value.
 * Pure + unit-tested; `latestBlock`/`nowMs` are injected so it is deterministic.
 */
export function normalizeSales(nftSales, { latestBlock, nowMs, secPerBlock = SEC_PER_BLOCK } = {}) {
  const out = [];
  for (const s of nftSales || []) {
    const symbol = s?.sellerFee?.symbol || s?.sellerFee?.tokenAddress ? (s?.sellerFee?.symbol || "ETH") : "ETH";
    if (symbol && !ETHLIKE.has(symbol)) continue;                 // ETH-denominated trades only
    const id = Number(s?.tokenId);
    if (!Number.isFinite(id)) continue;
    const price = legAmount(s?.sellerFee) + legAmount(s?.protocolFee) + legAmount(s?.royaltyFee);
    if (!(price > 0)) continue;
    const blk = Number(s?.blockNumber);
    const ageSec = Number.isFinite(blk) && Number.isFinite(latestBlock) ? (latestBlock - blk) * secPerBlock : 0;
    const ts = (nowMs ?? Date.now()) - ageSec * 1000;
    out.push({
      id, price: +price.toFixed(4), ts,
      d: new Date(ts).toISOString().slice(0, 10),
      mkt: s?.marketplace || null,
      tx: s?.transactionHash || null,
      buyer: s?.buyerAddress || null,
      seller: s?.sellerAddress || null,
    });
  }
  // newest first, one row per (token, tx)
  const seen = new Set();
  return out.sort((a, b) => b.ts - a.ts).filter(s => {
    const k = `${s.id}@${s.tx || s.ts}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

/** Pull sales from the last `hours`. Returns [] on any failure (caller falls back). */
export async function fetchLiveSales({ key, hours = 48, contract = CONTRACT, fetchImpl = fetch, limit = 100 } = {}) {
  if (!key) return [];
  const rpc = await getJson(rpcBase(key), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  }, fetchImpl);
  const latestBlock = parseInt(rpc?.result, 16);
  if (!Number.isFinite(latestBlock)) throw new Error("could not read latest block");
  const fromBlock = Math.max(0, latestBlock - Math.ceil((hours * 3600) / SEC_PER_BLOCK));
  const url = `${nftBase(key)}/getNFTSales?contractAddress=${contract}`
    + `&fromBlock=${fromBlock}&toBlock=${latestBlock}&order=desc&limit=${limit}`;
  const j = await getJson(url, { headers: { accept: "application/json" } }, fetchImpl);
  const sales = normalizeSales(j?.nftSales, { latestBlock });
  return sales;
}

// --probe: print the raw response so the shape can be re-verified against a live key.
if (process.argv.includes("--probe")) {
  const key = (process.env.ALCHEMY_KEY || "").trim();
  if (!key) { console.error("no ALCHEMY_KEY"); process.exit(1); }
  try {
    const sales = await fetchLiveSales({ key, hours: Number(process.env.PROBE_HOURS || 168) });
    console.log(`live sales in window: ${sales.length}`);
    for (const s of sales.slice(0, 10)) console.log(`  #${s.id} ${s.price}Ξ ${s.d} ${s.mkt || ""} ${s.tx || ""}`);
  } catch (e) { console.error("probe failed —", e.message); process.exit(1); }
}
