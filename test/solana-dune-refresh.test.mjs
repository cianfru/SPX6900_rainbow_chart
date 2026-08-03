import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoffDay, colIdx, splitCsv, mergeArchive } from "../scripts/build-solana-dune-refresh.mjs";

test("cutoffDay: floors a Dune timestamp to the UTC day", () => {
  assert.equal(cutoffDay("2026-08-03 00:00:00.000 UTC"), "2026-08-03");
  assert.equal(cutoffDay("2026-08-03"), "2026-08-03");
});

test("colIdx finds owner/balance/day by name in any order", () => {
  const i = colIdx(splitCsv("day,owner,balance"));
  assert.equal(i.day, 0); assert.equal(i.owner, 1); assert.equal(i.balance, 2);
});

test("mergeArchive: base<cutoff + full delta, boundary day comes from the delta", () => {
  const base = "owner,balance,day\nAAA,6000,2026-08-01\nAAA,6100,2026-08-02\nBBB,7000,2026-08-02";
  // a REAL delta (day >= cutoff) re-pulls the WHOLE boundary day → includes BBB's 08-02 too
  const delta = "owner,balance,day\nAAA,6200,2026-08-02\nBBB,7000,2026-08-02\nAAA,6300,2026-08-03";
  const { csv, added, kept } = mergeArchive(base, delta, "2026-08-02");
  assert.equal(kept, 1);    // only AAA 08-01 survives from base
  assert.equal(added, 3);   // all delta rows
  const lines = csv.trim().split("\n").slice(1);
  assert.ok(lines.includes("AAA,6200,2026-08-02")); // boundary from delta, not base's 6100
  assert.ok(lines.includes("BBB,7000,2026-08-02"));  // boundary wallet preserved via delta
  assert.ok(!lines.includes("AAA,6100,2026-08-02")); // stale boundary row dropped
});
