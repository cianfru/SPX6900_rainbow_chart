import test from "node:test";
import assert from "node:assert/strict";
import { whaleSpectrumLive, SPECTRUM_LABELS } from "../src/whale-spectrum.js";

// The live "today" column reads whales.json (bal + banked d7/d30) and buckets into the 10 size
// cohorts with the SHARED classifier — so its buy/sell totals reconcile with the Mosaic's ETH field.
const WALLETS = [
  { a: "0x1", bal: 2e6, d30: 40000, d7: 40000 },   // 1.75M–3M band, buy
  { a: "0x2", bal: 5e5, d30: -30000, d7: -30000 }, // 350k–600k band, sell
  { a: "0x3", bal: 1.5e5, d30: 200, d7: 200 },     // 100k–200k band, dust → flat
  { a: "0x4", bal: 5e4, d30: 99999 },              // below the 100k whale floor → excluded
];

test("whaleSpectrumLive buckets ≥100k wallets and classifies with the shared cutoff", () => {
  const cohorts = whaleSpectrumLive(WALLETS, { flowWeeks: 4 });
  assert.equal(cohorts.length, SPECTRUM_LABELS.length);
  const total = cohorts.reduce((s, c) => s + c.total, 0);
  const buy = cohorts.reduce((s, c) => s + c.buy, 0);
  const sell = cohorts.reduce((s, c) => s + c.sell, 0);
  const flat = cohorts.reduce((s, c) => s + c.flat, 0);
  assert.equal(total, 3);                 // the 50k wallet is excluded
  assert.equal(buy, 1);
  assert.equal(sell, 1);
  assert.equal(flat, 1);                  // dust move
  assert.equal(buy + sell + flat, total); // partition
});

test("flowWeeks selects the matching banked window (d7 vs d30)", () => {
  const w = [{ a: "0x1", bal: 1e6, d30: 0, d7: 40000 }]; // flat on 30d, buying on 7d
  assert.equal(whaleSpectrumLive(w, { flowWeeks: 4 }).reduce((s, c) => s + c.buy, 0), 0);
  assert.equal(whaleSpectrumLive(w, { flowWeeks: 1 }).reduce((s, c) => s + c.buy, 0), 1);
});
