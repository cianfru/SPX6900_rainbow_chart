import { test } from "node:test";
import assert from "node:assert/strict";
import { percentileFromHist, shareInProfit, hasCointime, buildLadder, LADDER_PCTS, ladderColor } from "../src/cost-basis-ladder.js";

// A simple 4-bucket histogram on edges [1,2,4,8,16] (log-spaced ×2). Weights say most supply sits in
// the 2–4 bucket. Percentiles interpolate geometrically within the crossing bucket.
const edges = [1, 2, 4, 8, 16];

test("percentileFromHist: median lands in the heaviest bucket, interpolated in log space", () => {
  const w = [10, 60, 20, 10];               // total 100
  const p50 = percentileFromHist(edges, w, 0.5); // target 50: 10 (cum) then into the 60 bucket at (50-10)/60
  // bucket [2,4], f = 40/60 → 2 * 2^(0.6667) ≈ 3.17
  assert.ok(p50 > 2 && p50 < 4);
  assert.ok(Math.abs(p50 - 2 * Math.pow(2, 40 / 60)) < 1e-6);
});

test("percentileFromHist: monotonic across percentiles (p20 ≤ p50 ≤ p95)", () => {
  const w = [10, 60, 20, 10];
  const p20 = percentileFromHist(edges, w, 0.2);
  const p50 = percentileFromHist(edges, w, 0.5);
  const p95 = percentileFromHist(edges, w, 0.95);
  assert.ok(p20 <= p50 && p50 <= p95);
});

test("percentileFromHist: empty / malformed → null", () => {
  assert.equal(percentileFromHist(edges, [0, 0, 0, 0], 0.5), null);
  assert.equal(percentileFromHist(edges, [1, 2, 3], 0.5), null); // wrong length
  assert.equal(percentileFromHist(null, null, 0.5), null);
});

test("shareInProfit: fraction with bucket-midpoint ≤ spot", () => {
  const w = [10, 60, 20, 10];               // midpoints ≈ 1.41, 2.83, 5.66, 11.3
  // spot 4 → buckets 0 and 1 count (10+60)/100 = 0.7
  assert.ok(Math.abs(shareInProfit(edges, w, 4) - 0.7) < 1e-9);
  assert.equal(shareInProfit(edges, w, 0), null); // no valid spot
});

test("buildLadder: one row per usable week with every percentile present", () => {
  const hist = {
    edges,
    weeks: [
      { d: "2026-01-05", spot: 3, pct: [10, 60, 20, 10] },
      { d: "2026-01-12", spot: 5, pct: [0, 0, 0, 0] },      // empty week → dropped
      { d: "2026-01-19", spot: 6, pct: [5, 5, 40, 50] },
    ],
  };
  const lad = buildLadder(hist);
  assert.equal(lad.rows.length, 2);                          // the empty week is dropped
  for (const r of lad.rows) for (const p of LADDER_PCTS) assert.ok(r["p" + p] > 0);
  // ladder rises when supply is heavier in the expensive buckets
  assert.ok(lad.rows[1].p50 > lad.rows[0].p50);
});

test("buildLadder: cointime field is used when asked; hasCointime gates it", () => {
  const hist = {
    edges,
    weeks: [
      { d: "2026-01-05", spot: 3, pct: [80, 15, 5, 0], pctCoin: [0, 5, 15, 80] }, // old coins are the expensive ones
    ],
  };
  assert.equal(hasCointime(hist), true);
  const supply = buildLadder(hist, { field: "pct" });
  const coin = buildLadder(hist, { field: "pctCoin" });
  // cointime weighting shifts the median UP (long-held = expensive here)
  assert.ok(coin.rows[0].p50 > supply.rows[0].p50);
  assert.equal(hasCointime({ edges, weeks: [{ d: "2026-01-05", spot: 3, pct: [1, 1, 1, 1] }] }), false);
});

test("ladderColor: red at the top percentile, magenta at the bottom", () => {
  assert.equal(ladderColor(0, 16), "hsl(0, 82%, 58%)");        // p95 red
  assert.equal(ladderColor(15, 16), "hsl(300, 82%, 58%)");     // p20 magenta
});
