import test from "node:test";
import assert from "node:assert/strict";
import { WHALE_FLOOR, flowDust, classifyFlow, windowLabel, whaleField } from "../src/whale-flow.js";

test("dust is 0.5% of the bag, floored at 1,000 SPX", () => {
  assert.equal(flowDust(1e5), 1000);        // 0.5% of 100k = 500 → floored to 1,000
  assert.equal(flowDust(1e6), 5000);        // 0.5% of 1M = 5,000
  assert.equal(flowDust(0), 1000);
});

test("classifyFlow uses the shared dust cutoff (0.5% of bag)", () => {
  // dust on a 1M bag = 5,000 SPX
  assert.equal(classifyFlow(4000, 1e6), "flat");   // 4k < 5k dust → flat
  assert.equal(classifyFlow(6000, 1e6), "buy");    // 6k > 5k dust → buy
  assert.equal(classifyFlow(-6000, 1e6), "sell");
  assert.equal(classifyFlow(20000, 1e6), "buy");
  assert.equal(classifyFlow(-20000, 1e6), "sell");
  assert.equal(classifyFlow(0, 1e6), "flat");
  // on a 100k bag dust is floored at 1,000 SPX
  assert.equal(classifyFlow(900, 1e5), "flat");
  assert.equal(classifyFlow(1500, 1e5), "buy");
});

test("window labels", () => {
  assert.equal(windowLabel(1), "24 hours");
  assert.equal(windowLabel(7), "1 week");
  assert.equal(windowLabel(30), "30 days");
});

test("whaleField assembles all three chains with one threshold, and the census reconciles", () => {
  const whales = { wallets: [
    { a: "0xA", bal: 2e6, d30: 40000, d7: 20000, d1: 0 },   // buy on 30d/7d, flat 24h
    { a: "0xB", bal: 5e5, d30: -30000, d7: -30000, d1: -30000 }, // sell all windows
    { a: "0xC", bal: 1.5e5, d30: 200, d7: 200, d1: 200 },   // dust → flat
    { a: "0xD", bal: 5e4 },                                  // below floor → excluded
  ] };
  const base = { wallets: [{ a: "0xE", bal: 3e5, flow: 50000 }] };  // base buy on 30d
  const sol = { wallets: [{ a: "SoLwallet", bal: 4e5, flow: -60000 }] }; // sol sell on 30d

  const d30 = whaleField({ whales, base, sol, live: null, win: 30 });
  assert.equal(d30.census.total, 5);                 // 3 eth (≥100k) + 1 base + 1 sol
  assert.equal(d30.census.byChain.eth, 3);
  assert.equal(d30.census.byChain.base, 1);
  assert.equal(d30.census.byChain.sol, 1);
  assert.equal(d30.census.buying, 2);                // 0xA + 0xE
  assert.equal(d30.census.selling, 2);               // 0xB + sol
  assert.equal(d30.census.flat, 1);                  // 0xC dust
  // census counts partition the field
  assert.equal(d30.census.buying + d30.census.selling + d30.census.flat, d30.census.total);
  // rows sorted biggest-buyer first
  assert.ok(d30.rows[0].net >= d30.rows.at(-1).net);

  // on the 7-day window, Base/Solana have no d7 → they read flat (never invented)
  const d7 = whaleField({ whales, base, sol, live: null, win: 7 });
  assert.equal(d7.census.buying, 1);                 // only 0xA (eth d7); base flat
  assert.equal(d7.census.selling, 1);                // only 0xB (eth d7); sol flat
});

test("whaleField prefers the live feed on the 24h window", () => {
  const whales = { wallets: [{ a: "0xA", bal: 1e6, d1: 0, d7: 0, d30: 0 }] };
  const live = { wallets: [{ a: "0xA", chain: "eth", net: 40000 }] };
  const noLive = whaleField({ whales, win: 1 });
  const withLive = whaleField({ whales, live, win: 1 });
  assert.equal(noLive.census.buying, 0);             // banked d1 is 0
  assert.equal(withLive.census.buying, 1);           // live shows a 40k buy
});
