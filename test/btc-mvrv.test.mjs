// Unit tests for the BTC MVRV builder's pure core (sampleMvrv). The network fetch
// runs only in CI; here we exercise the dedupe/sort/weekly-sample logic offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleMvrv } from "../scripts/build-btc-mvrv.mjs";

// Helper: a daily series of [dateStr, value] from a start date.
function daily(start, n, valAt = i => 1 + i * 0.01) {
  const out = [];
  const t0 = new Date(start + "T00:00:00Z").getTime();
  for (let i = 0; i < n; i++) out.push([new Date(t0 + i * 86400000).toISOString().slice(0, 10), valAt(i)]);
  return out;
}

test("samples to roughly one point per week and always keeps the latest", () => {
  const rows = daily("2011-01-01", 30); // 30 daily points
  const s = sampleMvrv(rows, 7);
  // ~every 7 days over 30 days → 5 points (days 0,7,14,21,28) + the last (day 29)
  assert.ok(s.length >= 4 && s.length <= 6, `got ${s.length}`);
  assert.equal(s[0][0], "2011-01-01");
  assert.equal(s.at(-1)[0], "2011-01-30", "latest day is always included");
  // spacing between the interior sampled points is >= 7 days
  for (let i = 1; i < s.length - 1; i++) {
    const gap = (new Date(s[i][0]) - new Date(s[i - 1][0])) / 86400000;
    assert.ok(gap >= 7, `gap ${gap} < 7`);
  }
});

test("dedupes duplicate days (last write wins) and sorts ascending", () => {
  const rows = [
    ["2011-01-10", 2.0],
    ["2011-01-01", 1.0],
    ["2011-01-01", 1.5], // later duplicate for the same day wins
  ];
  const s = sampleMvrv(rows, 7);
  assert.equal(s[0][0], "2011-01-01");
  assert.equal(s[0][1], 1.5);
  assert.ok(s.some(([d]) => d === "2011-01-10"));
  // ascending
  for (let i = 1; i < s.length; i++) assert.ok(s[i][0] > s[i - 1][0]);
});

test("drops non-finite / non-positive values and rounds to 3dp", () => {
  const rows = [
    ["2011-01-01", 1.23456],
    ["2011-01-08", 0],       // dropped
    ["2011-01-15", NaN],     // dropped
    ["2011-01-22", -1],      // dropped
    ["2011-01-29", 2.71828],
  ];
  const s = sampleMvrv(rows, 7);
  assert.deepEqual(s, [["2011-01-01", 1.235], ["2011-01-29", 2.718]]);
});

test("empty input → empty output (no throw)", () => {
  assert.deepEqual(sampleMvrv([]), []);
});
