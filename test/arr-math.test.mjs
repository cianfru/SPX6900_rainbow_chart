import test from "node:test";
import assert from "node:assert/strict";
import { maxOf, minOf } from "../scripts/lib/arr-math.mjs";

test("maxOf / minOf match Math on small inputs", () => {
  const a = [3, 1, 4, 1, 5, 9, 2, 6];
  assert.equal(maxOf(a), 9);
  assert.equal(minOf(a), 1);
  assert.equal(maxOf([{ v: 2 }, { v: 7 }, { v: 4 }], o => o.v), 7);
  assert.equal(minOf([{ v: 2 }, { v: 7 }, { v: 4 }], o => o.v), 2);
});

test("seed floors/caps the result (the Math.max(1, ...) idiom)", () => {
  assert.equal(maxOf([-3, -2], x => x, 1), 1);       // seed wins when it's larger
  assert.equal(maxOf([3, 8], x => x, 1), 8);
  assert.equal(minOf([9, 12], x => x, 5), 5);
  assert.equal(maxOf([], x => x, 1), 1);             // empty → seed
  assert.equal(minOf([], x => x, 0), 0);
});

test("does NOT overflow where the spread form does — the whole point", () => {
  const n = 200_000;                                 // past the ~125k arg cap
  const big = new Array(n);
  for (let i = 0; i < n; i++) big[i] = i;
  // sanity: the spread form genuinely throws at this size
  assert.throws(() => Math.max(...big), RangeError);
  // ours doesn't
  assert.equal(maxOf(big), n - 1);
  assert.equal(minOf(big), 0);
  assert.equal(maxOf(big, x => x, n + 10), n + 10);  // seed still respected at scale
});
