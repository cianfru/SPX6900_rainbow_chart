// The AEON transfers/sales refresh used to re-download the WHOLE history (25k + 17k rows) every
// day. Dune bills an "API Result Read" per download by datapoints, so that full read cost ~62 +
// ~73 credits/day (~4,050/mo, over the 2,500 quota) while the query EXECUTION was ~0.2. The fix
// pulls only the delta since the archive's last day and merges. These cover the pure pieces of
// that merge: the cutoff, the SQL injection, and the boundary-day replacement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCsv, findTimeIdx, cutoffDay, archiveMaxTime, injectSince, mergeCsv } from "../scripts/build-aeon-dune-refresh.mjs";

test("findTimeIdx locates the time column in both AEON schemas", () => {
  assert.equal(findTimeIdx(splitCsv("from_address,to_address,token_id,time")), 3); // transfers
  assert.equal(findTimeIdx(splitCsv("time,token_id,price,currency_symbol")), 0);   // sales
  assert.equal(findTimeIdx(splitCsv("a,evt_block_time,b")), 1);
  assert.equal(findTimeIdx(splitCsv("a,b,c")), -1);
});

test("cutoffDay is midnight UTC of the newest row's day", () => {
  assert.equal(cutoffDay("2026-07-23 23:24:35.000 UTC"), "2026-07-23");
  assert.equal(cutoffDay("2023-11-16 00:00:01.000 UTC"), "2023-11-16"); // AEON inception
  assert.throws(() => cutoffDay("not-a-date"));
});

test("archiveMaxTime reads the latest timestamp across rows", () => {
  const csv = "from_address,to_address,token_id,time\n" +
    "0xa,0xb,1,2026-07-20 10:00:00.000 UTC\n" +
    "0xa,0xb,2,2026-07-23 23:24:35.000 UTC\n" +
    "0xa,0xb,3,2026-07-21 09:00:00.000 UTC\n";
  assert.equal(archiveMaxTime(csv), "2026-07-23 23:24:35.000 UTC");
});

test("injectSince adds the filter before ORDER BY and drops the trailing ;", () => {
  const sql = `SELECT "from" AS from_address, evt_block_time AS time
FROM erc721_ethereum.evt_Transfer
WHERE contract_address = 0xc374
ORDER BY evt_block_time;`;
  const out = injectSince(sql, "evt_block_time", "2026-07-23");
  assert.match(out, /AND evt_block_time >= TIMESTAMP '2026-07-23 00:00:00'/);
  assert.ok(!out.trimEnd().endsWith(";"), "trailing semicolon removed");
  assert.ok(out.indexOf("AND evt_block_time >=") < out.search(/ORDER BY/i), "filter sits before ORDER BY");
});

test("injectSince appends when there is no ORDER BY", () => {
  const out = injectSince("SELECT 1 FROM t WHERE x = 1", "block_time", "2026-01-02");
  assert.match(out, /AND block_time >= TIMESTAMP '2026-01-02 00:00:00'$/);
});

test("mergeCsv replaces the boundary day and keeps every column verbatim", () => {
  const base = "from_address,to_address,token_id,time\n" +
    "0x1,0x2,10,2026-07-22 08:00:00.000 UTC\n" +   // < cutoff → kept
    "0x3,0x4,11,2026-07-23 09:00:00.000 UTC\n";     // == cutoff day → dropped, delta re-supplies
  const delta = "from_address,to_address,token_id,time\n" +
    "0x3,0x4,11,2026-07-23 09:00:00.000 UTC\n" +     // the boundary-day row, re-pulled
    "0x5,0x6,12,2026-07-24 10:00:00.000 UTC\n";      // genuinely new
  const { csv, kept, dropped, added } = mergeCsv(base, delta, "2026-07-23");
  assert.equal(kept, 1);
  assert.equal(dropped, 1);
  assert.equal(added, 2);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "from_address,to_address,token_id,time"); // header preserved
  assert.equal(lines.length, 1 + 1 + 2);                            // header + kept + delta
  assert.ok(csv.includes("0x5,0x6,12,2026-07-24 10:00:00.000 UTC"), "new row present");
  assert.ok(!csv.includes("0x3,0x4,11,2026-07-23 09:00:00.000 UTC\n0x3"), "boundary row not duplicated");
});

test("mergeCsv throws if the delta has no header/rows (protects the archive)", () => {
  const base = "from_address,to_address,token_id,time\n0x1,0x2,10,2026-07-22 08:00:00.000 UTC\n";
  assert.throws(() => mergeCsv(base, "", "2026-07-22"));
});
