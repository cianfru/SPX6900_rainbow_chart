import test from "node:test";
import assert from "node:assert/strict";
import { cityHistory, priceLookup } from "../scripts/build-city-history.mjs";
import { CITY_COHORTS, CITY_FLOOR, cityCohortIndex } from "../src/whale-cohorts.js";

// City history joins the weekly balance timeline × price into per-cohort citizen COUNTS + TVL. These
// pin the pieces that carry a claim: the residency rule (≥FLOOR held 90d ≈ 13 weeks, clamped to the
// token's age), that counts + TVL reconcile to the input, cohort nesting with the whale bands, and
// the price lookup's forward-fill.

test("city cohorts span from the residency floor and nest the whale bands", () => {
  assert.equal(CITY_FLOOR, 5e3);
  assert.equal(cityCohortIndex(4999), -1);                 // below the residency floor
  assert.equal(cityCohortIndex(5e3), 0);
  assert.equal(cityCohortIndex(1e5), 2);                   // 100k is where the whale bands begin
  assert.equal(cityCohortIndex(50e6), CITY_COHORTS.length - 1);
  for (let i = 0; i < CITY_COHORTS.length - 1; i++) assert.equal(CITY_COHORTS[i].hi, CITY_COHORTS[i + 1].lo);
});

test("priceLookup forward-fills: last close ≤ t, else the earliest", () => {
  const at = priceLookup([{ date: "2024-01-01", price: 2 }, { date: "2024-01-10", price: 5 }]);
  assert.equal(at(Date.parse("2023-06-01")), 2);           // before the feed → earliest
  assert.equal(at(Date.parse("2024-01-05")), 2);           // between → last ≤ t
  assert.equal(at(Date.parse("2024-01-10")), 5);
  assert.equal(at(Date.parse("2024-02-01")), 5);           // after → latest
});

test("counts + TVL reconcile; residency needs 90 days held (past the launch clamp)", () => {
  // 15 weeks. A: 300k from week 0 — a launch holder, resident every week (nobody could have held
  // longer than the token existed → the early-week clamp). D: 6M from week 1 — arrives after launch,
  // so it must clear the full 13-week hold before it counts. B: 8k from week 10 — too recent, never
  // resident in this window.
  const tl = {
    n: 15, week0: "2024-01-01",
    wallets: [
      { a: "0xa", p: [[0, 300_000]] },
      { a: "0xd", p: [[1, 6_000_000]] },
      { a: "0xb", p: [[10, 8_000]] },
    ],
  };
  const o = cityHistory(tl, [{ date: "2024-01-01", price: 1 }]);   // flat $1 → TVL == tokens
  assert.equal(o.res, "weekly");
  assert.equal(o.n, 15);
  const NC = CITY_COHORTS.length;
  const cnt = wk => o.rows[wk].slice(2, 2 + NC).reduce((a, b) => a + b, 0);
  const last = o.rows.at(-1), counts = last.slice(2, 2 + NC), tvl = last.slice(2 + NC);
  assert.equal(counts.reduce((a, b) => a + b, 0), 2, "A + D resident at the end; B too recent");
  assert.equal(counts[cityCohortIndex(300_000)], 1, "A → the 250k–1M cohort");
  assert.equal(counts[cityCohortIndex(6e6)], 1, "D → the 5M+ cohort");
  assert.equal(tvl.reduce((a, b) => a + b, 0), 6_300_000, "TVL = (300k + 6M) × $1");
  assert.equal(cnt(0), 1, "week 0: only the launch holder A (clamp = the token's age)");
  assert.equal(cnt(12), 1, "week 12: D has held 12 weeks → not yet resident");
  assert.equal(cnt(13), 2, "week 13: D clears 13 weeks held → resident");

  // flow + founders
  assert.equal(o.flow[0][1], 1, "week 0: one arrival (A)");
  assert.equal(o.flow[13][1], 1, "week 13: one arrival (D graduates)");
  assert.equal(o.flow.reduce((s, f) => s + f[2], 0), 0, "nobody departs in this fixture");
  assert.equal(o.founders.n0, 1, "one founder (A, resident in the launch week)");
  assert.equal(o.founders.series.at(-1)[1], 1, "A is still resident → founder survives");

  // per-capita median + vintages
  assert.equal(o.perCapita[0][1], 300_000, "week 0 median = the lone resident A (300k)");
  assert.equal(o.perCapita.at(-1)[1], (300_000 + 6_000_000) / 2, "last week median of A + D");
  const vQ1 = o.vintages.find(v => v.label === "2024 Q1"), vQ2 = o.vintages.find(v => v.label === "2024 Q2");
  assert.equal(vQ1.arrived, 1, "A first resident week 0 → 2024 Q1");
  assert.equal(vQ1.stillHere, 1, "A still here");
  assert.equal(vQ2.arrived, 1, "D first resident week 13 (~Apr) → 2024 Q2");
  assert.equal(vQ2.stillHere, 1, "D still here");

  // skyline (building types) — reconstructed with the shared heightUnit + archetype cut-offs
  assert.equal(o.skylineLabels.length, 4, "4 building tiers");
  assert.equal(o.skyline.at(-1).slice(1).reduce((a, b) => a + b, 0), 2, "skyline total = resident count (A + D)");
  assert.equal(o.skyline.at(-1)[1], 1, "the 6M whale D is the tallest → a glass tower");
});
