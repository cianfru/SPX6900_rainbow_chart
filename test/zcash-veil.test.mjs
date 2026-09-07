import { test } from "node:test";
import assert from "node:assert/strict";
import { poolSeries, townStats, veil, validate } from "../scripts/build-zcash-veil.mjs";

test("poolSeries: cumulative sum, positive delta = into the shielded pool", () => {
  const s = poolSeries([
    { date: "2016-10-28", "sum(shielded_value_delta_total)": 100e8 },
    { date: "2016-10-29", "sum(shielded_value_delta_total)": 50e8 },
    { date: "2016-10-30", "sum(shielded_value_delta_total)": -30e8 },  // deshielding
  ]);
  assert.deepEqual(s.map(r => r.pool), [100, 150, 120]);
  assert.equal(s[2].flow, -30);
});

test("poolSeries: skips junk rows without poisoning the running total", () => {
  const s = poolSeries([
    { date: "2024-01-01", "sum(shielded_value_delta_total)": 10e8 },
    { date: null, "sum(shielded_value_delta_total)": 999e8 },
    { date: "2024-01-02", "sum(shielded_value_delta_total)": null },
    { date: "2024-01-03", "sum(shielded_value_delta_total)": 5e8 },
  ]);
  assert.deepEqual(s.map(r => r.d), ["2024-01-01", "2024-01-02", "2024-01-03"]);
  assert.deepEqual(s.map(r => r.pool), [10, 10, 15]);
});

test("poolSeries: empty / missing input returns []", () => {
  assert.deepEqual(poolSeries([]), []);
  assert.deepEqual(poolSeries(null), []);
});

test("townStats: sorts, tags t3 as p2sh, computes concentration", () => {
  const t = townStats([
    { address: "t1aaa", balance: 100e8 },
    { address: "t3bbb", balance: 300e8 },
    { address: "t1ccc", balance: 200e8 },
    { address: "t1bad", balance: 0 },            // zero balance is not a building
  ], 1000);
  assert.equal(t.sampled, 3);
  assert.deepEqual(t.top.map(r => r.a), ["t3bbb", "t1ccc", "t1aaa"]);
  assert.equal(t.top[0].t, "p2sh");
  assert.equal(t.top[1].t, "p2pkh");
  assert.equal(t.concentration.top1, 30);        // 300 of 1000
  assert.equal(t.concentration.top10, 60);       // all three of 1000
});

test("veil: the monolith-vs-average-building ratio", () => {
  const v = veil({ shielded: 5000, circulating: 10000, addressCount: 100, price: 2 });
  assert.equal(v.transparent, 5000);
  assert.equal(v.shieldedPct, 50);
  assert.equal(v.avgBuilding, 50);               // 5000 transparent / 100 addresses
  assert.equal(v.monolithVsAverage, 100);        // 5000 / 50
  assert.equal(v.shieldedUsd, 10000);
});

test("veil: no addresses -> no divide-by-zero", () => {
  const v = veil({ shielded: 1, circulating: 2, addressCount: 0, price: 0 });
  assert.equal(v.monolithVsAverage, null);
  assert.equal(v.shieldedUsd, null);
});

test("validate: flags a reconstruction that drifts from the reference", () => {
  assert.equal(validate(4_931_458, 4_878_432).ok, true);   // ~1.1% — the live case
  assert.equal(validate(9_000_000, 4_878_432).ok, false);
  assert.equal(validate(100, null).ok, null);
});
