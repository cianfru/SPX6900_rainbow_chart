import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenIdToDecimal, normalizeTransfer, transfersToCsv, csvRowCount } from "../scripts/build-aeon-transfers-alchemy.mjs";

test("tokenIdToDecimal: hex, decimal, junk", () => {
  assert.equal(tokenIdToDecimal("0x0d05"), "3333");
  assert.equal(tokenIdToDecimal("0x0"), "0");
  assert.equal(tokenIdToDecimal("42"), "42");
  assert.equal(tokenIdToDecimal(""), null);
  assert.equal(tokenIdToDecimal(null), null);
  assert.equal(tokenIdToDecimal("0xZZ"), null);
});

test("normalizeTransfer: lowercases, keeps mint, drops incomplete", () => {
  const r = normalizeTransfer({ from: "0xABC", to: "0xDEF", erc721TokenId: "0x1", metadata: { blockTimestamp: "2024-01-01T00:00:00.000Z" } });
  assert.deepEqual(r, { from: "0xabc", to: "0xdef", id: "1", time: "2024-01-01T00:00:00.000Z" });
  // mint from the zero address is kept (first transfer, needed for age)
  assert.ok(normalizeTransfer({ from: "0x0000000000000000000000000000000000000000", to: "0xa", erc721TokenId: "0x2", metadata: { blockTimestamp: "2024-01-02T00:00:00.000Z" } }));
  // missing id / time / party → dropped
  assert.equal(normalizeTransfer({ from: "0xa", to: "0xb", metadata: { blockTimestamp: "2024-01-01T00:00:00.000Z" } }), null);
  assert.equal(normalizeTransfer({ from: "0xa", to: "0xb", erc721TokenId: "0x1" }), null);
});

test("transfersToCsv: canonical header, sorted asc, deduped", () => {
  const raw = [
    { from: "0xB", to: "0xC", erc721TokenId: "0x2", metadata: { blockTimestamp: "2024-03-01T00:00:00.000Z" } },
    { from: "0x0", to: "0xB", erc721TokenId: "0x2", metadata: { blockTimestamp: "2024-01-01T00:00:00.000Z" } }, // earlier
    { from: "0x0", to: "0xB", erc721TokenId: "0x2", metadata: { blockTimestamp: "2024-01-01T00:00:00.000Z" } }, // dup of above
    { from: "0xX", to: "0xY", metadata: { blockTimestamp: "2024-02-01T00:00:00.000Z" } }, // no id → dropped
  ];
  const { csv, count } = transfersToCsv(raw);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "from_address,to_address,token_id,time");
  assert.equal(count, 2); // dup + junk removed
  assert.equal(lines[1], "0x0,0xb,2,2024-01-01T00:00:00.000Z"); // oldest first
  assert.equal(lines[2], "0xb,0xc,2,2024-03-01T00:00:00.000Z");
});

test("csvRowCount ignores header + blank lines", () => {
  assert.equal(csvRowCount("from_address,to_address,token_id,time\na,b,1,t\nc,d,2,u\n"), 2);
  assert.equal(csvRowCount("from_address,to_address,token_id,time\n"), 0);
});
