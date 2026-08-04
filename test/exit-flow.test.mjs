import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { summarise, fromTimeline, fromTransfers } from "../scripts/build-exit-flow.mjs";

const DAY = 864e5;
// a step price fn: cheap before 2024-06, dear after
const priceAt = (t) => (t >= Date.parse("2024-06-01") ? 1.0 : 0.01);

test("summarise splits profit/loss + SPX amount and buckets by exit day", () => {
  const deps = [
    { entryT: Date.parse("2024-01-01"), exitT: Date.parse("2024-07-01"), spx: 10000 }, // 0.01 -> 1.0 = profit
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-08-01"), spx: 6000 },  // 1.0 -> 1.0 = profit (>=)
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-08-01"), spx: 9000 },  // same day, profit
    { entryT: Date.parse("2024-07-01"), exitT: Date.parse("2025-01-01"), spx: 5000 },  // 1.0 -> 1.0 profit
  ];
  const o = summarise(deps, priceAt, "daily");
  assert.equal(o.overall.left, 4);
  assert.equal(o.overall.profit, 4);
  assert.equal(o.overall.profitPct, 100);
  assert.equal(o.overall.spx, 30000);              // 10k+6k+9k+5k
  assert.equal(o.overall.spxProfit, 30000);
  // the two 2024-08-01 exits collapse into one dated row: count 2, spx 15000, no losses
  const aug = o.days.find(d => d[0] === "2024-08-01");
  assert.deepEqual(aug, ["2024-08-01", 2, 0, 15000, 0]);
  assert.equal(o.res, "daily");
});

test("summarise counts a loss when exit price < entry price", () => {
  const o = summarise([{ entryT: Date.parse("2024-07-01"), exitT: Date.parse("2024-01-01") }], priceAt, "weekly");
  assert.equal(o.overall.loss, 1);
  assert.equal(o.overall.profitPct, 0);
});

test("fromTransfers dates the exit at the cross-below transfer + measures the SPX that left", async () => {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const W = "0x00000000000000000000000000000000000000aa"; // the departing wallet
  const SINK = "0x00000000000000000000000000000000000000bb";
  const raw = n => String(Math.round(n * 1e8));
  // W is minted 20k (2024-07-01), sheds to 12k (still a holder), then dumps below the bar on
  // 2024-09-15 → exit must be dated 2024-09-15 (the drop), NOT the 2024-08 partial; and the SPX
  // that left = 12k (its holding the moment before it fell below 5k).
  const lines = [
    "sender,receiver,time,value",
    [ZERO, W, "2024-07-01 00:00:00", raw(20000)].join(","),
    [W, SINK, "2024-08-01 00:00:00", raw(8000)].join(","),   // 20k -> 12k, still ≥ bar
    [W, SINK, "2024-09-15 00:00:00", raw(9000)].join(","),   // 12k -> 3k, crosses below → exit here
  ];
  const f = "scratchpad_exitflow_tx.csv";
  writeFileSync(f, lines.join("\n"));
  try {
    const o = await fromTransfers(f, priceAt);
    assert.equal(o.overall.left, 1);
    assert.equal(o.days.length, 1);
    assert.equal(o.days[0][0], "2024-09-15");   // dated at the sell-out, not the earlier partial
    assert.equal(o.days[0][1], 1);              // one wallet, in profit (0.01 entry → 1.0 exit)
    assert.equal(o.days[0][3], 12000);          // SPX that left = holding just before the drop
    assert.equal(o.overall.spx, 12000);
  } finally { rmSync(f, { force: true }); }
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
