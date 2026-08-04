import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateFlow } from "../api/live-flow.js";

test("aggregateFlow nets signed flow per watched wallet and ignores others", () => {
  const A = "0x00000000000000000000000000000000000000aa";
  const B = "0x00000000000000000000000000000000000000bb";
  const OTHER = "0x00000000000000000000000000000000000000cc";
  const watched = new Set([A, B]);
  const transfers = [
    { from: OTHER, to: A, value: 300000 },   // A receives 300k → +300k
    { from: A, to: OTHER, value: 50000 },    // A sends 50k → net A = +250k (accumulating)
    { from: B, to: OTHER, value: 400000 },   // B sends 400k → −400k (distributing)
    { from: OTHER, to: OTHER, value: 999 },  // neither watched → ignored
    { from: A, to: B, value: 100000 },       // A −100k, B +100k
  ];
  const moves = aggregateFlow(transfers, watched);
  const byA = Object.fromEntries(moves.map(m => [m.a, m.net]));
  assert.equal(byA[A], 150000);              // +300k −50k −100k
  assert.equal(byA[B], -300000);             // −400k +100k
  assert.equal(moves.length, 2);
  // sorted by magnitude desc → B (300k) before A (150k)
  assert.equal(moves[0].a, B);
});

test("aggregateFlow drops dust + handles empty", () => {
  const A = "0x00000000000000000000000000000000000000aa";
  const watched = new Set([A]);
  assert.deepEqual(aggregateFlow([], watched), []);
  assert.deepEqual(aggregateFlow([{ from: A, to: "0xz", value: 0.4 }], watched), []); // <1 dust
});
