import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeCity, hoodLots, NEIGHBOURHOODS, cityScale } from "../src/city-map.js";
import { bridgeSpan } from "../src/city-infra.js";

// Placement is the half of the city that is openly a game — a wallet's street address comes from
// its own hash, and the page says so. That freedom is exactly why it needs guarding: nothing about
// the DATA will complain if two buildings end up inside each other, so only a test will.

const residents = () => {
  const W = JSON.parse(readFileSync("public/whales.json", "utf8")).wallets;
  const mB = Math.max(...W.map(w => w.bal)), mD = Math.max(...W.map(w => w.days || 0));
  return W.map(w => ({ a: w.a, score: (w.bal / mB) * (0.45 + 0.55 * ((w.days || 0) / mD)) }))
          .sort((a, b) => b.score - a.score);
};
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test("no two districts hand out the same lot", () => {
  // The Upper East and Upper West Sides share a t-band, split east/west of the centre line. The
  // tests were `u < 0` and `u > 0`, so the lot sitting exactly ON the line passed both and was
  // issued twice — two wallets in the identical spot, drawn as one fused building.
  const key = l => `${l.x.toFixed(3)},${l.z.toFixed(3)}`;
  const seen = new Map();
  for (const h of NEIGHBOURHOODS) {
    for (const l of hoodLots(h, 1)) {
      const k = key(l);
      assert.ok(!seen.has(k), `${h.id} and ${seen.get(k)} both claim the lot at ${k}`);
      seen.set(k, h.id);
    }
  }
});

test("no two buildings stand in the same place", () => {
  const P = placeCity(residents(), 1);
  // Sorted sweep by x, so this stays linear rather than 24 million pair comparisons.
  const S = P.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < S.length; i++) {
    for (let j = i + 1; j < S.length && S[j].x - S[i].x < 0.5; j++) {
      assert.ok(near(S[i], S[j]) > 0.5, `two buildings ${near(S[i], S[j]).toFixed(3)} apart`);
    }
  }
});

test("the landmark towers keep real distance from each other", () => {
  // The failure this exists for: dense districts fill from the core outward in conviction order, so
  // ranks 1,2,3… took adjacent innermost lots and the tallest buildings in the city merged into one
  // slab. Thresholds sit below what clearanceFor asks for, because a full district legitimately
  // falls back to the nearest free lot rather than leaving a wallet homeless.
  const P = placeCity(residents(), 1);
  const minSep = n => {
    let m = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m = Math.min(m, near(P[i], P[j]));
    return m;
  };
  assert.ok(minSep(8) > 4.0, `top 8 towers only ${minSep(8).toFixed(2)} apart`);
  assert.ok(minSep(40) > 2.5, `top 40 towers only ${minSep(40).toFixed(2)} apart`);
});

test("the big holders spread across more than one district", () => {
  // A single tower district is what produced the wall. The Central Park frontage is tower-eligible
  // so the overflow scatters along the park instead of piling into whichever district is emptiest.
  const P = placeCity(residents(), 1);
  const hoods = new Set(P.slice(0, 120).map(p => p.hood?.id || p.hood));
  assert.ok(hoods.size >= 3, `top 120 towers landed in only ${hoods.size} district(s)`);
});

test("nothing is built under the bridge or its ramps", () => {
  // The roadway used to drive straight into a building. Manhattan's grid and the borough grid are
  // built separately, and only the island's was cleared — so the BROOKLYN abutment kept its
  // building. Both shores are checked here for that reason.
  const P = placeCity(residents(), 1);
  const s = bridgeSpan(1);
  const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz, len = Math.sqrt(L2);
  for (const p of P) {
    const t = ((p.x - s.ax) * dx + (p.z - s.az) * dz) / L2;
    if (t < -3 / len || t > 1 + 3 / len) continue;          // clear of the span and its approaches
    const c = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (s.ax + dx * c), p.z - (s.az + dz * c));
    assert.ok(d > 1.6, `a building sits ${d.toFixed(2)} from the roadway centre line (${p.hood?.id || p.hood})`);
  }
});

test("every resident gets a home on the map", () => {
  const R = residents(), P = placeCity(R, cityScale(R.length));
  assert.equal(P.length, R.length);
  for (const p of P) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${p.a} has no position`);
  }
});
