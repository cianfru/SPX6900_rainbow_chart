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

test("buildDailySnapshot — whale cohorts are sliced by SIZE band, not one >100k blob", () => {
  const whales = {
    updated: "2026-07-31", spot: 0.33, lookback: [1, 7, 30],
    wallets: [
      { a: "0xA", bal: 2e6, d1: 50000, d7: 200000, d30: 400000 },   // 1M–5M buyer
      { a: "0xB", bal: 6e6, d1: -40000, d7: -100000, d30: -500000 }, // 5M+ seller
      { a: "0xC", bal: 3e5, d1: 0, d7: 0, d30: 0 },                   // 250k–1M flat
      { a: "0xsmall", bal: 5e4, d1: 99999, d7: 0, d30: 0 },          // below 100k → excluded from every band
    ],
  };
  const s = buildDailySnapshot({ history, onchain, whales });
  const byBand = Object.fromEntries(s.whaleCohorts.map(c => [c.band, c]));
  assert.deepEqual(s.whaleCohorts.map(c => c.band), ["100k–250k", "250k–1M", "1M–5M", "5M+"]);
  assert.equal(byBand["1M–5M"].wallets, 1); assert.equal(byBand["1M–5M"].buyers, 1);
  assert.equal(byBand["5M+"].wallets, 1); assert.equal(byBand["5M+"].sellers, 1);
  assert.equal(byBand["5M+"].d30, -500000);
  assert.equal(byBand["100k–250k"].wallets, 0);   // the 50k wallet is below the floor
});

test("buildDailySnapshot — accumulation alert fires only NEAR the zone, not merely undervalued", () => {
  const at = mvrv => buildDailySnapshot({ history, onchain: onchain.map(r => ({ ...r, mvrv })), valuation: { updated: "x", cur: { composite: 0.15 }, zones: [{ max: 0.2, label: "Deeply undervalued" }], series: [] } });
  // 0.64 (+28% above the 0.5 zone) must NOT trigger — that was the false positive
  assert.ok(!at(0.64).alerts.some(a => /accumulation/i.test(a)), "0.64 (+28%) must not alert");
  // 0.53 (within 10%) → "near"; 0.48 (below 0.5) → "IN"
  assert.ok(at(0.53).alerts.some(a => /Near accumulation/.test(a)), "0.53 should read 'near'");
  assert.ok(at(0.48).alerts.some(a => /IN the accumulation/.test(a)), "0.48 should read 'IN'");
  const s = at(0.64);
  assert.ok(s.alerts.some(a => /deep-value/i.test(a)), "expected a composite deep-value alert");
  const holders = s.sections.find(x => x.title === "Holders & conviction").rows.find(r => r.label.includes("Ethereum"));
  assert.equal(holders.d[0], 10);   // +10 holders/day
  assert.equal(holders.d[2], 300);  // +10 × 30 days
});

test("buildDailySnapshot — flags a supply exit wave (few whales, big supply)", () => {
  // 60 calm days (~0.05M/day), then a whale profit-taking spike of 4M SPX in 6 wallets.
  const calm = Array.from({ length: 60 }, (_, i) => [`d${i}`, 4, 1, 40000, 10000]);
  const spike = [["spikeday", 6, 0, 4000000, 0]];
  const ef = { days: [...calm, ...spike] };
  const s = buildDailySnapshot({ history, onchain, exitFlow: ef });
  const a = (s.alerts || []).find(x => /Exit wave/.test(x));
  assert.ok(a, "expected an exit-wave alert");
  assert.ok(/4\.00M SPX/.test(a) && /profit-taking/.test(a), "should report supply + profit-taking: " + a);
  assert.equal(s.exits.d1.supply, 4000000);
});

test("buildDailySnapshot — no exit alert on calm churn", () => {
  const calm = Array.from({ length: 40 }, (_, i) => [`d${i}`, 4, 1, 40000, 10000]);
  const s = buildDailySnapshot({ history, onchain, exitFlow: { days: calm } });
  assert.ok(!(s.alerts || []).some(x => /Exit wave/.test(x)));
});

test("buildDailySnapshot — empty feeds never throw", () => {
  const s = buildDailySnapshot({ history: [], onchain: [] });
  assert.ok(Array.isArray(s.sections));
  assert.equal(s.whaleCohorts, null);
});
