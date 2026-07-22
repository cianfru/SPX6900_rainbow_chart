import { test } from "node:test";
import assert from "node:assert/strict";
import { replayFifo, gini, ageBand, makePriceAt, mondays, computeUrpd } from "../scripts/build-onchain-local.mjs";

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

test("SOPR = realized value ÷ cost of coins that moved in the window", () => {
  const price = makePriceAt([[d(0), 1], [d(10), 2]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },   // buy 100 @ $1 (mint — not a spend)
    { from: "w1", to: "w2", ts: d(10), amt: 40 },    // send 40 @ $2 → spent value 80, cost 40
  ];
  const [r] = replayFifo(tx, price, [d(11)]);
  near(r.sopr, 2);                 // 80 / 40 — spending at a 2× profit
});

test("SOPR is null when nothing moved; a loss reads < 1; excluded mints don't count", () => {
  const price = makePriceAt([[d(0), 2], [d(5), 1]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },   // mint @ $2 (excluded from → no spend)
    { from: "w1", to: "w2", ts: d(5), amt: 50 },     // send 50 @ $1, cost $2 → SOPR 0.5
  ];
  const rows = replayFifo(tx, price, [d(4), d(6)]);
  assert.equal(rows[0].sopr, null);   // nothing moved before d(4) except the excluded mint
  near(rows[1].sopr, 0.5);            // realized at a loss
});

test("URPD buckets held supply by acquisition cost and flags in/out of profit", () => {
  const price = makePriceAt([[d(0), 1], [d(10), 4]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },    // 100 @ cost $1
    { from: ZERO, to: "w2", ts: d(10), amt: 100 },   // 100 @ cost $4
  ];
  const { urpd } = replayFifo(tx, price, [d(20)], { collectUrpd: true }); // spot $4
  near(urpd.held, 200);
  const withSupply = urpd.buckets.filter(b => b.pct > 0);
  assert.equal(withSupply.length, 2);                // two distinct cost levels
  near(withSupply.reduce((s, b) => s + b.pct, 0), 100); // shares sum to 100%
  assert.ok(withSupply.every(b => b.inProfit));      // both cost ≤ spot $4
  // direct call: everything underwater when spot is below all costs
  const under = computeUrpd(new Map([["w", { q: [{ ts: d(0), price: 5, qty: 10 }], head: 0, bal: 10 }]]), 1, "2024-01-20");
  assert.ok(under.buckets.every(b => !b.inProfit));
});

test("URPD splits each cost-basis bucket by holding age (same price, different ages)", () => {
  const DAY = 86400000, now = Date.parse("2026-07-20");
  // two lots at the SAME price $0.40: one 2 years old (1y+), one 10 days old (0-1m)
  const wallets = new Map([["w", { bal: 200, head: 0, q: [
    { ts: now - 730 * DAY, price: 0.4, qty: 100 },
    { ts: now - 10 * DAY, price: 0.4, qty: 100 },
  ] }]]);
  const u = computeUrpd(wallets, 0.37, "2026-07-20", 8);
  const bkt = u.buckets.filter(b => b.pct > 0);
  assert.equal(bkt.length, 1, "same price → one bucket");
  const age = bkt[0].age;
  near(age.reduce((s, x) => s + x, 0), bkt[0].pct);  // age split sums to the bucket total
  near(age[0], 50); near(age[4], 50);                // 50% fresh (0-1m) + 50% old (1y+)
  near(age[1] + age[2] + age[3], 0);                 // nothing in the middle bands
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
