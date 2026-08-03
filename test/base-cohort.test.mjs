import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCohort } from "../scripts/build-base-cohort.mjs";

const now = Date.parse("2026-08-03");
const CSV = [
  "address,balance,status,first_5k_day,since_5k_day,exit_day",
  "0xAAA,9000000.00,holder,2024-03-20,2024-03-20,",           // whale holder
  "0xBBB,6000.00,holder,2025-06-01,2025-06-01,",              // recent holder
  "0xe96a4e9ea3a2c6db214174738a19eb7dbb8a3069,700000.00,holder,2024-03-14,2024-03-14,", // LP pool → excluded
  "0xCCC,-12000.00,exited,2024-12-29,,2025-06-18",            // exited
  "0xDDD,100.00,exited,2024-05-01,,2025-11-12",               // exited
].join("\n");

test("parseCohort: splits holders/exits, strips infra, computes ages", () => {
  const { holders, exits, excludedSupply } = parseCohort(CSV, { nowTs: now });
  assert.deepEqual(holders.map(h => h.a), ["0xaaa", "0xbbb"]);      // LP pool excluded, sorted by balance
  assert.equal(excludedSupply, 700000);                            // the LP pool's supply, reported
  assert.equal(exits.length, 2);                                   // 2 exited wallets
  const bbb = holders.find(h => h.a === "0xbbb");
  assert.ok(Math.abs(bbb.days - Math.round((now - Date.parse("2025-06-01")) / 86400000)) <= 1);
});

test("parseCohort: holder below the bar is not counted", () => {
  const csv = "address,balance,status,first_5k_day,since_5k_day,exit_day\n0xZZZ,4000.00,holder,2025-01-01,2025-01-01,";
  const { holders } = parseCohort(csv, { nowTs: now });
  assert.equal(holders.length, 0);
});
