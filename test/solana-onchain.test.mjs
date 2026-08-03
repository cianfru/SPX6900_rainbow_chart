import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBalances, residents } from "../scripts/build-solana-onchain.mjs";

const CSV = [
  "owner,balance,day",
  "AAA,600000000000,2026-01-05 00:00:00",   // entered 6k in Jan
  "AAA,1000000000000,2026-08-20 00:00:00",  // topped to 10k in Aug (inside the 30d flow window)
  "BBB,700000000000,2026-02-10 00:00:00",   // 7k in Feb
  "BBB,550000000000,2026-03-01 00:00:00",   // settled at 5.5k (still a resident)
  "CCC,800000000000,2026-01-02 00:00:00",   // 8k in Jan
  "CCC,300000000000,2026-07-01 00:00:00",   // dropped to 3k → no longer a resident
].join("\n");

test("parseBalances scales raw base units and finds columns by name", () => {
  const rows = parseBalances(CSV, 1e-8);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].owner, "AAA");
  assert.equal(rows[0].bal, 6000);
});

test("residents: current balance, age, flow, and the ≥5k current-resident filter", () => {
  const now = Date.parse("2026-09-01");
  const res = residents(parseBalances(CSV, 1e-8), { threshold: 5000, nowTs: now, flowDays: 30 });
  const A = res.find(r => r.a === "AAA"), B = res.find(r => r.a === "BBB"), C = res.find(r => r.a === "CCC");

  assert.equal(A.bal, 10000);            // latest balance
  assert.equal(A.flow, 4000);            // 10k now vs 6k before the 30d window
  assert.ok(Math.abs(A.days - 239) < 3); // age since first appearance (Jan 5)
  assert.equal(B.bal, 5500);             // still ≥5k → resident
  assert.equal(B.flow, 0);               // no change inside the window
  assert.equal(C, undefined);            // latest 3k < bar → dropped
  assert.deepEqual(res.map(r => r.a), ["AAA", "BBB"]); // sorted by balance desc
});

test("residents: sub-threshold-only owners produce nothing", () => {
  const rows = parseBalances("owner,balance,day\nZZZ,100000000000,2026-05-01 00:00:00", 1e-8); // 1k
  assert.equal(residents(rows, { threshold: 5000, nowTs: Date.parse("2026-09-01") }).length, 0);
});

// currentDay (dense-snapshot membership): a wallet is a resident iff it appears in the latest dense
// snapshot — NOT if its last ≥5k row is old (that wallet exited; a ≥5k change-log never records the
// drop). Age still comes from the FULL history (first ≥5k day), so a long-quiet holder reads true age.
test("residents: currentDay membership excludes exited wallets, keeps true age", () => {
  const CSV = [
    "owner,balance,day",
    "OLD,600000000000,2024-02-01 00:00:00",   // OLD first hit 6k in Feb 2024
    "OLD,900000000000,2026-08-03 00:00:00",   // …still ≥5k in today's dense snapshot (9k)
    "GONE,700000000000,2024-05-01 00:00:00",  // GONE was 7k in 2024…
    "GONE,650000000000,2025-06-01 00:00:00",  // …last seen 6.5k in 2025, ABSENT from today's snapshot
    "NEW,500000000000,2026-08-03 00:00:00",   // NEW first appears today at 5k
  ].join("\n");
  const res = residents(parseBalances(CSV, 1e-8), { threshold: 5000, currentDay: "2026-08-03" });
  assert.deepEqual(res.map(r => r.a), ["OLD", "NEW"]);           // GONE excluded (not in today's snapshot)
  const OLD = res.find(r => r.a === "OLD"), NEW = res.find(r => r.a === "NEW");
  assert.equal(OLD.bal, 9000);                                   // current = today's snapshot balance
  assert.ok(Math.abs(OLD.days - 914) < 3);                       // age from Feb 2024, not from today
  assert.equal(NEW.days, 0);                                     // genuinely new today
});
