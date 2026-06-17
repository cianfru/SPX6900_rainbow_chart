// The model card scatter (series.resid) must stay ~weekly even though recent
// history snapshots are daily — otherwise dots bunch up at the right edge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, thinSeries } from "../scripts/bot/stats.mjs";
import { DEFAULT_RAW } from "../src/data.js";

const DAY = 86400000;

test("thinSeries enforces a minimum spacing and keeps the last point", () => {
  const daily = Array.from({ length: 40 }, (_, i) => [i * DAY, i]);
  const out = thinSeries(daily, 6 * DAY);
  for (let i = 1; i < out.length - 1; i++) {
    assert.ok(out[i][0] - out[i - 1][0] >= 6 * DAY, "spacing >= 6d");
  }
  assert.deepEqual(out.at(-1), daily.at(-1), "keeps the latest point");
});

test("model scatter tail is not daily even with a daily history tail", () => {
  // Bundled (~weekly) + a daily tail, like the live merged history.
  const last = new Date(DEFAULT_RAW.at(-1).date).getTime();
  const tail = Array.from({ length: 21 }, (_, i) => ({
    date: new Date(last + (i + 1) * DAY).toISOString().slice(0, 10),
    price: DEFAULT_RAW.at(-1).price,
  }));
  const stats = computeStats(tail.at(-1).price, undefined, { history: [...DEFAULT_RAW, ...tail] });
  const resid = stats.series.resid;
  // At most one sub-5-day gap is allowed (the forced final point).
  let tight = 0;
  for (let i = 1; i < resid.length; i++) if (resid[i][0] - resid[i - 1][0] < 5 * DAY) tight++;
  assert.ok(tight <= 1, `dense gaps: ${tight} (expected <= 1)`);
});
