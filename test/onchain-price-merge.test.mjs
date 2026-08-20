import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePriceRows } from "../scripts/build-onchain-dune-refresh.mjs";

test("mergePriceRows — live daily history overrides the stale weekly dense base", () => {
  const priceHistory = [{ date: "2026-08-15", price: 0.319 }, { date: "2026-08-17", price: 0.3219 }];
  const history = [{ d: "2026-08-17", p: 0.3219, be: 0.52 }, { d: "2026-08-18", p: 0.33, be: 0.52 }, { d: "2026-08-20", p: 0.37, be: 0.52 }];
  const rows = mergePriceRows(priceHistory, history);
  const by = Object.fromEntries(rows);
  assert.equal(rows.at(-1)[0], "2026-08-20");   // extends past the frozen weekly tail
  assert.equal(by["2026-08-20"], 0.37);          // live price present
  assert.equal(by["2026-08-15"], 0.319);         // dense history retained
  // ascending + no dupes
  assert.deepEqual(rows.map(r => r[0]), ["2026-08-15", "2026-08-17", "2026-08-18", "2026-08-20"]);
});

test("mergePriceRows — tolerates array-shaped rows and missing history", () => {
  const rows = mergePriceRows([["2026-08-01", 0.3], ["2026-08-02", 0.31]], null);
  assert.equal(rows.length, 2);
  assert.equal(rows.at(-1)[1], 0.31);
});
