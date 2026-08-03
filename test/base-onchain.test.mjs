import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstruct } from "../scripts/build-base-onchain.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";
const raw = n => BigInt(n) * 100000000n;              // human → raw 8-decimal
const D = s => Date.parse(s);
const now = D("2026-08-03");

test("reconstruct: current ≥5k residents, ages, flow; exits drop out", () => {
  const rows = [
    { from: ZERO, to: "a", value: raw(6000), ts: D("2024-01-01") },   // mint 6k → A
    { from: ZERO, to: "b", value: raw(7000), ts: D("2024-02-01") },   // mint 7k → B
    { from: ZERO, to: "c", value: raw(8000), ts: D("2024-03-01") },   // mint 8k → C
    { from: "c", to: "d", value: raw(5000), ts: D("2026-07-25") },    // C→D 5k: C drops to 3k (exit), D=5k new
  ];
  const { residents, totalHolders } = reconstruct(rows, { nowTs: now });
  assert.deepEqual(residents.map(r => r.a), ["b", "a", "d"]);         // sorted by balance desc; C excluded (3k < 5k)
  assert.equal(totalHolders, 4);                                     // A,B,C,D all hold > 0 (C still has 3k)
  const d = residents.find(r => r.a === "d"), a = residents.find(r => r.a === "a");
  assert.equal(d.bal, 5000);
  assert.ok(Math.abs(d.days - 9) <= 1);                              // D first hit 5k on 2026-07-25
  assert.equal(d.flow, 5000);                                        // 0 → 5k inside the 30d window
  assert.equal(a.flow, 0);                                           // A untouched in the window
  assert.ok(a.days > 900);                                          // A since Jan 2024
});

test("reconstruct: tagged infra is excluded and its supply reported", () => {
  const rows = [
    { from: ZERO, to: "a", value: raw(6000), ts: D("2024-01-01") },
    { from: ZERO, to: "b", value: raw(7000), ts: D("2024-02-01") },
  ];
  const { residents, excludedSupply } = reconstruct(rows, { nowTs: now, exclude: { b: { kind: "cex", name: "Coinbase" } } });
  assert.deepEqual(residents.map(r => r.a), ["a"]);
  assert.equal(excludedSupply, 7000);
});

test("reconstruct: holder age anchors to the FIRST ≥5k day, not a re-cross", () => {
  const rows = [
    { from: ZERO, to: "a", value: raw(6000), ts: D("2024-05-01") },  // A first hits 6k here
    { from: "a", to: "x", value: raw(3000), ts: D("2024-09-01") },   // A → 3k (below bar)
    { from: ZERO, to: "a", value: raw(4000), ts: D("2025-06-01") },  // A back to 7k (re-cross)
  ];
  const { residents } = reconstruct(rows, { nowTs: now });
  const a = residents.find(r => r.a === "a");
  assert.equal(a.bal, 7000);
  assert.ok(Math.abs(a.days - Math.round((now - D("2024-05-01")) / 86400000)) <= 1);  // anchored to May 2024
});
