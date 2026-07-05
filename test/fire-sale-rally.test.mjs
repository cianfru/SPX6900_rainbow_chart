// Regression test for the fire-sale rally LOW (the "🚀 rally" card anchor).
//
// Bug (2026-07): the 2026 capitulation had a choppy bottom — price dipped into the
// Fire Sale band, popped out for a day, then made a SHALLOWER re-dip before rallying.
// buildFireSaleRallies split that into two anchors and, because the deep trough's
// rally was truncated at the re-dip (< minGain), it dropped the deep trough and
// anchored the card on the shallow re-dip. So the card showed the wrong (higher) low
// and understated the rally. The fix coalesces troughs not separated by a real rally,
// keeping the lowest one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RAW } from "../src/data.js";
import { buildModel, buildFireSaleRallies } from "../src/models.js";

// The real June 2026 daily closes that reproduced the bug: a Fire Sale bottom with
// the true trough on 06-06 ($0.2762), a one-day pop to band 1 on 06-12, a shallow
// re-dip on 06-13 ($0.3184), then a rally to $0.47 on 06-17.
const JUNE_2026 = [
  { date: "2026-06-04", price: 0.317618767735585 },
  { date: "2026-06-05", price: 0.293701533949907 },
  { date: "2026-06-06", price: 0.276218791505914 }, // ← the true capitulation low
  { date: "2026-06-07", price: 0.304865920615169 },
  { date: "2026-06-08", price: 0.309845831887266 },
  { date: "2026-06-09", price: 0.298122970947755 },
  { date: "2026-06-10", price: 0.297225779294679 },
  { date: "2026-06-11", price: 0.321478946662619 },
  { date: "2026-06-12", price: 0.329315576042165 }, // pops out of the fire-sale band
  { date: "2026-06-13", price: 0.318413538417102 }, // shallow re-dip (the wrong anchor)
  { date: "2026-06-14", price: 0.336185240759742 },
  { date: "2026-06-15", price: 0.34610113591448 },
  { date: "2026-06-16", price: 0.392384854590655 },
  { date: "2026-06-17", price: 0.473115980850323 }, // rally peak
];

test("fire-sale rally anchors on the true capitulation low, not a shallow re-dip", () => {
  // Model is fit on the bundled history only (as in production); the June points
  // just extend the drawn series — same shape as the runtime data.
  const m = buildModel(DEFAULT_RAW);
  const series = [...DEFAULT_RAW, ...JUNE_2026];
  const rallies = buildFireSaleRallies(series, m, { minGain: 0.3 });
  const last = rallies.at(-1);

  assert.equal(last.startDate, "2026-06-06", "low date should be the deepest trough");
  assert.ok(Math.abs(last.lowPrice - 0.276218791505914) < 1e-9, `low should be the 06-06 trough, got ${last.lowPrice}`);
  assert.notEqual(last.startDate, "2026-06-13", "must not anchor on the shallow re-dip");
  // From $0.2762 → $0.4731 peak = ~71%, not the ~48% the shallow anchor produced.
  assert.ok(last.maxGain > 0.6, `rally from the true low should be ~71%, got ${(last.maxGain * 100).toFixed(0)}%`);
});
