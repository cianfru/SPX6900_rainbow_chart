import { test } from "node:test";
import assert from "node:assert/strict";
import { scanAnomalies } from "../scripts/bot/anomaly-scan.mjs";

const days = (n, f) => Array.from({ length: n }, (_, i) => ({ d: `d${String(i).padStart(3, "0")}`, ...f(i) }));

test("scanAnomalies — flags a sudden jump, not a slow trend", () => {
  // mvrv: flat ~0.6 then a spike to 1.2 on the last day. gini: slow linear climb (a trend, not an anomaly).
  const onchain = days(60, i => ({
    mvrv: i === 59 ? 1.2 : 0.6 + (i % 3) * 0.001,
    gini: 0.90 + i * 0.001,              // steady trend → should NOT flag
    spot: 0.3,
  }));
  const r = scanAnomalies({ onchain });
  const byKey = Object.fromEntries(r.items.map(x => [x.key, x]));
  assert.ok(byKey.mvrv && byKey.mvrv.z >= 4, "the mvrv jump should flag");
  assert.ok(!byKey.gini, "a slow steady trend should NOT flag");
});

test("scanAnomalies — a flat series never flags (no divide-by-zero blowup)", () => {
  const onchain = days(60, () => ({ sip: 45, spot: 0.3 }));
  const r = scanAnomalies({ onchain });
  assert.ok(!r.items.some(x => x.key === "sip"));
});

test("scanAnomalies — HolderScan tiers are not scanned (reshuffle artifacts)", () => {
  const history = days(60, i => ({ holders: 49000, sup: { diamond: 5e8, gold: i === 59 ? 5e8 : 1e8 }, p: 0.3 }));
  const r = scanAnomalies({ history });
  assert.ok(!r.items.some(x => x.key.startsWith("sup.")), "sup.* tiers must be excluded");
});

test("scanAnomalies — catches an exit-supply spike from exit-flow", () => {
  const calm = Array.from({ length: 40 }, (_, i) => [`d${i}`, 4, 1, 40000, 10000]);
  const exitFlow = { days: [...calm, ["spike", 120, 6, 10000000, 200000]] };
  const r = scanAnomalies({ exitFlow });
  const ex = r.items.find(x => x.key === "exitSupply");
  assert.ok(ex && ex.z > 10, "a 10M-SPX exit day should flag hard: " + JSON.stringify(ex));
});
