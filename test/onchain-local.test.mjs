import { test } from "node:test";
import assert from "node:assert/strict";
import { replayFifo, gini, ageBand, makePriceAt, mondays, computeUrpd, urpdGrid, binHeldSupply, detectSelfSplits } from "../scripts/build-onchain-local.mjs";

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

test("urpdGrid + binHeldSupply: a fixed log grid bins held supply to % (sums to 100)", () => {
  const g = urpdGrid(0.1, 10, 40);            // 2 decades, 40 log buckets
  assert.equal(g.edges.length, 41);
  near(g.edges[0], 0.1); near(g.edges[40], 10);
  // three lots at different prices → shares of held supply, summing to 100
  const wallets = new Map([["w", { bal: 400, head: 0, q: [
    { ts: 0, price: 0.2, qty: 100 }, { ts: 0, price: 1, qty: 100 }, { ts: 0, price: 5, qty: 200 },
  ] }]]);
  const { held, pct } = binHeldSupply(wallets, g);
  near(held, 400);
  near(pct.reduce((s, x) => s + x, 0), 100);
  near(pct[Math.floor(((Math.log(5) - g.loLog) / g.span) * 40)], 50); // the $5 lot = 200/400 = 50%
});

test("collectUrpdHistory emits fixed-grid weekly slices with a today edge", () => {
  // buys at $1 then $4, sampled at two weeks; grid spans the acquisition range.
  const tx = [
    { from: ZERO, to: "w", amt: 100, ts: d(1) },   // priced at $1
    { from: ZERO, to: "w", amt: 100, ts: d(9) },   // priced at $4
  ];
  const price = makePriceAt([[d(0), 1], [d(8), 4]]);
  const { urpdHistory } = replayFifo(tx, price, [d(7), d(14)], { collectUrpdHistory: true, urpdHistBuckets: 20 });
  assert.ok(urpdHistory, "history emitted");
  assert.equal(urpdHistory.nBuckets, 20);
  assert.equal(urpdHistory.weeks.length, 2);
  near(urpdHistory.pMin, 1); near(urpdHistory.pMax, 4);
  // week 1 holds only the $1 lot (100% in one bucket); week 2 holds both ($1 + $4, 50/50)
  near(urpdHistory.weeks[0].pct.reduce((s, x) => s + x, 0), 100);
  near(urpdHistory.weeks[1].pct.reduce((s, x) => s + x, 0), 100);
  assert.equal(urpdHistory.weeks[0].pct.filter(x => x > 0).length, 1);
  assert.equal(urpdHistory.weeks[1].pct.filter(x => x > 0).length, 2);
  assert.equal(urpdHistory.weeks.at(-1).d, "2024-01-15"); // today edge = last sample
});

