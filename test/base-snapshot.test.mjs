import { test } from "node:test";
import assert from "node:assert/strict";
process.env.BASE_DELAY_MS = "0";   // no sleeps in the test
const { decodeHolders, fetchHolders } = await import("../scripts/build-base-snapshot.mjs");

const raw = n => (BigInt(n) * 100000000n).toString();   // human → raw 8-decimal string (Blockscout `value`)

test("decodeHolders: keeps ≥threshold, stops at the first sub-bar holder (sorted DESC)", () => {
  const items = [
    { value: raw(9000), address: { hash: "0xAA" } },
    { value: raw(5000), address: { hash: "0xBB" } },   // exactly at the bar → kept
    { value: raw(4999), address: { hash: "0xCC" } },   // below → stop here, nothing after counts
    { value: raw(8000), address: { hash: "0xDD" } },
  ];
  const { rows, below } = decodeHolders(items, 5000);
  assert.deepEqual(rows, [{ owner: "0xaa", bal: 9000 }, { owner: "0xbb", bal: 5000 }]);
  assert.equal(below, true);
});

test("decodeHolders: tolerates address as a bare string", () => {
  const { rows } = decodeHolders([{ value: raw(6000), address: "0xEE" }], 5000);
  assert.deepEqual(rows, [{ owner: "0xee", bal: 6000 }]);
});

test("fetchHolders: pages via next_page_params until a page drops below the bar", async () => {
  const pages = [
    { items: [{ value: raw(9000), address: { hash: "0x01" } }, { value: raw(6000), address: { hash: "0x02" } }], next_page_params: { fiat_value: null, id: 2 } },
    { items: [{ value: raw(5000), address: { hash: "0x03" } }, { value: raw(4000), address: { hash: "0x04" } }], next_page_params: { id: 3 } }, // 4k ends it
    { items: [{ value: raw(3000), address: { hash: "0x05" } }] },  // must never be reached
  ];
  let call = 0;
  const fetchImpl = async () => ({ status: 200, json: async () => pages[call++] });
  const rows = await fetchHolders({ fetchImpl, threshold: 5000 });
  assert.deepEqual(rows.map(r => r.owner), ["0x01", "0x02", "0x03"]);  // 0x04 (below) and page 3 excluded
  assert.equal(call, 2);                                              // stopped after page 2
});
