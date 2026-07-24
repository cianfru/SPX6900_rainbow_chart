import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSales } from "../scripts/bot/aeon-live-sales.mjs";
import { joinLiveSales } from "../scripts/bot/aeon-sale-watch.mjs";

// Shape per Alchemy NFT API v3 getNFTSales. Amounts are integer strings in token base
// units; sellerFee is the seller's proceeds, with protocol + royalty paid on top.
const LATEST = 21_000_000;
const NOW = Date.parse("2026-07-24T12:00:00Z");
const wei = eth => String(Math.round(eth * 1e18));
const sale = (o = {}) => ({
  marketplace: "blur", contractAddress: "0xc374", tokenId: "1798", quantity: "1",
  buyerAddress: "0xbuyer", sellerAddress: "0xseller", blockNumber: LATEST,
  transactionHash: "0xtx1",
  sellerFee: { amount: wei(1.0), tokenAddress: null, symbol: "ETH", decimals: 18 },
  protocolFee: { amount: wei(0.02), symbol: "ETH", decimals: 18 },
  royaltyFee: { amount: wei(0.05), symbol: "ETH", decimals: 18 },
  ...o,
});

test("price is what the BUYER paid — seller proceeds plus protocol and royalty", () => {
  const [s] = normalizeSales([sale()], { latestBlock: LATEST, nowMs: NOW });
  assert.equal(s.price, 1.07, "1.00 + 0.02 + 0.05");
  assert.equal(s.id, 1798);
  assert.equal(s.mkt, "blur");
});

test("dates a sale from its block delta", () => {
  const oneDay = Math.round(86400 / 12);
  const [s] = normalizeSales([sale({ blockNumber: LATEST - oneDay })], { latestBlock: LATEST, nowMs: NOW });
  assert.equal(s.d, "2026-07-23", "one day of blocks back = yesterday");
});

test("skips non-ETH trades and zero-value transfers", () => {
  const rows = normalizeSales([
    sale({ tokenId: "1", sellerFee: { amount: "1000000", symbol: "USDC", decimals: 6 }, protocolFee: null, royaltyFee: null }),
    sale({ tokenId: "2", sellerFee: { amount: "0", symbol: "ETH", decimals: 18 }, protocolFee: null, royaltyFee: null }),
  ], { latestBlock: LATEST, nowMs: NOW });
  assert.equal(rows.length, 0);
});

test("dedupes a token repeated within one transaction, newest first", () => {
  const rows = normalizeSales([
    sale({ tokenId: "5", blockNumber: LATEST - 100, transactionHash: "0xa" }),
    sale({ tokenId: "5", blockNumber: LATEST - 100, transactionHash: "0xa" }),
    sale({ tokenId: "6", blockNumber: LATEST, transactionHash: "0xb" }),
  ], { latestBlock: LATEST, nowMs: NOW });
  assert.deepEqual(rows.map(r => r.id), [6, 5]);
});

test("handles a missing fee leg without turning the price into NaN", () => {
  const [s] = normalizeSales([sale({ protocolFee: undefined, royaltyFee: null })], { latestBlock: LATEST, nowMs: NOW });
  assert.equal(s.price, 1);
});

test("join prices each live sale against its rarity using the daily fair model", () => {
  const live = [{ id: 1798, price: 0.4, d: "2026-07-24", ts: NOW, mkt: "blur", tx: "0x1" }];
  const rarityTokens = [{ id: 1798, rank: 1, img: "https://cdn/x.png" }];
  const fairModel = { a: 0, b: -0.127, level: 0.59 };
  const [row] = joinLiveSales(live, { rarityTokens, fairModel });
  assert.equal(row.rank, 1);
  assert.equal(row.img, "https://cdn/x.png");
  assert.equal(row.exp, 0.59, "rank 1 → factor 1 → the market level itself");
  assert.ok(row.disc > 0.3, `0.4 against 0.59 is a steal, got ${row.disc}`);
});

test("join drops tokens it cannot rank rather than guessing", () => {
  const live = [{ id: 999999, price: 1, d: "2026-07-24", ts: NOW }];
  assert.deepEqual(joinLiveSales(live, { rarityTokens: [], fairModel: { a: 0, b: 0, level: 1 } }), []);
});
