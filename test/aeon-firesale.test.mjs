import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFiresale, firesaleGuard } from "../scripts/bot/aeon-firesale-card.mjs";

// The Aug-19 regime: a thin-market pump 3 weeks earlier left the clearing level (0.835) elevated
// while the true floor reverted beneath it. spxStretch = +0.577 says the collection is stretched
// above its stable SPX baseline. In that regime an ordinary Common listing at the reverting floor
// should NOT read as a fire sale against the inflated benchmark.
const AUG19 = {
  fairModel: { a: 0.9292674246706181, b: -0.12693778741834008, level: 0.835 },
  levelNow: 0.835, floorTrend: 0.325, stealBar: 0.15, spxStretch: 0.577,
};

test("firesaleGuard — a stretched SPX regime raises the bar", () => {
  assert.equal(firesaleGuard(0.325, 0.577), 0.12);   // spxStretch dominates
  assert.equal(firesaleGuard(-0.30, 0), 0.14);        // a fast falling floor also guards
  assert.equal(firesaleGuard(0, 0), 0);               // calm regime → no extra bar
});

test("pickFiresale — the Aug-19 mean-reversion no longer fires", () => {
  // #2485, rank 1987, listed 0.58 → 28% under the (inflated) 0.807 benchmark, bar is 32%.
  const deal = pickFiresale([{ id: 2485, rank: 1987, price: 0.58 }], AUG19, 3333, { minDisc: 0.20 });
  assert.equal(deal, null);
});

test("pickFiresale — a genuine deep steal still fires in the same regime", () => {
  const deal = pickFiresale([{ id: 99, rank: 1987, price: 0.45 }], AUG19, 3333, { minDisc: 0.20 });
  assert.ok(deal, "a 44%-off listing clears the 32% regime bar");
  assert.ok(deal.disc > 0.32);
});

test("pickFiresale — a calm regime still fires an ordinary discount", () => {
  const calm = { ...AUG19, spxStretch: 0, floorTrend: 0 };
  const deal = pickFiresale([{ id: 2485, rank: 1987, price: 0.58 }], calm, 3333, { minDisc: 0.20 });
  assert.ok(deal, "28% off clears the 20% bar when the market isn't pumped/reverting");
});
