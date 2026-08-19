import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailySnapshot } from "../scripts/bot/daily-snapshot.mjs";

// 31 daily rows so 1d/7d/30d deltas all resolve.
const days = n => Array.from({ length: n }, (_, i) => i);
const onchain = days(31).map(i => ({
  d: `2026-07-${String(i + 1).padStart(2, "0")}`,
  mvrv: 0.6 + i * 0.001, sip: 40 + i * 0.1, cexBal: 100e6 + i * 1e5, lpBal: 10e6,
  age: [5, 6, 7, 20, 62], lthProfit: 40, lthLoss: 44, sopr: 0.98, nrpl: 1000, liveliness: 0.6, spot: 0.33,
}));
const history = days(31).map(i => ({
  d: `2026-07-${String(i + 1).padStart(2, "0")}`, p: 0.33, holders: 49000 + i * 10,
  holdersBase: 120000, holdersSol: 60000, be: 0.5, fng: 40, sup: { diamond: 390e6 + i * 1e5 },
}));

test("buildDailySnapshot — whale cohorts count net buyers/sellers per window", () => {
  const whales = {
    updated: "2026-07-31", spot: 0.33, lookback: [1, 7, 30],
    wallets: [
      { a: "0xA", bal: 2e6, d1: 50000, d7: 200000, d30: 400000 },   // buyer all windows
      { a: "0xB", bal: 1e6, d1: -40000, d7: -100000, d30: 0 },       // seller 1d/7d, flat 30d
      { a: "0xC", bal: 5e5, d1: 0, d7: 0, d30: 0 },                   // flat
      { a: "0xsmall", bal: 5e4, d1: 99999, d7: 0, d30: 0 },          // below 100k → excluded
    ],
  };
  const s = buildDailySnapshot({ history, onchain, whales });
  const wf = Object.fromEntries(s.whaleFlow.map(w => [w.win, w]));
  assert.equal(wf["1d"].buyers, 1); assert.equal(wf["1d"].sellers, 1);
  assert.equal(wf["30d"].buyers, 1); assert.equal(wf["30d"].sellers, 0);
  assert.equal(wf["7d"].net, 100000);   // 200000 − 100000, small wallet excluded
});

test("buildDailySnapshot — fires the accumulation alert when MVRV is low, and computes deltas", () => {
  const low = onchain.map(r => ({ ...r, mvrv: 0.64 }));
  const s = buildDailySnapshot({ history, onchain: low, valuation: { updated: "x", cur: { composite: 0.15 }, zones: [{ max: 0.2, label: "Deeply undervalued" }], series: [] } });
  assert.ok(s.alerts.some(a => /accumulation/i.test(a)), "expected an accumulation alert");
  assert.ok(s.alerts.some(a => /deep-value/i.test(a)), "expected a composite deep-value alert");
  const holders = s.sections.find(x => x.title === "Holders & conviction").rows.find(r => r.label.includes("Ethereum"));
  assert.equal(holders.d[0], 10);   // +10 holders/day
  assert.equal(holders.d[2], 300);  // +10 × 30 days
});

test("buildDailySnapshot — empty feeds never throw", () => {
  const s = buildDailySnapshot({ history: [], onchain: [] });
  assert.ok(Array.isArray(s.sections));
  assert.equal(s.whaleFlow, null);
});
