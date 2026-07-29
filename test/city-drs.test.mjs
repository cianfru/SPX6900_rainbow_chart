import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDrs } from "../src/city-drs.js";

// Drive the controller with synthetic frame sequences. This is the ONLY way the throttle is
// verified — the dev sandbox's headless rAF is slower than the tab-switch cutoff, so an in-page
// test silently exercises nothing (two earlier versions "passed" that way while dead).

const drive = (drs, frameMs, n, t0 = 0) => {
  let t = t0;
  for (let i = 0; i < n; i++) { t += frameMs; drs.tick(t); }
  return t;
};

test("steady 60fps never touches the resolution", () => {
  const applied = [];
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: (r) => applied.push(r) });
  drive(d, 16.7, 1000);
  assert.equal(d.ratio, 2);
  assert.equal(applied.length, 0);
});

test("mild sustained jank (45ms frames) steps down within ~2s", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  drive(d, 45, 45);                        // ~2s of 22fps
  assert.ok(d.ratio < 2, `expected a step down, ratio=${d.ratio}`);
});

test("catastrophic frames (700ms) step down almost immediately, and clamp can't hide them", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  drive(d, 700, 4);                        // 4 slideshow frames
  assert.ok(d.ratio < 2, `expected a fast step down, ratio=${d.ratio}`);
});

test("continuing jank walks to the floor but never below it", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  drive(d, 200, 500);                      // 100s of 5fps
  assert.equal(+d.ratio.toFixed(2), 0.8);
});

test("recovery: headroom creeps the ratio back up, slowly", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  let t = drive(d, 700, 6);                // force it down
  const low = d.ratio;
  assert.ok(low < 2);
  t = drive(d, 8, 200, t);                 // 200 fast frames — not enough yet (slow up)
  assert.equal(d.ratio, low, "must not recover after only ~200 frames of headroom");
  drive(d, 8, 2000, t);                    // sustained headroom → recovers
  assert.ok(d.ratio > low, `expected recovery, ratio=${d.ratio}`);
  assert.ok(d.ratio <= 2, "never exceeds max");
});

test("a tab switch (multi-second gap) is not read as jank", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  let t = drive(d, 16.7, 100);
  t += 300_000; d.tick(t);                 // 5 minutes in another tab
  drive(d, 16.7, 100, t);
  assert.equal(d.ratio, 2, "gap must be ignored, not treated as a slow frame");
});

test("one outlier frame between good ones does not trigger a step", () => {
  const d = makeDrs({ maxRatio: 2, minRatio: 0.8, apply: () => {} });
  let t = drive(d, 16.7, 100);
  t += 1500; d.tick(t);                    // a single 1.5s hitch (GC, decode…)
  drive(d, 16.7, 100, t);
  assert.equal(d.ratio, 2);
});
