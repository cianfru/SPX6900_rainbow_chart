import { test } from "node:test";
import assert from "node:assert/strict";
import { changePoints, balanceAt, mondayOf, parseTime } from "../scripts/build-city-timeline.mjs";

test("changePoints folds deltas into sparse points and merges equal balances", () => {
  const d = new Map([[0, 10], [3, -10], [5, 10], [6, 0]]);   // week 6 nets to nothing
  assert.deepEqual(changePoints(d, 10), [[0, 10], [3, 0], [5, 10]]);
});

test("changePoints clamps a net-negative balance to zero", () => {
  const d = new Map([[1, 5], [2, -9]]);
  assert.deepEqual(changePoints(d, 5), [[1, 5], [2, 0]]);
});

test("changePoints ignores weeks outside the grid", () => {
  const d = new Map([[-2, 100], [1, 7], [99, 3]]);
  assert.deepEqual(changePoints(d, 5), [[1, 7]]);
});

test("balanceAt: before the first point is zero, holds between points", () => {
  const p = [[2, 10], [5, 3], [9, 0]];
  assert.equal(balanceAt(p, 0), 0);
  assert.equal(balanceAt(p, 2), 10);
  assert.equal(balanceAt(p, 4), 10);
  assert.equal(balanceAt(p, 5), 3);
  assert.equal(balanceAt(p, 8), 3);
  assert.equal(balanceAt(p, 20), 0);
});

test("mondayOf lands on a Monday and is idempotent across the week", () => {
  const mon = mondayOf(Date.parse("2026-07-29T13:00:00Z"));   // a Wednesday
  assert.equal(new Date(mon).getUTCDay(), 1);
  assert.equal(mondayOf(Date.parse("2026-08-02T23:59:00Z")), mon);   // Sunday, same week
  assert.notEqual(mondayOf(Date.parse("2026-08-03T00:00:00Z")), mon); // next Monday
});

test("parseTime handles both archive formats", () => {
  assert.ok(Number.isFinite(parseTime("2025-12-12 17:45:59 UTC")));
  assert.ok(Number.isFinite(parseTime("2023-11-16 01:45:47.000 UTC")));
});
