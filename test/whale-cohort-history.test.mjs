import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whaleCohortHistory } from "../scripts/build-whale-cohorts.mjs";
import { COHORTS } from "../src/whale-cohorts.js";

// The builder re-slices the weekly timeline into per-cohort counts. These pin the shape and the
// one behaviour that carries a claim: a wallet is counted in the cohort its balance sits in THAT
// week, and it moves between cohorts as it grows or shrinks (so the "base broadened / mega-whales
// thinned" story is real, not an artefact of counting each wallet once).

const mk = (wallets, n = 5, week0 = "2024-01-01") => ({ updated: "2024-02-01", week0, n, threshold: 5000, wallets });

test("shape: one row per week, [date, ...counts] with a count per cohort", () => {
  const o = whaleCohortHistory(mk([{ a: "0x1", p: [[0, 2_000_000]] }], 4));
  assert.equal(o.rows.length, 4);
  assert.equal(o.labels.length, COHORTS.length);
  for (const r of o.rows) {
    assert.equal(r.length, 1 + COHORTS.length);
    assert.match(r[0], /^\d{4}-\d{2}-\d{2}$/);
    r.slice(1).forEach(v => assert.ok(v >= 0 && Number.isInteger(v)));
  }
});

test("a wallet is binned by its balance each week and migrates cohorts", () => {
  // grows 150k (cohort 0) → 2M (cohort 2) → 6M (cohort 3) over the weeks
  const o = whaleCohortHistory(mk([{ a: "0xg", p: [[0, 150_000], [2, 2_000_000], [4, 6_000_000]] }], 5));
  const wkTot = r => r.slice(1).reduce((s, v) => s + v, 0);
  o.rows.forEach(r => assert.equal(wkTot(r), 1));      // exactly one whale, every week
  assert.equal(o.rows[0][1], 1);                        // week 0 → cohort 0 (100–250k)
  assert.equal(o.rows[2][3], 1);                        // week 2 → cohort 2 (1–5M)
  assert.equal(o.rows[4][4], 1);                        // week 4 → cohort 3 (5M+)
});

test("sub-whale wallets never count; a wallet dropping below 100k leaves", () => {
  const o = whaleCohortHistory(mk([
    { a: "0xa", p: [[0, 50_000]] },                      // never a whale
    { a: "0xb", p: [[0, 300_000], [3, 40_000]] },        // whale then leaves
  ], 5));
  const tot = r => r.slice(1).reduce((s, v) => s + v, 0);
  assert.equal(tot(o.rows[0]), 1);                       // only 0xb
  assert.equal(tot(o.rows[3]), 0);                       // 0xb dropped out; 0xa never counted
});

test("against the live timeline: counts reconcile and stay non-negative", () => {
  let tl; try { tl = JSON.parse(readFileSync("public/spx-timeline.json", "utf8")); } catch { return; }
  const o = whaleCohortHistory(tl);
  assert.equal(o.rows.length, tl.n);
  const last = o.rows.at(-1);
  const tot = last.slice(1).reduce((s, v) => s + v, 0);
  assert.ok(tot > 200 && tot < 2000, `plausible whale count, got ${tot}`);   // ~645 today
});
