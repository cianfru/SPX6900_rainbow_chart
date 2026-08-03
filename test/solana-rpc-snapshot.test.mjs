import { test } from "node:test";
import assert from "node:assert/strict";
import { b58encode, b58decode, sumByOwner, snapshotRows } from "../scripts/build-solana-rpc-snapshot.mjs";

// The one absolute anchor: 32 zero bytes → 32 '1' chars (canonical base58).
test("b58encode: 32 zero bytes → 32 ones (the default pubkey)", () => {
  assert.equal(b58encode(new Uint8Array(32)), "1".repeat(32));
});

// Real Solana addresses are 32-byte pubkeys; decode must yield exactly 32 bytes, and encode must
// be its exact inverse — so a wallet keeps ONE identity across the Dune base and the RPC forward rows.
test("b58 round-trips real Solana addresses (32-byte pubkeys)", () => {
  const addrs = [
    "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr",       // the SPX mint
    "5c63Gxh63u1BXC7xtjmZT9CrEWLohnvCFzdAAuaj77NZ",       // a real ≥5k resident
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",       // Raydium (an excluded infra owner)
  ];
  for (const a of addrs) {
    const bytes = b58decode(a);
    assert.equal(bytes.length, 32, `${a} should decode to 32 bytes`);
    assert.equal(b58encode(bytes), a, `${a} must round-trip`);
  }
});

// getProgramAccounts (dataSlice 32,40) decode: owner bytes + u64 amount → summed human balance.
test("sumByOwner: decodes owner+u64 and sums an owner's token accounts", () => {
  const owner = "5c63Gxh63u1BXC7xtjmZT9CrEWLohnvCFzdAAuaj77NZ";
  const mk = (ownerB58, human) => {
    const buf = Buffer.alloc(40);
    Buffer.from(b58decode(ownerB58)).copy(buf, 0);          // owner at data offset 0
    buf.writeBigUInt64LE(BigInt(Math.round(human * 1e8)), 32); // amount (raw, 8 decimals) at offset 32
    return { account: { data: [buf.toString("base64"), "base64"] } };
  };
  const other = "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr";
  const m = sumByOwner([mk(owner, 6000), mk(owner, 4000), mk(other, 12345)]);
  assert.equal(Math.round(m.get(owner)), 10000);            // two accounts summed
  assert.equal(Math.round(m.get(other)), 12345);
});

test("snapshotRows: keeps only ≥threshold, largest first, as owner,balance,day", () => {
  const m = new Map([["AAA", 9000], ["BBB", 4999], ["CCC", 20000]]);
  const rows = snapshotRows(m, "2026-08-04", 5000);
  assert.deepEqual(rows, ["CCC,20000.00,2026-08-04", "AAA,9000.00,2026-08-04"]); // BBB dropped, sorted desc
});
