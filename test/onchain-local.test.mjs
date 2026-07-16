import { test } from "node:test";
import assert from "node:assert/strict";
import { replayFifo, gini, ageBand, makePriceAt, mondays } from "../scripts/build-onchain-local.mjs";

const DAY = 86400000;
const D0 = Date.UTC(2024, 0, 1);
const d = n => D0 + n * DAY;
const ZERO = "0x0000000000000000000000000000000000000000";      // excluded (mint)
const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";      // excluded (Uniswap pool)
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test("FIFO consumes the earliest lot; realized price reflects the coins still held", () => {
  const price = makePriceAt([[d(0), 1], [d(10), 2], [d(20), 3]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },   // buy 100 @ $1
    { from: ZERO, to: "w1", ts: d(10), amt: 100 },  // buy 100 @ $2
    { from: "w1", to: "w2", ts: d(20), amt: 100 },  // send 100 → FIFO eats the $1 lot
  ];
  const [r] = replayFifo(tx, price, [d(25)]);
  assert.equal(r.holders, 2);
  near(r.rp, 2.5);                 // w1: 100@$2, w2: 100@$3 → (200+300)/200
  near(r.sip, 100);                // spot $3 ≥ both cost bases
  near(r.age[0], 100);             // both lots < 30d old
  near(r.top10, 100);              // two wallets = the whole float
});

test("excluded addresses are never holders; a mint is priced at market; loss + STH split", () => {
  const price = makePriceAt([[d(0), 1], [d(10), 0.5]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },   // mint → cost basis $1
    { from: "w1", to: POOL, ts: d(5), amt: 40 },    // sell 40 into the pool (excluded)
  ];
  const [r] = replayFifo(tx, price, [d(10)]);
  assert.equal(r.holders, 1);      // pool is not a holder
  near(r.rp, 1);                   // 60 left @ $1
  near(r.mvrv, 0.5);               // spot 0.5 / rp 1
  near(r.sip, 0);                  // underwater
  near(r.sthLoss, 100);            // 10d old → short-term
  near(r.lthLoss, 0);
});

test("age threshold splits LTH vs STH (90d default)", () => {
  const price = makePriceAt([[d(0), 1], [d(100), 2]]);
  const tx = [{ from: ZERO, to: "w1", ts: d(0), amt: 100 }];
  const [r] = replayFifo(tx, price, [d(100)]); // 100d old → LTH, in profit
  near(r.lthProfit, 100);
  near(r.sthProfit, 0);
  near(r.age[2], 100);             // 100d → 3–6m band
});

test("a wallet that sends more than it holds just empties (no negative balance)", () => {
  const price = makePriceAt([[d(0), 1]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 50 },
    { from: "w1", to: "w2", ts: d(1), amt: 80 },   // oversell — only 50 tracked
  ];
  const [r] = replayFifo(tx, price, [d(2)]);
  assert.equal(r.holders, 1);      // w1 emptied, w2 holds 80
  near(r.top10, 100);
});

test("gini, price forward-fill, and the Monday grid", () => {
  near(gini([50, 50]), 0);
  near(gini([1, 99]), 0.49);
  assert.equal(ageBand(0), 0); assert.equal(ageBand(89), 1); assert.equal(ageBand(200), 3); assert.equal(ageBand(400), 4);
  const p = makePriceAt([[d(0), 1], [d(10), 2]]);
  assert.equal(p(d(5)), 1); assert.equal(p(d(10)), 2); assert.equal(p(d(15)), 2); assert.equal(p(d(-5)), 1);
  const grid = mondays(d(0), d(20));
  assert.ok(grid.every(t => new Date(t).getUTCDay() === 1), "every sample is a Monday");
  assert.equal(grid[1] - grid[0], 7 * DAY);
});
