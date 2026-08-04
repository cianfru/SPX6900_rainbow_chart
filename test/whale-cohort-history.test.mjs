import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { whaleCohortHistory, fromTransfers } from "../scripts/build-whale-cohorts.mjs";
import { COHORTS } from "../src/whale-cohorts.js";

const tmpCsv = (lines) => { const p = join(mkdtempSync(join(tmpdir(), "whc-")), "t.csv"); writeFileSync(p, ["sender,receiver,time,value", ...lines].join("\n")); return p; };
const raw = (n) => Math.round(n * 1e8);   // 8-decimal on-chain units

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

test("daily mode: bins by balance, forward-fills quiet days, migrates cohorts, excludes infra", async () => {
  const Z = "0x0000000000000000000000000000000000000000";
  const W = "0x000000000000000000000000000000000000000a";       // the whale under test
  // day 1: mint 150k → cohort 0; day 3: +2M (2.15M total) → cohort 2; day 6: +4M (6.15M) → cohort 3
  const rows = [
    `${Z},${W},2024-01-01T12:00:00Z,${raw(150_000)}`,
    `${Z},${W},2024-01-03T12:00:00Z,${raw(2_000_000)}`,
    `${Z},${W},2024-01-06T12:00:00Z,${raw(4_000_000)}`,
  ];
  const o = await fromTransfers(tmpCsv(rows));
  assert.equal(o.res, "daily");
  const byDate = Object.fromEntries(o.rows.map(r => [r[0], r.slice(1)]));
  assert.deepEqual(byDate["2024-01-01"], [1, 0, 0, 0]);          // cohort 0
  assert.deepEqual(byDate["2024-01-02"], [1, 0, 0, 0]);          // quiet day → forward-filled
  assert.deepEqual(byDate["2024-01-03"], [0, 0, 1, 0]);          // migrated to cohort 2
  assert.deepEqual(byDate["2024-01-05"], [0, 0, 1, 0]);          // still forward-filled
  assert.deepEqual(byDate["2024-01-06"], [0, 0, 0, 1]);          // migrated to cohort 3
  assert.equal(o.rows.length, 6);                                // Jan 1..6, no gaps
});

test("daily mode: an infra wallet (EXCLUDE) is never counted", async () => {
  // Uniswap V2 SPX/WETH pool — in the EXCLUDE set — receives a whale-sized amount but must not count
  const LP = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
  const o = await fromTransfers(tmpCsv([`0x0000000000000000000000000000000000000000,${LP},2024-01-01T00:00:00Z,${raw(5_000_000)}`]));
  assert.deepEqual(o.rows.at(-1).slice(1), [0, 0, 0, 0]);
});

test("against the live timeline: counts reconcile and stay non-negative", () => {
  let tl; try { tl = JSON.parse(readFileSync("public/spx-timeline.json", "utf8")); } catch { return; }
  const o = whaleCohortHistory(tl);
  assert.equal(o.rows.length, tl.n);
  const last = o.rows.at(-1);
  const tot = last.slice(1).reduce((s, v) => s + v, 0);
  assert.ok(tot > 200 && tot < 2000, `plausible whale count, got ${tot}`);   // ~645 today
});
