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
import { buildModel, buildFireSaleRallies, bandVal, bandIndex, dayN } from "../src/models.js";

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

// Regression for the RESET semantics (owner, 2026-07-18): the "rally since the last
// Fire Sale low" must RESET when price falls back into the Fire Sale band — a new
// episode begins at the NEW low. The bug: the live episode's bounce was still below
// minGain, so ralliesFromAnchors dropped it and the card kept reporting the OLD
// rally ("+4,036% since Sep '24") even with price back in the deepest band.
test("re-entering the Fire Sale band starts a NEW episode (rally resets to the new low)", () => {
  const m = buildModel(DEFAULT_RAW);
  const lastDate = DEFAULT_RAW.at(-1).date;
  const day = n => {
    const d = new Date(Date.parse(lastDate) + n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  // price safely inside the Fire Sale band on a given date (below the band-0 ceiling)
  const inBand = ds => bandVal(m, dayN(ds), 1) * 0.8;
  const ext = [];
  // episode 1: five in-band days bottoming at L1
  for (let i = 1; i <= 5; i++) ext.push({ date: day(i), price: inBand(day(i)) * (1 - 0.02 * Math.min(i, 3)) });
  const L1 = Math.min(...ext.map(r => r.price));
  // a real rally: 30 days well above the band (5× the low)
  for (let i = 6; i <= 35; i++) ext.push({ date: day(i), price: L1 * (2 + 3 * (i - 6) / 29) });
  // re-entry: back into the band with only a tiny bounce (< minGain)
  const reLow = day(38);
  ext.push({ date: day(36), price: inBand(day(36)) * 0.95 });
  ext.push({ date: day(37), price: inBand(day(37)) * 0.9 });
  ext.push({ date: reLow, price: inBand(reLow) * 0.85 });
  ext.push({ date: day(39), price: inBand(day(39)) * 0.87 });
  // self-check the premise: the re-entry prints really are band 0
  assert.equal(bandIndex(m, ext.at(-1).price, dayN(ext.at(-1).date)), 0, "re-entry price sits in the Fire Sale band");

  const series = [...DEFAULT_RAW, ...ext];
  const rallies = buildFireSaleRallies(series, m, { minGain: 0.3 });
  const last = rallies.at(-1), prev = rallies.at(-2);
  // the LIVE episode is returned despite its small bounce, anchored on the NEW low…
  assert.equal(last.startDate, reLow, `last rally must reset to the re-entry low, got ${last.startDate}`);
  assert.ok(last.maxGain < 0.3, "the fresh episode hasn't staged a real rally yet");
  // …and the prior cycle stays recorded with its top intact
  assert.ok(prev && prev.maxGain >= 3.5, `previous cycle keeps its ~5x top, got ${prev && prev.maxGain}`);
});
