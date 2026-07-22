// Unit tests for the Dune incremental FIFO-refresh helpers (no network / no Dune).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitCsv, colIdx, cutoffDay, archiveMaxTime, mergeArchive } from "../scripts/build-onchain-dune-refresh.mjs";

test("colIdx maps both BigQuery and Dune headers", () => {
  const bq = colIdx(splitCsv("from_address,to_address,block_timestamp,value"));
  assert.deepEqual(bq, { from: 0, to: 1, time: 2, value: 3 });
  const dn = colIdx(splitCsv("sender,receiver,time,value"));
  assert.deepEqual(dn, { from: 0, to: 1, time: 2, value: 3 });
  const alt = colIdx(splitCsv("to,from,value,evt_block_time")); // out of order + aliases
  assert.deepEqual(alt, { from: 1, to: 0, time: 3, value: 2 });
});

test("cutoffDay returns the UTC day of the max timestamp", () => {
  assert.equal(cutoffDay("2026-07-20 20:00:00.000 UTC"), "2026-07-20");
  assert.equal(cutoffDay("2026-07-20T23:59:59Z"), "2026-07-20");
  assert.throws(() => cutoffDay("not-a-date"));
});

test("archiveMaxTime finds the lexicographically-max timestamp", async () => {
  const d = mkdtempSync(join(tmpdir(), "dune-"));
  const p = join(d, "base.csv");
  writeFileSync(p, "from_address,to_address,block_timestamp,value\n0xa,0xb,2026-07-18 10:00:00.000 UTC,1\n0xb,0xc,2026-07-20 08:00:00.000 UTC,2\n0xc,0xd,2026-07-19 09:00:00.000 UTC,3\n");
  assert.equal(await archiveMaxTime(p), "2026-07-20 08:00:00.000 UTC");
});

test("archiveMaxTime rejects an empty archive (must seed first)", async () => {
  const d = mkdtempSync(join(tmpdir(), "dune-"));
  const p = join(d, "empty.csv");
  writeFileSync(p, "from_address,to_address,block_timestamp,value\n");
  await assert.rejects(() => archiveMaxTime(p), /SEED it first/);
});

test("mergeArchive replaces the boundary day, keeps the past, adds the delta — canonical, no dupes", async () => {
  const d = mkdtempSync(join(tmpdir(), "dune-"));
  const base = join(d, "base.csv"), out = join(d, "merged.csv");
  // 2 rows before cutoff, 2 on the cutoff day (07-20)
  writeFileSync(base, [
    "from_address,to_address,block_timestamp,value",
    "0xaaa,0xbbb,2026-07-18 10:00:00.000 UTC,100",
    "0xbbb,0xccc,2026-07-19 09:00:00.000 UTC,50",
    "0xccc,0xddd,2026-07-20 08:00:00.000 UTC,25",
    "0xddd,0xeee,2026-07-20 20:00:00.000 UTC,10",
  ].join("\n") + "\n");
  // delta (Dune columns): re-pulls the 2 boundary rows + 2 genuinely new ones
  const delta = [
    "sender,receiver,time,value",
    "0xccc,0xddd,2026-07-20 08:00:00.000 UTC,25",
    "0xddd,0xeee,2026-07-20 20:00:00.000 UTC,10",
    "0xeee,0xfff,2026-07-21 11:00:00.000 UTC,7",
    "0xfff,0xggg,2026-07-22 06:00:00.000 UTC,3",
  ].join("\n") + "\n";
  const stats = await mergeArchive(base, delta, "2026-07-20", out);
  assert.deepEqual(stats, { kept: 2, dropped: 2, added: 4 });
  const lines = readFileSync(out, "utf8").trim().split("\n");
  assert.equal(lines[0], "sender,receiver,time,value");          // canonical header
  assert.equal(lines.length, 7);                                 // header + 6 rows, no dupes
  assert.equal(lines[1], "0xaaa,0xbbb,2026-07-18 10:00:00.000 UTC,100"); // past kept
  assert.equal(lines.at(-1), "0xfff,0xggg,2026-07-22 06:00:00.000 UTC,3"); // newest added
});
