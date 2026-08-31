import { test } from "node:test";
import assert from "node:assert/strict";
import { whaleEntries } from "../src/whale-entry.js";

// Synthetic timeline: 10 weekly points, price rises 0.10 → 0.55 (0.05/week). Three ≥100k whales:
//   A idle (held since week 0), B accumulating (+200k at week 8), C distributing (−250k at week 8).
const DAY = 864e5, WK = 7 * DAY;
const week0 = "2024-01-01", base = Date.parse(week0);
const prices = Array.from({ length: 10 }, (_, k) => ({ date: new Date(base + k * WK).toISOString().slice(0, 10), price: +(0.10 + k * 0.05).toFixed(4) }));
const tl = {
  week0, n: 10, updated: "2024-03-04",
  wallets: [
    { a: "0xaaa", p: [[0, 200000]] },                    // idle
    { a: "0xbbb", p: [[0, 300000], [8, 500000]] },       // accumulating
    { a: "0xccc", p: [[0, 400000], [8, 150000]] },       // distributing
  ],
};

test("whaleEntries: d30 recent-flow sign per wallet (idle / accumulating / distributing)", () => {
  const r = whaleEntries(tl, prices, { minBal: 1e5 });
  const by = Object.fromEntries(r.whales.map(w => [w.a, w]));
  assert.equal(by["0xaaa"].d30, 0);          // no move in the window
  assert.equal(by["0xbbb"].d30, 200000);     // +200k at week 8 (inside the 4-week window)
  assert.equal(by["0xccc"].d30, -250000);    // −250k at week 8
});

test("whaleEntries: withLots emits per-wallet buys/sells/avgCost/realized (same shape as smart-money)", () => {
  const r = whaleEntries(tl, prices, { minBal: 1e5, withLots: true });
  assert.ok(Array.isArray(r.lots) && r.lots.length === 3);
  const c = r.lots.find(x => x.a === "0xccc");
  // C: bought 400k @ 0.10, sold 250k @ 0.50 → realized 250k×(0.50−0.10)=100k
  assert.equal(c.buys.length, 1);
  assert.deepEqual(c.buys[0].slice(1), [0.1, 400000]);
  assert.equal(c.sells.length, 1);
  assert.deepEqual(c.sells[0].slice(1), [0.5, 250000, 100000]); // [t, price, qty, gain]
  assert.equal(c.realized, 100000);
  const b = r.lots.find(x => x.a === "0xbbb");
  // B: 300k @ 0.10 + 200k @ 0.50 → avg (30000+100000)/500000 = 0.26
  assert.equal(b.buys.length, 2);
  assert.ok(Math.abs(b.avgCost - 0.26) < 1e-6);
  // without withLots there are no lots
  assert.equal(whaleEntries(tl, prices, { minBal: 1e5 }).lots, undefined);
});

test("whaleEntries: lotCap bounds the arrays", () => {
  const many = { week0, n: 10, wallets: [{ a: "0xddd", p: Array.from({ length: 9 }, (_, k) => [k, 100000 + k * 50000]) }] };
  const r = whaleEntries(many, prices, { minBal: 1e5, withLots: true, lotCap: 3 });
  assert.ok(r.lots[0].buys.length <= 3);
});
