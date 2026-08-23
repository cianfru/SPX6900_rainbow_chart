import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReconCsv, mergeReconstruction } from "../scripts/build-btc-realized-cap.mjs";

test("parseReconCsv reads date + mvrv, ignores other columns and bad rows", () => {
  const csv = [
    "date,supply_btc,market_cap_usd,realized_cap_usd,mvrv",
    "2010-08-01,3800000,228000,50000,4.56",
    "2010-09-01,3900000,241000,90000,2.68",
    "bad,,,,",                       // dropped: no valid date
    "2010-10-01,4000000,0,0,0",      // dropped: mvrv not > 0
  ].join("\n");
  const r = parseReconCsv(csv);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { date: "2010-08-01", mvrv: 4.56 });
});

test("parseReconCsv sorts ascending by date", () => {
  const csv = "date,mvrv\n2011-02-01,1.2\n2010-08-01,4.5\n2010-12-01,2.0";
  const r = parseReconCsv(csv);
  assert.deepEqual(r.map(x => x.date), ["2010-08-01", "2010-12-01", "2011-02-01"]);
});

test("merge prepends only pre-Coin-Metrics months, rebased to the seam", () => {
  // Coin Metrics starts 2011-01 at 3.0×; recon covers 2010-08 → 2011-01.
  const recon = [
    { date: "2010-08-01", mvrv: 8 },
    { date: "2010-12-01", mvrv: 5 },
    { date: "2011-01-01", mvrv: 4 },   // recon value at the seam
  ];
  const cm = [["2011-01-01", 3.0], ["2011-02-01", 2.5]];
  const { points, added, seamRatio } = mergeReconstruction(recon, cm, "merge");
  // seam ratio = CM first (3.0) / recon at seam (4) = 0.75
  assert.equal(seamRatio, 0.75);
  assert.equal(added, 2);                              // only 2010-08 and 2010-12 are before 2011-01
  assert.deepEqual(points[0], ["2010-08-01", +(8 * 0.75).toFixed(4)]);   // 6.0
  assert.deepEqual(points[1], ["2010-12-01", +(5 * 0.75).toFixed(4)]);   // 3.75
  assert.deepEqual(points[2], ["2011-01-01", 3.0]);   // Coin Metrics takes over, untouched
  assert.deepEqual(points.at(-1), ["2011-02-01", 2.5]);
});

test("merge with no earlier months leaves Coin Metrics untouched", () => {
  const recon = [{ date: "2011-05-01", mvrv: 2 }];
  const cm = [["2011-01-01", 3.0], ["2011-02-01", 2.5]];
  const { points, added } = mergeReconstruction(recon, cm, "merge");
  assert.equal(added, 0);
  assert.deepEqual(points, cm);
});

test("replace mode uses the reconstruction wholesale", () => {
  const recon = [{ date: "2010-08-01", mvrv: 8 }, { date: "2011-01-01", mvrv: 4 }];
  const { points, mode } = mergeReconstruction(recon, [["2011-01-01", 3.0]], "replace");
  assert.equal(mode, "replace");
  assert.deepEqual(points, [["2010-08-01", 8], ["2011-01-01", 4]]);
});
