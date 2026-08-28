import test from "node:test";
import assert from "node:assert/strict";
import { archiveMaxTimeMs, normalizeEthTransfer, tailRows, appendToArchive } from "../scripts/build-eth-transfers-alchemy-tail.mjs";

const ARCHIVE =
  "sender,receiver,time,value\n" +
  "0xaaa,0xbbb,2026-08-25 10:00:00 UTC,100000000\n" +
  "0xbbb,0xccc,2026-08-26 12:00:00 UTC,200000000\n";

test("archiveMaxTimeMs finds the newest timestamp", () => {
  assert.equal(archiveMaxTimeMs(ARCHIVE), Date.parse("2026-08-26 12:00:00 UTC"));
  assert.equal(archiveMaxTimeMs(""), 0);
  assert.equal(archiveMaxTimeMs("sender,receiver,time,value\n"), 0); // header only
});

test("normalizeEthTransfer maps an Alchemy erc20 transfer, value stays RAW integer", () => {
  const t = { from: "0xAbC", to: "0xDeF", metadata: { blockTimestamp: "2026-08-27T09:00:00.000Z" }, rawContract: { value: "0x5f5e100" } }; // 0x5f5e100 = 100,000,000
  const r = normalizeEthTransfer(t);
  assert.deepEqual(r, { sender: "0xabc", receiver: "0xdef", time: "2026-08-27T09:00:00.000Z", value: "100000000" });
  // missing fields → null (never a half row)
  assert.equal(normalizeEthTransfer({ from: "0xa", to: "0xb", metadata: {} }), null);
  assert.equal(normalizeEthTransfer({ from: "0xa", metadata: { blockTimestamp: "x" }, rawContract: { value: "0x1" } }), null);
});

test("tailRows keeps only rows strictly newer than the archive edge, deduped + sorted", () => {
  const since = Date.parse("2026-08-26 12:00:00 UTC");
  const raw = [
    { from: "0x1", to: "0x2", metadata: { blockTimestamp: "2026-08-26T11:00:00.000Z" }, rawContract: { value: "0x1" } }, // older → drop
    { from: "0x3", to: "0x4", metadata: { blockTimestamp: "2026-08-28T08:00:00.000Z" }, rawContract: { value: "0x2" } }, // newer
    { from: "0x5", to: "0x6", metadata: { blockTimestamp: "2026-08-27T08:00:00.000Z" }, rawContract: { value: "0x3" } }, // newer
    { from: "0x5", to: "0x6", metadata: { blockTimestamp: "2026-08-27T08:00:00.000Z" }, rawContract: { value: "0x3" } }, // dup → drop
  ];
  const rows = tailRows(raw, since);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].time, "2026-08-27T08:00:00.000Z"); // sorted oldest-first
  assert.equal(rows[1].time, "2026-08-28T08:00:00.000Z");
});

test("appendToArchive appends in the sender,receiver,time,value shape without a double newline", () => {
  const rows = [{ sender: "0x3", receiver: "0x4", time: "2026-08-28T08:00:00.000Z", value: "2" }];
  const out = appendToArchive(ARCHIVE, rows);
  const lines = out.split(/\r?\n/).filter(l => l.trim());
  assert.equal(lines.length, 4); // header + 2 existing + 1 appended
  assert.equal(lines.at(-1), "0x3,0x4,2026-08-28T08:00:00.000Z,2");
  // no rows → unchanged body, single trailing newline
  assert.equal(appendToArchive(ARCHIVE, []).split(/\r?\n/).filter(l => l.trim()).length, 3);
});
