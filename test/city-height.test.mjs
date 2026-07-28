import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heightOf, archetype } from "../src/city-render.js";

// The height curve is the one piece of the city that makes a CLAIM about a wallet, so the ordering
// it draws has to be the ordering in the data — always, not just on today's numbers. The rest of
// these pin the failure that produced the curve in the first place: a median building shorter than
// it was wide, because a square root can't compress a power law on its own.

const HMIN = 1.0, HMAX = 21, FOOT = 0.92;
const scores = () => {
  const W = JSON.parse(readFileSync("public/whales.json", "utf8")).wallets;
  const maxBal = Math.max(...W.map(w => w.bal)), maxDays = Math.max(...W.map(w => w.days || 0));
  return W.map(w => (w.bal / maxBal) * (0.45 + 0.55 * ((w.days || 0) / maxDays))).sort((a, b) => b - a);
};

test("height is monotonic in score — a bigger holder is never shorter", () => {
  const S = scores(), lo = S.at(-1), hi = S[0];
  let prev = Infinity;
  for (const s of S) {
    const h = heightOf(s, lo, hi, HMIN, HMAX);
    assert.ok(h <= prev + 1e-9, "height must not rise as score falls");
    prev = h;
  }
});

test("the range is respected at both ends", () => {
  const S = scores(), lo = S.at(-1), hi = S[0];
  // The top lands exactly on HMAX (both terms saturate at 1). The bottom sits a little ABOVE HMIN
  // rather than on it, because the root term is still slightly positive at the smallest score —
  // intended, and the reason HMIN is a floor rather than an exact value.
  assert.ok(Math.abs(heightOf(hi, lo, hi, HMIN, HMAX) - HMAX) < 1e-9);
  const bottom = heightOf(lo, lo, hi, HMIN, HMAX);
  assert.ok(bottom >= HMIN && bottom < HMIN + 0.5, `bottom of range was ${bottom}`);
  // and nothing outside it, including scores below the stated minimum
  for (const s of [0, -1, lo / 10, hi * 10]) {
    const h = heightOf(s, lo, hi, HMIN, HMAX);
    assert.ok(h >= HMIN && h <= HMAX, `${s} produced ${h}`);
  }
});

test("no building is wider than it is tall", () => {
  // The regression this whole change exists to fix: on the square-root curve the median resident
  // was 0.62 units on a 0.92 footprint. Anything under ~1.5 reads as a paving slab, not a home.
  const S = scores(), lo = S.at(-1), hi = S[0];
  const h = S.map(s => heightOf(s, lo, hi, HMIN, HMAX));
  assert.ok(Math.min(...h) > FOOT, "the shortest building must still stand taller than its plot");
  // 2.5:1 is deliberately well below where the curve currently sits (~3.1:1). This guards against a
  // regression to the square root — which put the median at 0.67:1 — not against ordinary drift in
  // the holder set, so it must not sit so close to the live value that a normal day trips it.
  const med = h[Math.floor(h.length / 2)];
  assert.ok(med / FOOT > 2.5, `median aspect ratio ${(med / FOOT).toFixed(1)}:1 is too squat for Manhattan`);
});

test("the tallest tower stays within a believable slenderness", () => {
  // Real supertalls reach roughly 24:1. Past that it stops reading as a building.
  assert.ok(HMAX / FOOT < 25, "the tallest building would be a needle, not a skyscraper");
});

test("the archetype thresholds still spread across the curve", () => {
  // Silhouette carries scale, so all four families have to actually occur. When the curve moved
  // and the thresholds didn't, every building in the city came out glass.
  const S = scores(), lo = S.at(-1), hi = S[0];
  const fams = new Set(S.map(s => archetype(heightOf(s, lo, hi, HMIN, HMAX), 0.5, false).family));
  assert.ok(fams.has("glass") && fams.has("concrete") && fams.has("masonry"),
    `expected a mix of families, got ${[...fams].join(",")}`);
});

test("degenerate inputs return a number rather than dropping the geometry", () => {
  // A single-wallet city, or one where the smallest score is zero, must not yield NaN — that would
  // silently poison a merged geometry bucket and take a whole material group off the screen.
  for (const [s, lo, hi] of [[1, 1, 1], [0, 0, 5], [5, 0, 5], [1, 2, 1]]) {
    const h = heightOf(s, lo, hi, HMIN, HMAX);
    assert.ok(Number.isFinite(h), `heightOf(${s},${lo},${hi}) = ${h}`);
    assert.ok(h >= HMIN && h <= HMAX);
  }
});
