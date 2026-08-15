import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSweeps } from "../scripts/bot/aeon-sweep-card.mjs";
import { sweepCopy } from "../scripts/bot/aeon-sweep-watch.mjs";

const buy = (to, token, d, eth = 0.5) => ({ f: "0xseller", to, token, eth, usd: eth * 1800, d });

test("detectSweeps: finds a same-day sweep of ≥3 distinct tokens", () => {
  const trades = [
    buy("0xA", 1, "2026-08-14"), buy("0xA", 2, "2026-08-14"), buy("0xA", 3, "2026-08-14"),
    buy("0xB", 9, "2026-08-14"),   // single buy, not a sweep
  ];
  const sw = detectSweeps(trades, { days: 3, minN: 3 });
  assert.equal(sw.length, 1);
  assert.equal(sw[0].a, "0xA");
  assert.equal(sw[0].n, 3);
  assert.equal(sw[0].span, 1);
  assert.deepEqual(sw[0].tokens.sort(), [1, 2, 3]);
});

test("detectSweeps: counts DISTINCT tokens, not trades (a re-list re-sale isn't a bigger sweep)", () => {
  const trades = [buy("0xA", 1, "2026-08-14"), buy("0xA", 1, "2026-08-14"), buy("0xA", 2, "2026-08-14")];
  assert.equal(detectSweeps(trades, { days: 3, minN: 3 }).length, 0, "2 distinct tokens is not a ≥3 sweep");
});

test("detectSweeps: honours the day window", () => {
  const spread = [buy("0xA", 1, "2026-08-10"), buy("0xA", 2, "2026-08-13"), buy("0xA", 3, "2026-08-16")];
  assert.equal(detectSweeps(spread, { days: 3, minN: 3 }).length, 0, "8 days apart, not within a 3-day window");
  const tight = [buy("0xA", 1, "2026-08-14"), buy("0xA", 2, "2026-08-15"), buy("0xA", 3, "2026-08-16")];
  const sw = detectSweeps(tight, { days: 3, minN: 3 });
  assert.equal(sw.length, 1);
  assert.equal(sw[0].span, 3);
});

test("detectSweeps: freshDays drops stale sweeps", () => {
  const trades = [buy("0xOld", 1, "2026-07-21"), buy("0xOld", 2, "2026-07-21"), buy("0xOld", 3, "2026-07-21")];
  assert.equal(detectSweeps(trades, { days: 3, minN: 3, freshDays: 3, asOf: "2026-08-16" }).length, 0);
  assert.equal(detectSweeps(trades, { days: 3, minN: 3, freshDays: 3, asOf: "2026-07-22" }).length, 1);
});

test("detectSweeps: ranks biggest sweep first, sums eth/usd", () => {
  const trades = [
    buy("0xBig", 1, "2026-08-14", 1), buy("0xBig", 2, "2026-08-14", 1), buy("0xBig", 3, "2026-08-14", 1), buy("0xBig", 4, "2026-08-14", 1),
    buy("0xSm", 5, "2026-08-14", 2), buy("0xSm", 6, "2026-08-14", 2), buy("0xSm", 7, "2026-08-14", 2),
  ];
  const sw = detectSweeps(trades, { days: 3, minN: 3 });
  assert.equal(sw[0].a, "0xBig");
  assert.equal(sw[0].n, 4);
  assert.equal(sw[0].eth, 4);
  assert.equal(sw[1].a, "0xSm");
});

test("sweepCopy: within X length, mentions the count and average", () => {
  const sw = { a: "0x2da96025fbceb584fb24a63ff47f5c4bd459acea", n: 16, span: 1, start: "2026-07-21", end: "2026-07-21", eth: 14.62, usd: 28133, tokens: Array.from({ length: 16 }, (_, i) => i + 1) };
  const c = sweepCopy(sw);
  assert.match(c, /swept 16 Project AEON in a single day/);
  assert.match(c, /Average/);
  assert.equal(c.split("\n").length, 3, "exactly 3 template lines");
});
