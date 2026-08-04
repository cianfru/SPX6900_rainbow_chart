import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateWindow } from "../api/live-flow.js";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";
const OTHER = "0x00000000000000000000000000000000000000cc";
const BPD = 7200, BPH = 300;
// latest block; a transfer N days ago sits at latest - N*BPD
const LATEST = 1_000_000;
const bnDaysAgo = d => "0x" + (LATEST - d * BPD).toString(16);
const bnHoursAgo = h => "0x" + (LATEST - h * BPH).toString(16);

test("aggregateWindow: net, live sub-window, and per-day footprint", () => {
  const watched = new Set([A, B]);
  const transfers = [
    // A slowly offloading across 3 different days (all sells) → sellDays 3, net negative
    { from: A, to: OTHER, value: 200000, blockNum: bnDaysAgo(5) },
    { from: A, to: OTHER, value: 150000, blockNum: bnDaysAgo(3) },
    { from: A, to: OTHER, value: 300000, blockNum: bnHoursAgo(2) },   // within the live 6h window
    // B accumulating once, today, inside the live window
    { from: OTHER, to: B, value: 500000, blockNum: bnHoursAgo(1) },
    // an unwatched wallet → ignored
    { from: OTHER, to: OTHER, value: 999999, blockNum: bnDaysAgo(1) },
  ];
  const out = aggregateWindow(transfers, watched, LATEST, { liveHours: 6 });
  const byA = Object.fromEntries(out.map(w => [w.a, w]));

  // A: net −650k, only the −300k tranche is inside the live 6h window, 3 active/selling days
  assert.equal(byA[A].net, -650000);
  assert.equal(byA[A].live, -300000);
  assert.equal(byA[A].activeDays, 3);
  assert.equal(byA[A].sellDays, 3);
  // B: +500k, all live, 1 day, 0 selling days
  assert.equal(byA[B].net, 500000);
  assert.equal(byA[B].live, 500000);
  assert.equal(byA[B].sellDays, 0);
  // biggest net SELLER first
  assert.equal(out[0].a, A);
  assert.equal(out.length, 2);
});

test("aggregateWindow drops net-flat wallets + handles empty", () => {
  const watched = new Set([A]);
  // A buys 100k then sells 100k across the window → net flat → not earmarked
  const flat = [
    { from: OTHER, to: A, value: 100000, blockNum: bnDaysAgo(4) },
    { from: A, to: OTHER, value: 100000, blockNum: bnDaysAgo(2) },
  ];
  assert.deepEqual(aggregateWindow(flat, watched, LATEST), []);
  assert.deepEqual(aggregateWindow([], watched, LATEST), []);
});
