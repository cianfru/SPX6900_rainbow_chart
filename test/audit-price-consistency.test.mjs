import { test } from "node:test";
import assert from "node:assert/strict";
import { priceConsistency } from "../scripts/audit-feeds.mjs";

const history = [
  { d: "2026-08-18", p: 0.316 }, { d: "2026-08-19", p: 0.318 }, { d: "2026-08-20", p: 0.370 },
];

test("priceConsistency — flags a forward-filled (stale) spot vs the live close", () => {
  const onchain = [{ d: "2026-08-19", spot: 0.318 }, { d: "2026-08-20", spot: 0.322 }];   // frozen at Monday-ish
  const [g] = priceConsistency({ history, onchain });
  assert.equal(g.label, "onchain.json spot");
  assert.equal(g.date, "2026-08-20");
  assert.ok(g.gapPct >= 10 && g.stale, "13% gap should be flagged stale: " + JSON.stringify(g));
});

test("priceConsistency — a same-day-close spot is NOT flagged", () => {
  const onchain = [{ d: "2026-08-20", spot: 0.3701 }];   // matches the live close
  const [g] = priceConsistency({ history, onchain });
  assert.ok(!g.stale, "aligned price must not flag: " + JSON.stringify(g));
});

test("priceConsistency — city-history tuple rows are date-aligned too", () => {
  const cityHistory = { rows: [["2026-08-20", 0.322, 100, 0, 0, 0, 0, 0]] };
  const gaps = priceConsistency({ history, cityHistory });
  assert.equal(gaps[0].label, "city-history.json price");
  assert.ok(gaps[0].stale);
});

test("priceConsistency — no live price to compare → no false alarm", () => {
  assert.deepEqual(priceConsistency({ history: [], onchain: [{ d: "2026-08-20", spot: 0.32 }] }), []);
});
