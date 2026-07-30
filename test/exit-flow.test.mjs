import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { summarise, fromTimeline } from "../scripts/build-exit-flow.mjs";

const DAY = 864e5;
// a step price fn: cheap before 2024-06, dear after
const priceAt = (t) => (t >= Date.parse("2024-06-01") ? 1.0 : 0.01);

test("summarise splits profit/loss and buckets by exit day", () => {
  const deps = [
    { entryT: Date.parse("2024-01-01"), exitT: Date.parse("2024-07-01") }, // 0.01 -> 1.0 = profit
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-08-01") }, // 1.0 -> 1.0 = profit (>=)
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-08-01") }, // same day, profit
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2025-01-01") }, // 1.0 -> 1.0 profit
  ];
  const o = summarise(deps, priceAt, "daily");
  assert.equal(o.overall.left, 4);
  assert.equal(o.overall.profit, 4);
  assert.equal(o.overall.profitPct, 100);
  // the two 2024-08-01 exits collapse into one dated row with count 2
  const aug = o.days.find(d => d[0] === "2024-08-01");
  assert.deepEqual(aug, ["2024-08-01", 2, 0]);
  assert.equal(o.res, "daily");
});

test("summarise counts a loss when exit price < entry price", () => {
  const o = summarise([{ entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-01-01") }], priceAt, "weekly");
  assert.equal(o.overall.loss, 1);
  assert.equal(o.overall.profitPct, 0);
});

test("fromTimeline finds departures (arrived, now below bar) and skips holders", () => {
  const week0 = "2024-01-01", BAR = 5000;
  const tl = {
    week0, n: 30, threshold: BAR,
    wallets: [
      // A: arrives wk0 @6000, sells out wk10 (still 2024 → cheap→cheap, but exit wk10 date)
      { p: [[0, 6000], [10, 0]] },
      // B: arrives wk2, still holds at the end → NOT a departure
      { p: [[2, 8000]] },
      // C: never reaches the bar → ignored
      { p: [[1, 100]] },
    ],
  };
  const f = "scratchpad_exitflow_tl.json";
  writeFileSync(f, JSON.stringify(tl));
  try {
    const o = fromTimeline(f, priceAt);
    assert.equal(o.overall.left, 1);        // only wallet A left
    assert.equal(o.res, "weekly");
    assert.equal(o.days.length, 1);
  } finally { rmSync(f, { force: true }); }
});
