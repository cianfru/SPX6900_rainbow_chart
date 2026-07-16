import { test } from "node:test";
import assert from "node:assert/strict";
import { extendForward } from "../scripts/build-chain-wallets.mjs";

const bundle = [
  { d: "2026-07-06", eth: 49541, base: 114416, sol: 65970 },
  { d: "2026-07-13", eth: 49541, base: 114652, sol: 65968 },
];

test("forward points are rebased to the bundle level at the seam (no source-gap jump)", () => {
  const history = [
    { d: "2026-07-13", holders: 49517, holdersBase: 127285, holdersSol: 66149 }, // seam snapshot
    { d: "2026-07-14", holders: 49521, holdersBase: 127284, holdersSol: 66127 },
    { d: "2026-07-16", holders: 49522, holdersBase: 127358, holdersSol: 66133 },
  ];
  const out = extendForward(bundle, history);
  assert.equal(out.length, 4); // 2 bundle + 2 forward (07-14, 07-16; the seam day is not re-added)

  // Base offset at the seam = 114652 - 127285 = -12633 → applied to every forward point.
  const jul14 = out.find(r => r.d === "2026-07-14");
  assert.equal(jul14.base, 127284 - 12633); // 114651 — continuous with the bundle's 114652
  assert.equal(jul14.eth, 49521 + (49541 - 49517)); // +24
  assert.equal(jul14.sol, 66127 + (65968 - 66149)); // -181

  // No discontinuity: the first forward Base sits within a few hundred of the seam.
  assert.ok(Math.abs(jul14.base - bundle.at(-1).base) < 500);
});

test("only fully-populated multi-chain days are appended; nulls are skipped", () => {
  const history = [
    { d: "2026-07-13", holders: 49517, holdersBase: 127285, holdersSol: 66149 },
    { d: "2026-07-14", holders: 49521, holdersBase: null, holdersSol: 66127 }, // base fetch failed → skip
    { d: "2026-07-15", holders: 49514, holdersBase: 127310, holdersSol: 66130 },
  ];
  const out = extendForward(bundle, history);
  assert.deepEqual(out.map(r => r.d), ["2026-07-06", "2026-07-13", "2026-07-15"]);
});

test("no snapshot after the seam → returns the bundle unchanged", () => {
  const out = extendForward(bundle, [{ d: "2026-07-13", holders: 49517, holdersBase: 127285, holdersSol: 66149 }]);
  assert.deepEqual(out, bundle);
});
