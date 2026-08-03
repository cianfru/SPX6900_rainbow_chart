import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransfers, rawToStr, strToRaw, decodeTransfer, loadCohort, dumpCohort } from "../scripts/build-base-alchemy.mjs";

const ZERO = "0x0000000000000000000000000000000000000000";
const raw = n => BigInt(n) * 100000000n;
const mint = (to, n, day, block = 1) => ({ from: ZERO, to, value: raw(n), day, block });
const send = (from, to, n, day, block = 1) => ({ from, to, value: raw(n), day, block });

test("rawToStr/strToRaw round-trip (sign-aware, 8dp)", () => {
  for (const v of [0n, raw(5000), 922533950624220n, -1206904862620n]) assert.equal(strToRaw(rawToStr(v)), v);
  assert.equal(rawToStr(raw(6000)), "6000.00000000");
});

test("applyTransfers: crossing up sets first/since/holder; down sets exit; re-cross keeps first", () => {
  const c = new Map();
  applyTransfers(c, [
    mint("0xa", 6000, "2024-01-01"),   // A → 6k: holder, first=since=Jan1
    send("0xa", "0xb", 4000, "2024-02-01"), // A → 2k (exit Feb1); B → 4k (still <5k)
    mint("0xb", 2000, "2024-03-01"),   // B → 6k: first=since=Mar1
    mint("0xa", 4000, "2024-06-01"),   // A → 6k again: re-cross, first stays Jan1, since=Jun1
  ]);
  const a = c.get("0xa"), b = c.get("0xb");
  assert.equal(a.status, "holder"); assert.equal(a.first, "2024-01-01"); assert.equal(a.since, "2024-06-01"); assert.equal(a.exit, "");
  assert.equal(a.bal, raw(6000));
  assert.equal(b.status, "holder"); assert.equal(b.first, "2024-03-01");
});

test("applyTransfers: an exited wallet keeps its first day and exit day", () => {
  const c = new Map();
  applyTransfers(c, [mint("0xc", 8000, "2024-05-01"), send("0xc", "0xd", 5000, "2025-06-18")]);
  const cc = c.get("0xc");
  assert.equal(cc.status, "exited"); assert.equal(cc.first, "2024-05-01"); assert.equal(cc.exit, "2025-06-18");
});

test("decodeTransfer: Alchemy shape → {from,to,value,day,block}", () => {
  const d = decodeTransfer({ from: "0xAA", to: "0xBB", rawContract: { value: "0x" + raw(1413).toString(16) }, metadata: { blockTimestamp: "2024-07-26T06:53:52.000Z" }, blockNum: "0x8639f7" });
  assert.equal(d.from, "0xaa"); assert.equal(d.value, raw(1413)); assert.equal(d.day, "2024-07-26"); assert.equal(d.block, 8796663);
  assert.equal(decodeTransfer({ from: "0xAA", to: "0xBB", rawContract: { value: "0x1" }, metadata: {}, blockNum: "0x1" }), null); // no timestamp
});

test("loadCohort/dumpCohort: round-trips with the lastBlock header", () => {
  const c = new Map(); applyTransfers(c, [mint("0xa", 6000, "2024-01-01"), mint("0xb", 9000, "2024-02-01")]);
  const csv = dumpCohort(c, 12345678);
  assert.match(csv, /^# lastBlock=12345678/);
  const { cohort, lastBlock } = loadCohort(csv);
  assert.equal(lastBlock, 12345678);
  assert.equal(cohort.get("0xb").bal, raw(9000));
  assert.equal(cohort.get("0xa").first, "2024-01-01");
});
