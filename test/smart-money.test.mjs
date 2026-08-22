import { test } from "node:test";
import assert from "node:assert/strict";
import { smartMoney, smartMoneyDaily } from "../scripts/build-smart-money.mjs";

// price steps $0.01 (launch) → $0.10 after 2024-03
const prices = [{ date: "2024-01-01", price: 0.01 }, { date: "2024-03-01", price: 0.10 }];
const tl = {
  updated: "2024-05-20", week0: "2024-01-01", n: 20, threshold: 5000,
  wallets: [
    // QUALIFIES: $50k in @ $0.01, sold 4M @ $0.10 → realized $360k, ROI 7.2×, still holds 1M
    { a: "0xA", p: [[0, 5_000_000], [10, 1_000_000]] },
    // FAILS ROI: bought 100M @ $0.10 ($10M in), sold 50M @ $0.10 → realized 0, ROI 0
    { a: "0xB", p: [[10, 100_000_000], [15, 50_000_000]] },
    // FAILS LIVE: great ROI (9×) but sold to zero → a ghost, dropped
    { a: "0xC", p: [[0, 5_000_000], [10, 0]] },
    // FAILS CAPITAL: only $5k in (500k @ $0.01), sold 400k @ $0.10 → ROI fine but under $25k
    { a: "0xD", p: [[0, 500_000], [10, 100_000]] },
  ],
};

test("smartMoney keeps only proven, live, well-capitalised timers", () => {
  const o = smartMoney(tl, prices);
  assert.equal(o.cohortSize, 1);            // only 0xA
  assert.equal(o.heldNow, 1_000_000);       // 0xA's current bag
  assert.ok(o.medianRoi >= 7 && o.medianRoi <= 7.5);
  assert.equal(o.weeks.length, 20);
});

test("aggregate net-flow reflects the cohort selling down", () => {
  const o = smartMoney(tl, prices);
  // 0xA held 5M through wk9 then 1M from wk10 → net-flow negative over the window
  assert.ok(o.flow.w12 < 0, "12w flow should be distribution");
  // week 10 row carries the -4M step
  const wk10 = o.weeks[10];
  assert.equal(wk10[2], -4_000_000);
});

test("empty when nobody qualifies (thresholds respected)", () => {
  const o = smartMoney(tl, prices, { minInvested: 1e9 });
  assert.equal(o.cohortSize, 0);
  assert.equal(o.heldNow, 0);
});

// ---- daily path (from raw transfers) ----
const T = (d) => Date.parse(d + "T00:00:00Z");
test("smartMoneyDaily qualifies live top-timers from raw transfers, daily grid", () => {
  const rows = [
    // 0xA: buy 5M @ $0.01 ($50k) then sell 4M @ $0.10 → realized $360k, ROI 7.2×, holds 1M
    { from: "0x0000000000000000000000000000000000000000", to: "0xa", t: T("2024-01-05"), qty: 5_000_000 },
    { from: "0xa", to: "0xz", t: T("2024-03-10"), qty: 4_000_000 },
    // 0xB: whale — buy 100M @ $0.10 ($10M), sell 50M @ $0.10 → ROI 0, excluded
    { from: "0x0000000000000000000000000000000000000000", to: "0xb", t: T("2024-03-05"), qty: 100_000_000 },
    { from: "0xb", to: "0xz", t: T("2024-03-20"), qty: 50_000_000 },
  ];
  const o = smartMoneyDaily(rows, prices);
  assert.equal(o.res, "daily");
  assert.equal(o.cohortSize, 1);          // only 0xA
  assert.equal(o.heldNow, 1_000_000);
  assert.ok(o.weeks.length > 300);        // daily grid spans launch→today
  // 0xA crossed the ROI bar on the sell day → one new qualifier that day
  assert.ok(o.newQualifiers.some(([d, c]) => d === "2024-03-10" && c === 1));
});

test("emits per-wallet detail with balances (independent traders)", () => {
  const o = smartMoney(tl, prices);
  assert.ok(Array.isArray(o.wallets) && o.wallets.length === 1, "one wallet in the list");
  assert.equal(o.wallets[0].a, "0xa");           // lowercased address
  assert.equal(o.wallets[0].bal, 1_000_000);     // current bag
});

test("excludes wallets that belong to a multi-wallet cluster", () => {
  const clustered = new Set(["0xa"]);            // 0xA is now flagged as part of a cluster
  const o = smartMoney(tl, prices, { clustered });
  assert.equal(o.cohortSize, 0, "the only qualifier is excluded as clustered");
  assert.equal(o.wallets.length, 0);
});
