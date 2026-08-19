import { test } from "node:test";
import assert from "node:assert/strict";
import { valuationCheck } from "../scripts/bot/valuation-check.mjs";

// 200 days: MVRV rises 0.5→2.0 over history, then the LAST day drops to a fresh low (0.45).
// So MVRV's latest should sit near the bottom percentile and "fire".
const days = 200;
const onchain = Array.from({ length: days }, (_, i) => {
  const mvrv = i === days - 1 ? 0.45 : 0.5 + (i / days) * 1.5;
  const rp = 0.5, spot = mvrv * rp;
  return { d: `d${String(i).padStart(3, "0")}`, mvrv, rp, spot, nrpl: 0, sopr: 1, sip: 50, lthProfit: 40, lthLoss: 40, liveliness: 0.6 };
});

test("valuationCheck — a fresh low fires (bottom percentile) and reports firing/hit counts", () => {
  const r = valuationCheck({ onchain });
  assert.ok(r && r.rows.length >= 6);
  const mvrv = r.rows.find(x => x.key === "mvrv");
  assert.ok(mvrv.pLatest <= 15, "fresh-low MVRV should be in the bottom 15th percentile: p" + mvrv.pLatest);
  assert.ok(mvrv.firing, "MVRV should be firing");
  assert.equal(typeof r.firing, "number");
  assert.ok(r.firing <= r.total && r.hit <= r.total);
  assert.ok(Array.isArray(r.omitted) && r.omitted.length >= 3, "BTC-only omissions listed honestly");
});

test("valuationCheck — a mid-range latest does NOT fire", () => {
  // MVRV flat at ~1.0 → latest is mid-distribution, not extreme
  const flat = onchain.map((r, i) => ({ ...r, mvrv: 1.0 + (i % 5) * 0.01, spot: (1.0 + (i % 5) * 0.01) * r.rp }));
  const r = valuationCheck({ onchain: flat });
  const mvrv = r.rows.find(x => x.key === "mvrv");
  assert.ok(!mvrv.firing, "a mid-range MVRV must not fire");
});

test("valuationCheck — returns null on too little history", () => {
  assert.equal(valuationCheck({ onchain: onchain.slice(0, 30) }), null);
});
