import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { infraFrom, portBerths, siteAt, bridgeSpan, SITES, FALLBACK } from "../src/city-infra.js";

// The harbour is the quarter of the supply that the holder map can never show — exchanges, the
// bridge, the pool and the burn. These check that it reads the REAL numbers and degrades honestly
// when a field the pipeline hasn't emitted yet is missing.

const row = JSON.parse(readFileSync("public/onchain.json", "utf8")).at(-1);

test("infraFrom reads the live venue split", () => {
  const I = infraFrom(row);
  assert.ok(I.venues.length >= 10, "expected the tagged exchange venues");
  // sorted biggest first, which is what puts the largest warehouse at the head of the port
  for (let i = 1; i < I.venues.length; i++) assert.ok(I.venues[i - 1].tokens >= I.venues[i].tokens);
  // Kraken dominating is the actual finding this district exists to show
  assert.equal(I.venues[0].name, "Kraken");
  assert.ok(I.venues[0].tokens / I.cex > 0.35, "Kraken should be over a third of exchange supply");
  // and the two giants holding almost nothing is the counterintuitive half of it
  const byName = Object.fromEntries(I.venues.map(v => [v.name, v.tokens]));
  assert.ok(byName.Binance < 2e6 && byName.Coinbase < 2e6);
});

test("venue shares sum to the exchange total", () => {
  const I = infraFrom(row);
  const sum = I.venues.reduce((s, v) => s + v.tokens, 0);
  assert.ok(Math.abs(sum - I.cex) < 1, "cex total must be the sum of its venues, not a second source");
});

test("bridge and burn fall back to the documented constants until the engine emits them", () => {
  const I = infraFrom({ cexVenues: {}, lpBal: 1 });
  assert.equal(I.bridge, FALLBACK.bridge);
  assert.equal(I.burn, FALLBACK.burn);
  assert.deepEqual(I.estimated, ["bridge", "burn"]);
});

test("emitted values win over the fallbacks, and are then not flagged as estimated", () => {
  const I = infraFrom({ ...row, bridgeBal: 111_000_000, burnBal: 69_010_000 });
  assert.equal(I.bridge, 111_000_000);
  assert.deepEqual(I.estimated, []);
});

test("infraFrom survives a missing row rather than throwing", () => {
  const I = infraFrom(null);
  assert.deepEqual(I.venues, []);
  assert.equal(I.cex, 0);
  assert.equal(I.burn, FALLBACK.burn);
});

test("berth size is driven by share, so the biggest venue gets the biggest warehouse", () => {
  const berths = portBerths(infraFrom(row).venues, 1);
  assert.equal(berths.length, infraFrom(row).venues.length);
  assert.ok(berths[0].len > berths.at(-1).len);
  const shares = berths.reduce((s, b) => s + b.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9, "shares must partition the exchange supply");
  for (const b of berths) assert.ok(b.len > 0 && b.wide > 0 && b.tall > 0, "no zero-size berth");
});

test("the harbour sits in the harbour", () => {
  // Sanity on the projection: Liberty Island and the port are SOUTH of Manhattan's south tip
  // (z < -83 in world units) and WEST of the East River. A sign error here would put the statue
  // in the Bronx, which is the kind of thing that is obvious in a render and invisible in a diff.
  const mon = siteAt(SITES.monument, 1), lp = siteAt(SITES.lp, 1);
  assert.ok(mon.z < -83, "monument must be south of the island");
  assert.ok(mon.x < lp.x, "Liberty Island is west of Governors Island");
  const span = bridgeSpan(1);
  assert.ok(span.bx > span.ax, "the bridge runs west→east, Manhattan to Brooklyn");
  assert.ok(Math.hypot(span.bx - span.ax, span.bz - span.az) > 5, "and actually spans something");
});
