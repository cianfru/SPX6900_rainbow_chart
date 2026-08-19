import { test } from "node:test";
import assert from "node:assert/strict";
import { lanesQuiet, aeonLanesQuiet, AEON_EVENT_LANES, AEON_LANE_GAP_DAYS } from "../scripts/bot/posts.mjs";

test("lanesQuiet — a recent sibling-lane post blocks the whole AEON group", () => {
  const st = { lanes: { aeonsale: "2026-08-18", firesale: "2026-08-19" } };
  const G = AEON_LANE_GAP_DAYS;
  // firesale posted Aug 19 → any AEON lane blocked until the gap clears
  assert.equal(lanesQuiet(AEON_EVENT_LANES, G, "2026-08-20", st), false);
  assert.equal(lanesQuiet(AEON_EVENT_LANES, G, "2026-08-22", st), false);   // 3d < 4d gap
  assert.equal(lanesQuiet(AEON_EVENT_LANES, G, "2026-08-23", st), true);    // 4d ≥ gap → clear
});

test("lanesQuiet — no AEON history → always quiet", () => {
  assert.equal(lanesQuiet(AEON_EVENT_LANES, AEON_LANE_GAP_DAYS, "2026-08-20", { lanes: {} }), true);
  assert.equal(lanesQuiet(AEON_EVENT_LANES, AEON_LANE_GAP_DAYS, "2026-08-20", {}), true);
});

test("aeonLanesQuiet — the three lanes share one budget", () => {
  assert.deepEqual([...AEON_EVENT_LANES].sort(), ["aeonsale", "aeonsweep", "firesale"]);
  assert.equal(typeof aeonLanesQuiet(), "boolean");   // reads live post-state without throwing
});
