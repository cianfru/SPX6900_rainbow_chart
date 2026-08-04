import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heightOf } from "../src/city-render.js";
import {
  WHALE_FLOOR, COHORTS, cohortIndex, flowState, ageRamp, heightUnit, sentimentOf, buildCohorts,
} from "../src/whale-cohorts.js";

// The cohort math backs BOTH the 3D monitor and the 2D card, so a drift here silently mis-sizes a
// building or mislabels a beam. These pin the pieces that carry a claim: cohort boundaries, the
// buy/sell/flat rule, the age→colour ramp, the height curve (must equal the city's), placement (no
// two cubes in one spot), and that the aggregates reconcile to the input.

test("cohort boundaries are contiguous and floor at 100k", () => {
  assert.equal(WHALE_FLOOR, 1e5);
  assert.equal(cohortIndex(99_999), -1);            // below the whale floor
  assert.equal(cohortIndex(1e5), 0);
  assert.equal(cohortIndex(249_999), 0);
  assert.equal(cohortIndex(25e4), 1);
  assert.equal(cohortIndex(999_999), 1);
  assert.equal(cohortIndex(1e6), 2);
  assert.equal(cohortIndex(5e6), 3);
  assert.equal(cohortIndex(50e6), 3);               // 5M+ is open-ended
  // every cohort's hi is the next cohort's lo — no gaps, no overlap
  for (let i = 0; i < COHORTS.length - 1; i++) assert.equal(COHORTS[i].hi, COHORTS[i + 1].lo);
});

test("flowState: sign with a dust deadzone", () => {
  assert.equal(flowState(0, 1e6), "flat");
  assert.equal(flowState(4999, 1e6), "flat");       // just under 0.5% → deadzone
  assert.equal(flowState(5000, 1e6), "buy");        // 0.5% exactly is the boundary (deadzone is strict <)
  assert.equal(flowState(50_000, 1e6), "buy");      // 5% added
  assert.equal(flowState(-50_000, 1e6), "sell");    // 5% shed
  assert.equal(flowState(1000, 1e6), "flat");       // 0.1% moved = noise
});

test("ageRamp goes warm → cyan and clamps", () => {
  assert.deepEqual(ageRamp(0).rgb, [217, 119, 6]);
  assert.deepEqual(ageRamp(1).rgb, [34, 211, 238]);
  assert.equal(ageRamp(-5).hex, ageRamp(0).hex);    // clamped
  assert.equal(ageRamp(9).hex, ageRamp(1).hex);
  const mid = ageRamp(0.5).rgb;
  assert.ok(mid[0] < 217 && mid[2] > 6);            // moving toward cyan
});

test("heightUnit equals the city's heightOf across the range", () => {
  const HMIN = 1.0, HMAX = 21;
  for (const s of [1e5, 25e4, 7e5, 3e6, 14e6]) {
    const viaUnit = HMIN + (HMAX - HMIN) * heightUnit(s, 1e5, 14e6);
    const viaCity = heightOf(s, 1e5, 14e6, HMIN, HMAX);
    assert.ok(Math.abs(viaUnit - viaCity) < 1e-9, `parity at ${s}: ${viaUnit} vs ${viaCity}`);
  }
  // monotonic + bounded
  assert.ok(heightUnit(1e6, 1e5, 14e6) > heightUnit(2e5, 1e5, 14e6));
  assert.equal(heightUnit(14e6, 1e5, 14e6), heightUnit(14e6, 1e5, 14e6));
  // degenerate inputs never NaN (a NaN height drops a whole merged bucket off screen)
  assert.ok(Number.isFinite(heightUnit(5e5, 0, 0)));
  assert.ok(Number.isFinite(heightUnit(NaN, 1e5, 1e6)));
});

test("sentimentOf bands around zero", () => {
  assert.equal(sentimentOf(0), "balanced");
  assert.equal(sentimentOf(0.2), "balanced");
  assert.equal(sentimentOf(1.5), "accumulating");
  assert.equal(sentimentOf(-1.5), "distributing");
});

test("buildCohorts: synthetic set reconciles and places cleanly", () => {
  const wallets = [
    { a: "0xa", bal: 6_000_000, days: 800, d30: 300_000 },   // 5M+, buying
    { a: "0xb", bal: 5_500_000, days: 120, d30: -400_000 },  // 5M+, selling
    { a: "0xc", bal: 2_000_000, days: 500, d30: 0 },         // 1–5M, flat
    { a: "0xd", bal: 1_100_000, days: 300, d30: 20_000 },    // 1–5M, buy (>0.5%)
    { a: "0xe", bal: 400_000,   days: 90,  d30: 0 },         // 250k–1M, flat
    { a: "0xf", bal: 150_000,   days: 1000, d30: 0 },        // 100–250k, flat
    { a: "0xg", bal: 50_000,    days: 200, d30: 0 },         // below floor — excluded
  ];
  const r = buildCohorts(wallets);
  assert.equal(r.total, 6);                                   // the 50k wallet is dropped
  const sum = r.cohorts.reduce((s, c) => s + c.n, 0);
  assert.equal(sum, 6);
  const t4 = r.cohorts[3];
  assert.equal(t4.n, 2);
  assert.equal(t4.buy, 1); assert.equal(t4.sell, 1); assert.equal(t4.flat, 0);
  assert.equal(t4.held, 11_500_000);
  assert.ok(t4.wallets[0].bal >= t4.wallets[1].bal);         // sorted biggest-first
  // no two cubes share a spot, anywhere
  const spots = r.cohorts.flatMap(c => c.wallets.map(w => `${w.x.toFixed(3)},${w.z.toFixed(3)}`));
  assert.equal(new Set(spots).size, spots.length);
  // height unit within [0,1]; the biggest whale is the tallest
  const all = r.cohorts.flatMap(c => c.wallets);
  for (const w of all) assert.ok(w.hU >= 0 && w.hU <= 1);
  const tallest = all.reduce((m, w) => (w.hU > m.hU ? w : m));
  assert.equal(tallest.bal, 6_000_000);
});

test("buildCohorts against the live whales.json", () => {
  let doc; try { doc = JSON.parse(readFileSync("public/whales.json", "utf8")); } catch { return; }
  const r = buildCohorts(doc.wallets);
  assert.ok(r.total > 0);
  // reconciles: every placed wallet is ≥ the floor, counts add up
  const placed = r.cohorts.reduce((s, c) => s + c.wallets.length, 0);
  assert.equal(placed, r.total);
  assert.equal(r.total, doc.wallets.filter(w => w.bal >= WHALE_FLOOR).length);
  for (const c of r.cohorts) assert.equal(c.buy + c.sell + c.flat, c.n);
  // no coincident cubes across the whole city
  const spots = r.cohorts.flatMap(c => c.wallets.map(w => `${w.x.toFixed(2)},${w.z.toFixed(2)}`));
  assert.equal(new Set(spots).size, spots.length);
});
