import { test } from "node:test";
import assert from "node:assert/strict";
import { turnoverOf, turnoverSeries } from "../src/turnover.js";
import { ageBand, ageBandFine } from "../scripts/build-onchain-local.mjs";

test("ageBandFine is a strict superset of ageBand (fine 0+1+2 -> band 0, fine 3..6 -> band 1..4)", () => {
  const map = [0, 0, 0, 1, 2, 3, 4]; // ageBandFine index -> ageBand index
  for (const days of [0.2, 3, 20, 45, 120, 250, 500]) {
    assert.equal(map[ageBandFine(days)], ageBand(days));
  }
});

test("turnoverOf from fine 7-band → cumulative moved-within + fine:true", () => {
  // [<1d,1-7d,7-30d,1-3m,3-6m,6-12m,1y+]
  const t = turnoverOf({ ageFine: [2, 1, 2, 5, 10, 20, 60] });
  assert.equal(t.d1, 2);
  assert.equal(t.w1, 3);   // 2+1
  assert.equal(t.m1, 5);   // 2+1+2
  assert.equal(t.m3, 10);  // +5
  assert.equal(t.m6, 20);  // +10
  assert.equal(t.y1, 40);  // +20
  assert.equal(t.dormant, 60);
  assert.equal(t.fine, true);
});

test("turnoverOf falls back to coarse 5-band → sub-week null, fine:false", () => {
  // [<1m,1-3m,3-6m,6-12m,1y+]
  const t = turnoverOf({ age: [5, 8, 12, 15, 60] });
  assert.equal(t.d1, null);
  assert.equal(t.w1, null);
  assert.equal(t.m1, 5);
  assert.equal(t.m3, 13);  // 5+8
  assert.equal(t.m6, 25);  // +12
  assert.equal(t.y1, 40);  // +15
  assert.equal(t.dormant, 60);
  assert.equal(t.fine, false);
});

test("turnoverOf: prefers ageFine when both present; null on neither", () => {
  assert.equal(turnoverOf({ age: [1, 2], ageFine: null }), null); // wrong shapes → null
  assert.equal(turnoverOf(null), null);
  const both = turnoverOf({ age: [5, 8, 12, 15, 60], ageFine: [2, 1, 2, 5, 10, 20, 60] });
  assert.equal(both.fine, true);
  assert.equal(both.d1, 2);
});

test("turnoverSeries: dated, sorted ascending, skips unusable rows", () => {
  const s = turnoverSeries([
    { d: "2024-01-02", ageFine: [1, 1, 1, 1, 1, 1, 94] },
    { d: "2024-01-01", age: [5, 5, 5, 5, 80] },
    { d: "bad" },
  ]);
  assert.equal(s.length, 2);
  assert.ok(s[0].ts < s[1].ts);
});
