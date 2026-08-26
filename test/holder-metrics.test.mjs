import { test } from "node:test";
import assert from "node:assert/strict";
import { convictionOf, convictionSeries } from "../src/conviction.js";
import { holderChangeSeries } from "../src/holder-change.js";

test("convictionOf: all fresh → ~0, all 1y+ → 100, weighted middle", () => {
  assert.equal(convictionOf([100, 0, 0, 0, 0]), 5);      // 0-1m weight 0.05 → 5
  assert.equal(convictionOf([0, 0, 0, 0, 100]), 100);    // all 1y+ → full
  assert.equal(convictionOf([0, 100, 0, 0, 0]), 60);     // 1-3m weight 0.6 → 60
  assert.equal(convictionOf([50, 0, 0, 0, 50]), 52.5);   // (50*0.05 + 50*1) = 52.5
  assert.equal(convictionOf([1, 2]), null);              // wrong shape
});

test("convictionSeries: one row per dated age array, sorted, 0–100", () => {
  const s = convictionSeries([{ d: "2024-01-02", age: [0,0,0,0,100] }, { d: "2024-01-01", age: [100,0,0,0,0] }]);
  assert.equal(s.length, 2);
  assert.ok(s[0].ts < s[1].ts);                          // sorted ascending
  assert.equal(s[1].score, 100);
});

test("holderChangeSeries: per-day tier deltas + % over $100", () => {
  const oc = [
    { d: "2024-01-01", wealth: [100, 10, 5, 2, 1] },
    { d: "2024-01-02", wealth: [90, 12, 6, 2, 2] },       // t0 -10, t1 +2, t2 +1, t3 0, t4 +1
  ];
  const s = holderChangeSeries(oc);
  assert.equal(s.length, 1);
  assert.equal(s[0].t0, -10); assert.equal(s[0].t1, 2); assert.equal(s[0].t2, 1); assert.equal(s[0].t4, 1);
  // over $100 = 12+6+2+2 = 22 of 112 total
  assert.equal(s[0].pctAbove100, +(100 * 22 / 112).toFixed(2));
});
