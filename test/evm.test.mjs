import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, toHex, hashOf, selectorOf, encodePost, decodeNoteData, topicAddress, NOTE_TOPIC } from "../src/evm.js";

// A hand-rolled hash is only trustworthy against published vectors — everything downstream (the
// function selector, the event topic) is wrong in a way that LOOKS fine if this is off by a byte.
const hex = s => toHex(keccak256(new TextEncoder().encode(s)));

test("keccak256 matches the published vectors", () => {
  assert.equal(hex(""), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(hex("abc"), "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  assert.equal(hex("The quick brown fox jumps over the lazy dog"),
    "0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15");
});

test("keccak256 handles inputs that straddle the 136-byte rate", () => {
  // one byte short of the rate, exactly the rate, and one over — the padding edge cases
  for (const n of [135, 136, 137, 272]) {
    const h = hex("a".repeat(n));
    assert.match(h, /^0x[0-9a-f]{64}$/);
  }
  // exactly one block must still differ from one block + 1 byte
  assert.notEqual(hex("a".repeat(136)), hex("a".repeat(137)));
});

test("known Ethereum selectors derive correctly", () => {
  // transfer(address,uint256) is the most-quoted selector in Ethereum — a free cross-check
  assert.equal(selectorOf("transfer(address,uint256)"), "0xa9059cbb");
  assert.equal(hashOf("Transfer(address,address,uint256)"),
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
});

test("encodePost round-trips through the event decoder", () => {
  // The contract emits exactly the arguments it was called with, so encoding the call and decoding
  // it as event data is a genuine round-trip of both halves.
  const call = encodePost("aeon", "gm from midtown");
  assert.ok(call.startsWith(selectorOf("post(string,string)")));
  const decoded = decodeNoteData("0x" + call.slice(10));
  assert.deepEqual(decoded, { city: "aeon", text: "gm from midtown" });
});

test("encodePost survives multi-byte characters and word boundaries", () => {
  for (const text of ["🏙 gm", "a".repeat(32), "a".repeat(31), "a".repeat(33), "héllo wörld", ""]) {
    const decoded = decodeNoteData("0x" + encodePost("whale", text).slice(10));
    assert.deepEqual(decoded, { city: "whale", text }, `round-trip failed for ${JSON.stringify(text)}`);
  }
});

test("topicAddress pulls the sender out of an indexed topic", () => {
  assert.equal(topicAddress("0x000000000000000000000000A4C34D74A2D79BE8FE9A5FC601D106D52E815C9F"),
    "0xa4c34d74a2d79be8fe9a5fc601d106d52e815c9f");
});

test("the Note topic is stable", () => {
  // Pinned so a careless signature edit (renaming an arg type) can't silently orphan every note
  // already written to the chain — the topic is what we filter logs on.
  assert.equal(NOTE_TOPIC, hashOf("Note(address,string,string)"));
  assert.match(NOTE_TOPIC, /^0x[0-9a-f]{64}$/);
});
