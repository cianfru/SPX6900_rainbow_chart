import { test } from "node:test";
import assert from "node:assert/strict";
import { valuationCheck } from "../scripts/bot/valuation-check.mjs";

// 200 days: MVRV rises 0.5→2.0 over history, then the LAST day drops to a fresh low (0.45).
// So MVRV's latest should sit near the bottom (cheap end) of its 0–100 position.
const days = 200;
const onchain = Array.from({ length: days }, (_, i) => {
  const mvrv = i === days - 1 ? 0.45 : 0.5 + (i / days) * 1.5;
  const rp = 0.5, spot = mvrv * rp;
  return { d: `d${String(i).padStart(3, "0")}`, mvrv, rp, spot, nrpl: 0, sip: 50, liveliness: 0.6 };
});

test("valuationCheck — a fresh low sits at the cheap end, with plain fields", () => {
  const r = valuationCheck({ onchain });
  assert.ok(r && r.rows.length >= 4, "at least the four onchain gauges");
  const mvrv = r.rows.find(x => x.key === "mvrv");
  assert.ok(mvrv.pct <= 15, "fresh-low MVRV should sit in the cheapest 15%: " + mvrv.pct);
  assert.equal(mvrv.tone, "cheap");
  assert.equal(mvrv.state, "deep value");
  assert.equal(typeof mvrv.plain, "string");
  assert.ok(mvrv.reading.endsWith("×"), "reading is human-formatted: " + mvrv.reading);
  assert.equal(typeof r.total, "number");
});

test("valuationCheck — a mid-range latest reads 'fair', not cheap/rich", () => {
  const flat = onchain.map((r, i) => ({ ...r, mvrv: 1.0 + (i % 5) * 0.01, spot: (1.0 + (i % 5) * 0.01) * r.rp }));
  flat[flat.length - 1] = { ...flat[flat.length - 1], mvrv: 1.02, spot: 1.02 * 0.5 };   // latest = the median → mid
  const r = valuationCheck({ onchain: flat });
  const mvrv = r.rows.find(x => x.key === "mvrv");
  assert.equal(mvrv.tone, "neutral");
  assert.equal(mvrv.state, "fair");
});

test("valuationCheck — returns null on too little history", () => {
  assert.equal(valuationCheck({ onchain: onchain.slice(0, 30) }), null);
});
