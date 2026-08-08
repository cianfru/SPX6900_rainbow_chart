import { test } from "node:test";
import assert from "node:assert/strict";
import { pickInteresting } from "../scripts/aeon-listing-alert.mjs";

const fm = { a: 0.928946635919488, b: -0.12696144841528606 }, level = 0.69;   // fair(152)≈0.92, fair(3152)≈0.63
const cfg = { fm, level, tol: 0.10, minDisc: 0.20 };

test("includes at/under-fair listings, excludes over-fair ones", () => {
  const out = pickInteresting([
    { id: 1011, rank: 152, price: 0.5 },     // deep steal
    { id: 3152, rank: 3152, price: 0.63 },   // ~at fair
    { id: 22, rank: 22, price: 5.0 },        // way over fair → excluded
  ], cfg);
  const ids = out.map(l => l.id);
  assert.ok(ids.includes(1011) && ids.includes(3152), "at/under fair kept");
  assert.ok(!ids.includes(22), "over-fair dropped");
});

test("flags a real steal and sorts best-value first", () => {
  const out = pickInteresting([
    { id: 3152, rank: 3152, price: 0.63 },
    { id: 1011, rank: 152, price: 0.5 },
  ], cfg);
  assert.equal(out[0].id, 1011, "biggest discount first");
  assert.equal(out[0].steal, true);
  assert.equal(out[1].steal, false);
});

test("skips listings with no rank or no price", () => {
  const out = pickInteresting([{ id: 1, price: 0.5 }, { id: 2, rank: 100 }, { id: 3, rank: 100, price: 0 }], cfg);
  assert.equal(out.length, 0);
});

test("empty when the fair model is missing", () => {
  assert.deepEqual(pickInteresting([{ id: 1011, rank: 152, price: 0.5 }], { fm: null, level: null }), []);
});
