// The real-BTC cycle overlay shared by the site (BtcCycleChart) and the bot
// (cycle/cyclepeak/cycleclock posts). Lock the invariants so site + cards agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { btcCycleProjection } from "../src/btc-cycle.js";

const c = btcCycleProjection();

test("projection is anchored at today's price and strictly ascending in time", () => {
  assert.ok(c.projPts.length > 50, `enough points (${c.projPts.length})`);
  for (let i = 1; i < c.projPts.length; i++) assert.ok(c.projPts[i][0] > c.projPts[i - 1][0], "ts ascending");
  assert.ok(Math.abs(c.projPts[0][1] - c.anchorPrice) / c.anchorPrice < 1e-6, "starts at anchor price");
});

test("peak is well above today with an ordered bear<base<bull cone", () => {
  assert.ok(c.peak > c.anchorPrice * 10, `peak ${c.peak} >> anchor ${c.anchorPrice}`);
  assert.ok(c.peakLo < c.peak && c.peak < c.peakHi, "cone ordered");
  assert.ok(c.peakTs > c.anchorTs, "peak is in the future");
});

test("a dip precedes the run (below anchor, before the peak)", () => {
  assert.ok(c.low < c.anchorPrice, "dip below today");
  assert.ok(c.lowTs < c.peakTs, "dip before peak");
});
