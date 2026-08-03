import { test } from "node:test";
import assert from "node:assert/strict";
process.env.BASE_SPX = "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C";
const { firstGe5kDay, deltaForWallet } = await import("../scripts/build-base-age-seed.mjs");

const SPX = "0x50da645f148798f68ef2d7db7c1cb22a6819bb2c";
const raw = n => (BigInt(n) * 100000000n).toString();
const D = s => Date.parse(s);

test("firstGe5kDay: first day the running balance crosses the bar (order-independent)", () => {
  const deltas = [
    { delta: BigInt(raw(3000)), ts: D("2024-03-01") },   // 3k — not yet
    { delta: BigInt(raw(4000)), ts: D("2024-05-01") },   // 7k — crosses here
    { delta: BigInt(raw(-1000)), ts: D("2024-06-01") },  // later drop is irrelevant to the FIRST cross
    { delta: BigInt(raw(2000)), ts: D("2024-01-01") },   // earliest (2k) — fed out of order on purpose
  ];
  const a = firstGe5kDay(deltas, 5000);
  // sorted: Jan 2k → Mar 5k?  2k+3k = 5k on 2024-03-01 → crosses THERE
  assert.equal(new Date(a.ts).toISOString().slice(0, 10), "2024-03-01");
  assert.equal(a.bal, 500000000000n);                    // 5,000 raw
});

test("firstGe5kDay: null when the wallet never reaches the bar in-data", () => {
  assert.equal(firstGe5kDay([{ delta: BigInt(raw(4000)), ts: D("2024-01-01") }], 5000), null);
});

test("deltaForWallet: signs by direction, filters non-SPX, tolerates shapes", () => {
  const w = "0xaaaa000000000000000000000000000000000000";
  const recv = deltaForWallet({ token: { address: SPX }, total: { value: raw(6000) }, from: { hash: "0xbbbb" }, to: { hash: w }, timestamp: "2024-04-01T00:00:00Z" }, w);
  assert.equal(recv.delta, BigInt(raw(6000)));           // received → +
  const send = deltaForWallet({ token: { address: SPX }, total: { value: raw(1000) }, from: { hash: w }, to: { hash: "0xbbbb" }, timestamp: "2024-04-02T00:00:00Z" }, w);
  assert.equal(send.delta, -BigInt(raw(1000)));          // sent → −
  assert.equal(deltaForWallet({ token: { address: "0xother" }, total: { value: raw(9) }, from: { hash: "0xb" }, to: { hash: w }, timestamp: "2024-04-01Z" }, w), null); // not SPX
});
