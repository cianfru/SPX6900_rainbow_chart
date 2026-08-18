import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortRoi } from "../src/cohort-roi.js";

// Synthetic timeline + prices with hand-computable P&L. Prices: w0 $0.10, w1 $1.00, w2 $0.50 (current).
const prices = [
  { date: "2023-01-02", price: 0.10 },
  { date: "2023-01-09", price: 1.00 },
  { date: "2023-01-16", price: 0.50 },
];
const tl = {
  week0: "2023-01-02", n: 3, updated: "2023-01-16",
  wallets: [
    { a: "0xP", p: [[0, 500000]] },          // bought 500k @ $0.10 → now 500k @ $0.50 = 5× (profit), 350k band
    { a: "0xU", p: [[1, 300000]] },          // bought 300k @ $1.00 → now 300k @ $0.50 = 0.5× (underwater), 200k band
    { a: "0xGone", p: [[0, 200000], [2, 0]] }, // bought then fully exited → now 0, excluded (< 100k)
    { a: "0xDust", p: [[0, 40000]] },        // below the 100k residency floor → excluded
  ],
};

test("cohortRoi — buckets by current size, scores % in profit + typical multiple", () => {
  const r = cohortRoi(tl, prices, { minBal: 1e5 });
  const byLabel = Object.fromEntries(r.cohorts.map(c => [c.label, c]));

  // only the two qualifying wallets counted (Gone exited, Dust below floor)
  assert.equal(r.total, 2);

  // profit wallet → 350k band, 100% in profit, 5× typical
  assert.equal(byLabel["350k"].n, 1);
  assert.equal(byLabel["350k"].pctProfit, 100);
  assert.equal(byLabel["350k"].medMult, 5);

  // underwater wallet → 200k band, 0% in profit, 0.5× typical
  assert.equal(byLabel["200k"].n, 1);
  assert.equal(byLabel["200k"].pctProfit, 0);
  assert.equal(byLabel["200k"].medMult, 0.5);

  // overall = half in profit
  assert.equal(r.pctProfit, 50);
});

test("cohortRoi — empty bands stay zero, never NaN", () => {
  const r = cohortRoi(tl, prices, { minBal: 1e5 });
  for (const c of r.cohorts) {
    assert.ok(Number.isFinite(c.pctProfit) && Number.isFinite(c.medMult) && Number.isFinite(c.aggMult));
    if (c.n === 0) { assert.equal(c.pctProfit, 0); assert.equal(c.medMult, 0); }
  }
});
