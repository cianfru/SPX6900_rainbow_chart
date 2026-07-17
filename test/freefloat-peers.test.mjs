import { test } from "node:test";
import assert from "node:assert/strict";
import { toFreeFloat } from "../scripts/build-freefloat-peers.mjs";

test("toFreeFloat: ff = active/cur, indexed by days since inception", () => {
  const rows = [
    ["2020-01-01", 100, 100], // day 0 → 100%
    ["2020-01-11", 50, 100],  // day 10 → 50%
  ];
  const out = toFreeFloat(rows, "2020-01-01", 7);
  assert.deepEqual(out, [[0, 100], [10, 50]]);
});

test("toFreeFloat: samples to ~every N days but always keeps the latest point", () => {
  const rows = [];
  for (let i = 0; i < 30; i++) { // 30 consecutive days, ff ramps 100→71
    const d = new Date(Date.UTC(2021, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    rows.push([d, 100 - i, 100]);
  }
  const out = toFreeFloat(rows, "2021-01-01", 7);
  // days kept: 0,7,14,21,28 (every 7) + last (29) since it differs from 28
  assert.deepEqual(out.map(p => p[0]), [0, 7, 14, 21, 28, 29]);
  assert.equal(out.at(-1)[1], 71); // latest ff preserved (100-29)
});

test("toFreeFloat: drops zero/invalid supply rows; empty in → empty out", () => {
  assert.deepEqual(toFreeFloat([], "2020-01-01"), []);
  const out = toFreeFloat([["2020-01-01", 50, 0], ["2020-01-08", 40, 80]], "2020-01-01", 7);
  assert.deepEqual(out, [[7, 50]]); // first row (cur=0) dropped; second → 40/80 = 50%
});
