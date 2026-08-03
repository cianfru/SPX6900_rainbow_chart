import { test } from "node:test";
import assert from "node:assert/strict";
// Force a tiny page size so a 2-log batch counts as "full" for the pagination tests.
process.env.BASE_PAGE = "2";
const { decodeLog, paginate } = await import("../scripts/build-base-transfers.mjs");

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topic = addr => "0x000000000000000000000000" + addr.replace(/^0x/, "").toLowerCase();  // 20-byte addr → 32-byte topic
const hex = n => "0x" + n.toString(16);
// Blockscout shape: topics is a 4-slot array null-padded (ERC-20 → topics[3] = null).
const mkLog = (from, to, rawValue, block, ts, tx = "0xaa", li = 0) => ({
  topics: [TRANSFER, topic(from), topic(to), null],
  data: "0x" + BigInt(rawValue).toString(16).padStart(64, "0"),
  blockNumber: hex(block), timeStamp: hex(ts), transactionHash: tx, logIndex: hex(li),
});

test("decodeLog: a real Blockscout log (4-slot null-padded topics) decodes", () => {
  // captured verbatim from base.blockscout.com getLogs — a 69 SPX mint (from 0x0)
  const r = decodeLog({
    topics: [TRANSFER, "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x00000000000000000000000098e97737b5c4f48893c41e715c910eb2db3f34eb", null],
    data: "0x000000000000000000000000000000000000000000000000000000019b45a500",
    blockNumber: "0x8639f7", timeStamp: "0x6596d0d1", transactionHash: "0xf6", logIndex: "0x1",
  });
  assert.equal(r.sender, "0x0000000000000000000000000000000000000000");  // mint
  assert.equal(r.receiver, "0x98e97737b5c4f48893c41e715c910eb2db3f34eb");
  assert.equal(r.value, "6900000000");                    // 69 SPX raw (8 decimals), exact
  assert.equal(r.block, 8796663);
  assert.equal(r.time, "2024-01-04T15:37:53.000Z");
});

test("decodeLog: extracts from/to, raw value, ISO time", () => {
  const r = decodeLog(mkLog("0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", 500000000000n, 4200, 1721976832));
  assert.equal(r.sender, "0x1111111111111111111111111111111111111111");
  assert.equal(r.receiver, "0x2222222222222222222222222222222222222222");
  assert.equal(r.value, "500000000000");                 // raw uint256, exact (5,000 SPX at 8 decimals)
  assert.equal(r.block, 4200);
  assert.equal(r.time, "2024-07-26T06:53:52.000Z");
});

test("decodeLog: rejects non-ERC-20 Transfer logs", () => {
  const good = mkLog("0x11", "0x22", 1n, 1, 1);
  assert.equal(decodeLog({ ...good, topics: good.topics.slice(0, 2) }), null);        // too few topics
  assert.equal(decodeLog({ ...good, topics: [TRANSFER, good.topics[1], good.topics[2], topic("0x33")] }), null); // ERC-721 (non-null topics[3])
  assert.equal(decodeLog({ ...good, topics: ["0xdeadbeef", good.topics[1], good.topics[2], null] }), null); // wrong sig
});

test("paginate: full page advances to max block and seeds the boundary dedupe set", () => {
  const batch = [mkLog("0x11", "0x22", 1n, 10, 100, "0xa", 0), mkLog("0x33", "0x44", 2n, 12, 120, "0xb", 0)];
  const { rows, nextFrom, nextSeen, done } = paginate(batch, 0, new Set());
  assert.equal(done, false);                 // 2 === PAGE(2) → not the last page
  assert.equal(rows.length, 2);
  assert.equal(nextFrom, 12);                // advance to the batch's max block
  assert.ok(nextSeen.has("0xb:0"));          // block-12 log memoised so the next page won't re-add it
  assert.ok(!nextSeen.has("0xa:0"));         // block-10 log is behind us
});

test("paginate: short page ends the loop", () => {
  const { done, rows } = paginate([mkLog("0x11", "0x22", 9n, 20, 200)], 0, new Set());
  assert.equal(done, true);                  // 1 < PAGE(2)
  assert.equal(rows.length, 1);
});

test("paginate: boundary logs already seen are not duplicated", () => {
  const boundary = mkLog("0x33", "0x44", 2n, 12, 120, "0xb", 0);
  const fresh = mkLog("0x55", "0x66", 3n, 15, 150, "0xc", 0);
  const { rows } = paginate([boundary, fresh], 12, new Set(["0xb:0"]));  // 0xb already appended last page
  assert.deepEqual(rows.map(r => r.value), ["3"]);                       // only the fresh one
});

test("paginate: throws if a single block exceeds the page (no progress)", () => {
  const a = mkLog("0x11", "0x22", 1n, 12, 120, "0xa", 0), b = mkLog("0x33", "0x44", 2n, 12, 120, "0xb", 1);
  assert.throws(() => paginate([a, b], 12, new Set(["0xa:0", "0xb:1"])), /no progress/);
});