test("buildWhales: ≥100k ships at any tenure (res:false); city residents are res:true", () => {
  // three wallets, sampled 100 days after launch:
  //  A: 200k acquired 5 days ago  → ≥100k, held <90d → emitted, res:false (watcher-only)
  //  B: 8k acquired at launch      → ≥5k held 100d    → emitted, res:true (city resident)
  //  C: 60k acquired 5 days ago    → <100k, held <90d → NOT emitted
  const tx = [
    { from: ZERO, to: "a", amt: 200000, ts: d(95) },
    { from: ZERO, to: "b", amt: 8000, ts: d(0) },
    { from: ZERO, to: "c", amt: 60000, ts: d(95) },
  ];
  const price = makePriceAt([[d(0), 1]]);
  const { whales } = replayFifo(tx, price, [d(100)], { collectWhales: true, minTokens: 5000, minDays: 90 });
  const by = Object.fromEntries(whales.wallets.map(w => [w.a, w]));
  assert.ok(by.a && by.a.res === false, "A: ≥100k fresh whale, res:false");
  assert.ok(by.b && by.b.res === true, "B: city resident, res:true");
  assert.equal(by.c, undefined, "C: <100k and <90d → excluded");
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

test("NRPL splits realized profit and loss; SOPR is their ratio", () => {
  // w1 buys 100 @ $1, then sends 60 @ $2 → all 60 in profit ($1 gain each).
  // w2 buys 100 @ $3, then sends 50 @ $2 → all 50 at a loss ($1 loss each).
  const price = makePriceAt([[d(0), 1], [d(5), 3], [d(10), 2]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },
    { from: ZERO, to: "w2", ts: d(5), amt: 100 },
    { from: "w1", to: POOL, ts: d(10), amt: 60 },   // realized profit 60×$1 = 60
    { from: "w2", to: POOL, ts: d(10), amt: 50 },   // realized loss   50×$1 = 50
  ];
  const [r] = replayFifo(tx, price, [d(10)]);
  near(r.nrplProfit, 60); near(r.nrplLoss, 50); near(r.nrpl, 10);
  // SOPR = value/cost = (60·2 + 50·2) / (60·1 + 50·3) = 220/210
  near(r.sopr, 220 / 210, 0.001);
});

test("coin-days destroyed drives dormancy and liveliness", () => {
  // Buy 100 @ $1 on day 0; send 40 @ $2 on day 10.
  const price = makePriceAt([[d(0), 1], [d(10), 2]]);
  const tx = [
    { from: ZERO, to: "w1", ts: d(0), amt: 100 },
    { from: "w1", to: "w2", ts: d(10), amt: 40 },
  ];
  const [r] = replayFifo(tx, price, [d(10)]);
  near(r.cdd, 400);            // 40 coins × 10 days
  near(r.dormancy, 10);        // avg age of moved coins
  // alive coin-days at the sample: w1 60×10 + w2 40×0 = 600 → liveliness 400/(400+600)
  near(r.coinDays, 600);
  near(r.liveliness, 0.4, 0.001);
});

test("dormancy is null in a window where nothing moves", () => {
  const price = makePriceAt([[d(0), 1]]);
  const tx = [{ from: ZERO, to: "w1", ts: d(0), amt: 100 }];
  const [r] = replayFifo(tx, price, [d(30)]);
  assert.equal(r.dormancy, null);
  assert.equal(r.cdd, 0);
  assert.equal(r.nrpl, 0);
  assert.equal(r.liveliness, 0); // nothing destroyed yet
});

// ── Self-split detection + age inheritance ─────────────────────────────────────────────────────────
const ix = arr => arr.map((t, i) => ({ ...t, i }));

test("self-split: a fresh, equal fan-out from an emptying whale is detected", () => {
  const tx = ix([
    { from: ZERO, to: "whale", ts: d(0), amt: 5_500_000 },
    { from: "whale", to: "n1", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n2", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n3", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n4", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n5", ts: d(200), amt: 1_100_000 },
  ]);
  const det = detectSelfSplits(tx);
  assert.equal(det.count, 1);
  near(det.supply, 5_500_000, 1);
  assert.equal(det.splitIdx.size, 5);
  assert.equal(det.linkOf.get("n3"), "whale");
});

test("self-split: recipients INHERIT the source's coin age (not reset to fresh) and it's not a spend", () => {
  const price = makePriceAt([[d(0), 1], [d(200), 2]]);
  const tx = [
    { from: ZERO, to: "whale", ts: d(0), amt: 5_500_000 },   // bought 200d before the split
    { from: "whale", to: "n1", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n2", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n3", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n4", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n5", ts: d(200), amt: 1_100_000 },
  ];
  const [r] = replayFifo(tx, price, [d(205)]);
  assert.equal(r.holders, 5);        // whale emptied, 5 recipients remain
  near(r.age[3], 100);               // 205d old (inherited) → the 6-12m band, NOT fresh
  near(r.age[0], 0);
  near(r.lthLoss + r.lthProfit, 100, 0.5); // all long-term (age ≥ 90d), by inheritance
  near(r.nrpl, 0, 1);                // a relocation, not a realized sale → no P/L
});

test("self-split OFF (normal transfer path) resets age to fresh — proves the fix does the work", () => {
  const price = makePriceAt([[d(0), 1], [d(200), 2]]);
  const tx = [
    { from: ZERO, to: "whale", ts: d(0), amt: 5_500_000 },
    { from: "whale", to: "n1", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n2", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n3", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n4", ts: d(200), amt: 1_100_000 },
    { from: "whale", to: "n5", ts: d(200), amt: 1_100_000 },
  ];
  const [r] = replayFifo(tx, price, [d(205)], { detectSplits: false });
  near(r.age[0], 100);               // without the fix, all 5 read as fresh (5d)
  near(r.age[3], 0);
});

test("self-split guards: unequal / non-fresh / partial / too-few / excluded are NOT flagged", () => {
  const base = { from: ZERO, to: "whale", ts: d(0), amt: 5_500_000 };
  // unequal amounts
  assert.equal(detectSelfSplits(ix([base,
    { from: "whale", to: "a", ts: d(9), amt: 2_000_000 }, { from: "whale", to: "b", ts: d(9), amt: 1_000_000 },
    { from: "whale", to: "c", ts: d(9), amt: 2_500_000 }])).count, 0);
  // a recipient already held SPX (not fresh)
  assert.equal(detectSelfSplits(ix([base, { from: ZERO, to: "a", ts: d(1), amt: 10 },
    { from: "whale", to: "a", ts: d(9), amt: 1_100_000 }, { from: "whale", to: "b", ts: d(9), amt: 1_100_000 },
    { from: "whale", to: "c", ts: d(9), amt: 1_100_000 }, { from: "whale", to: "e", ts: d(9), amt: 1_100_000 },
    { from: "whale", to: "f", ts: d(9), amt: 1_100_000 }])).count, 0);
  // source keeps most of its balance (doesn't empty)
  assert.equal(detectSelfSplits(ix([base,
    { from: "whale", to: "a", ts: d(9), amt: 500_000 }, { from: "whale", to: "b", ts: d(9), amt: 500_000 },
    { from: "whale", to: "c", ts: d(9), amt: 500_000 }])).count, 0);
  // too few recipients (2 < 3)
  assert.equal(detectSelfSplits(ix([base,
    { from: "whale", to: "a", ts: d(9), amt: 2_750_000 }, { from: "whale", to: "b", ts: d(9), amt: 2_750_000 }])).count, 0);
  // excluded source (a pool distributing) is never a self-split
  assert.equal(detectSelfSplits(ix([{ from: ZERO, to: POOL, ts: d(0), amt: 5_500_000 },
    { from: POOL, to: "a", ts: d(9), amt: 1_100_000 }, { from: POOL, to: "b", ts: d(9), amt: 1_100_000 },
    { from: POOL, to: "c", ts: d(9), amt: 1_100_000 }, { from: POOL, to: "e", ts: d(9), amt: 1_100_000 },
    { from: POOL, to: "f", ts: d(9), amt: 1_100_000 }])).count, 0);
});
