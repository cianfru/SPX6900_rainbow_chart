import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateListing } from "../scripts/aeon-snipe.mjs";

// Same model the site's deal-finder uses: fair(rank) = level · e^(a + b·ln rank).
const fm = { a: 0.928946635919488, b: -0.12696144841528606 };
const level = 0.69;
const base = { rankOf: id => ({ 1011: 152, 3200: 3200 }[id] ?? null), fm, level, floor: 0.65, minDiscount: 0.25 };
// fair(rank 152) ≈ 0.69 · e^(0.929 − 0.127·ln152) ≈ 0.92 ETH

test("fires on a genuine steal (well under fair)", () => {
  const r = evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "ETH" }, base);
  assert.equal(r.alert, true);
  assert.ok(r.discount > 0.4 && r.discount < 0.5, `discount ${r.discount}`);
  assert.ok(Math.abs(r.fair - 0.92) < 0.03, `fair ${r.fair}`);
});

test("does NOT fire when priced near/above fair", () => {
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0.9, sym: "ETH" }, base).alert, false);
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 1.5, sym: "ETH" }, base).alert, false);
});

test("ignores non-ETH payment tokens", () => {
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "USDC" }, base).alert, false);
});

test("MAX_PRICE skips discounted-but-expensive listings", () => {
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "ETH" }, { ...base, maxPrice: 0.3 }).alert, false);
});

test("MAX_RANK enforces a rarity floor", () => {
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "ETH" }, { ...base, maxRank: 100 }).alert, false);
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "ETH" }, { ...base, maxRank: 200 }).alert, true);
});

test("no rank (unknown token) → no fair, no alert", () => {
  const r = evaluateListing({ tokenId: 9999, priceEth: 0.1, sym: "ETH" }, base);
  assert.equal(r.alert, false);
  assert.equal(r.fair, null);
});

test("zero/negative price is ignored", () => {
  assert.equal(evaluateListing({ tokenId: 1011, priceEth: 0, sym: "ETH" }, base).alert, false);
});

test("belowFloor flag is set independently of the discount trigger", () => {
  const r = evaluateListing({ tokenId: 1011, priceEth: 0.5, sym: "ETH" }, base);
  assert.equal(r.belowFloor, true);   // 0.5 < floor 0.65
});
