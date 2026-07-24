import test from "node:test";
import assert from "node:assert/strict";
import { mergeBank } from "../scripts/build-aeon-live-bank.mjs";
import { liveTail, impliedEthUsd } from "../scripts/aeon-live-tail.mjs";

const DAY = 86400e3;
const NOW = Date.parse("2026-07-24T00:00:00Z");
const s = (o = {}) => ({ id: 1, price: 0.5, ts: NOW, d: "2026-07-24", mkt: "blur", tx: "0xa", ...o });

test("bank dedupes the same token in the same transaction across overlapping windows", () => {
  const merged = mergeBank([s()], [s(), s()], { nowMs: NOW });
  assert.equal(merged.length, 1);
});

test("bank keeps a token that legitimately traded twice in different transactions", () => {
  const merged = mergeBank([s({ tx: "0xa" })], [s({ tx: "0xb", ts: NOW + 1000 })], { nowMs: NOW });
  assert.equal(merged.length, 2);
});

test("bank drops rows older than the retention window and stays sorted", () => {
  const merged = mergeBank(
    [s({ tx: "old", ts: NOW - 200 * DAY }), s({ tx: "b", ts: NOW - 2 * DAY })],
    [s({ tx: "c", ts: NOW })],
    { nowMs: NOW, keepDays: 120 });
  assert.deepEqual(merged.map(r => r.tx), ["b", "c"]);
});

test("bank ignores junk rows rather than banking a zero-price sale", () => {
  const merged = mergeBank([], [s({ price: 0 }), s({ tx: "z", id: null })], { nowMs: NOW });
  assert.equal(merged.length, 0);
});

test("tail returns ONLY rows newer than the Dune seam — no double counting", () => {
  const bank = { sales: [
    s({ tx: "before", ts: NOW - 3 * DAY }),
    s({ tx: "at-seam", ts: NOW - 2 * DAY }),
    s({ tx: "after", ts: NOW - 1 * DAY }),
  ] };
  const tail = liveTail(NOW - 2 * DAY, { bank });
  assert.deepEqual(tail.map(r => r.tx), ["after"], "the seam row itself must not be re-added");
});

test("tail is empty when the Dune baseline is already current", () => {
  const bank = { sales: [s({ ts: NOW - 5 * DAY })] };
  assert.deepEqual(liveTail(NOW, { bank }), []);
});

test("implied ETH/USD comes from the most recent priced Dune row", () => {
  assert.equal(impliedEthUsd([{ eth: 1, usd: 2000 }, { eth: 0.5, usd: 1000 }]), 2000);
  assert.equal(impliedEthUsd([]), null);
});
