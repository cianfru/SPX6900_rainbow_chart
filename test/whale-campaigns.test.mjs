import { test } from "node:test";
import assert from "node:assert/strict";
import { updateCampaigns } from "../scripts/build-whale-campaigns.mjs";

const A = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000cc";
const DAY = 864e5;
const watched = new Set([A]);
const T0 = Date.parse("2026-06-01T00:00:00Z");
const at = d => T0 + d * DAY;                 // day-d timestamp
const sell = (d, v) => ({ from: A, to: OTHER, value: v, ts: at(d) });
const buy = (d, v) => ({ from: OTHER, to: A, value: v, ts: at(d) });

test("a campaign accumulates the whole run and counts sell-days", () => {
  const now = at(6);
  const out = updateCampaigns([], [sell(0, 200000), sell(2, 150000), sell(5, 300000)], now, { watched });
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.net, -650000);              // cumulative over the whole run, not a trailing window
  assert.equal(c.firstTs, at(0));            // anchored to the first sale
  assert.equal(c.lastTs, at(5));
  assert.equal(c.days.length, 3);            // three active days
  assert.equal(c.days.filter(([, n]) => n < 0).length, 3); // three sell days
});

test("the idle clock RESETS on each move — a >7d gap starts a fresh campaign", () => {
  const now = at(20);
  // sells on day 0 and 2, then a 9-day gap, then a new sell on day 18
  const out = updateCampaigns([], [sell(0, 200000), sell(2, 150000), sell(18, 90000)], now, { watched });
  assert.equal(out.length, 1);
  const c = out[0];
  assert.equal(c.firstTs, at(18));           // reset to the post-gap sale
  assert.equal(c.net, -90000);               // only the new campaign's flow
  assert.equal(c.days.length, 1);
});

test("a campaign ends after IDLE_DAYS of silence", () => {
  // last activity day 2; now is day 10 (>7 idle) → dropped
  assert.equal(updateCampaigns([], [sell(0, 200000), sell(2, 150000)], at(10), { watched }).length, 0);
  // now day 8 (<7 idle from day 2) → still listed
  assert.equal(updateCampaigns([], [sell(0, 200000), sell(2, 150000)], at(8), { watched }).length, 1);
});

test("net accumulates across runs via prev state; a same-day delta merges", () => {
  const now = at(3);
  const run1 = updateCampaigns([], [sell(0, 200000)], at(0.5), { watched });
  // next run: another sale later on day 0, then day 2 — prev carried forward
  const run2 = updateCampaigns(run1, [sell(0, 100000), sell(2, 300000)], now, { watched });
  const c = run2[0];
  assert.equal(c.net, -600000);              // 200k + 100k + 300k
  assert.equal(c.days.find(([d]) => d === "2026-06-01")[1], -300000); // day-0 merged (200k+100k)
  assert.equal(c.firstTs, at(0));            // campaign start preserved across runs
});

test("net-buyer and unwatched wallets: sign + filtering", () => {
  const now = at(3);
  const out = updateCampaigns([], [buy(0, 500000), sell(1, 100000), { from: OTHER, to: OTHER, value: 9e6, ts: at(0) }], now, { watched });
  assert.equal(out.length, 1);               // the unwatched OTHER→OTHER is ignored
  assert.equal(out[0].net, 400000);          // net accumulator (+500k −100k)
});

test("a wallet no longer in `known` (excluded as infra / exited) is pruned, even mid-campaign", () => {
  const now = at(3);
  // A is an active campaign in the archive; then it gets tagged as a market maker and leaves whales.json.
  const run1 = updateCampaigns([], [buy(0, 500000), buy(2, 400000)], at(2.5), { watched, known: new Set([A]) });
  assert.equal(run1.length, 1);              // tracked while still a known holder
  // next run: A keeps trading (never idle) but is no longer in `known` → dropped, not left "accumulating"
  const run2 = updateCampaigns(run1, [buy(2.6, 300000)], now, { watched, known: new Set() });
  assert.equal(run2.length, 0);
  // without a `known` allowlist, behaviour is unchanged (existing callers/tests)
  assert.equal(updateCampaigns(run1, [buy(2.6, 300000)], now, { watched }).length, 1);
});
