import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeCity, hoodLots, NEIGHBOURHOODS, cityScale,
         streetGrid, avenueMedians, crosswalks, parkFeatures, waterfrontPiers, pointInRing, ROAD_W, GRID } from "../src/city-map.js";
import { bridgeSpan } from "../src/city-infra.js";
import { NYC } from "../src/nyc-geo.js";

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

// ── the roads ────────────────────────────────────────────────────────────────────────────────
// Avenues and streets are drawn as real ribbons of asphalt now, not hairlines, so their WIDTH has
// consequences: a ribbon wider than the gap the lot grid left runs underneath the buildings either
// side. That is the original "streets painted under the towers" bug, and it is invisible from any
// angle a person is likely to look from — the tarmac just quietly disappears beneath a block.
test("a road never spills out of the gap the buildings left it", () => {
  assert.ok(ROAD_W.avenue < GRID.avenue, "avenue ribbon must fit its gap");
  assert.ok(ROAD_W.street < GRID.street, "street ribbon must fit its gap");
  // And leave a real kerb rather than filling the gap to the last millimetre.
  assert.ok(GRID.avenue - ROAD_W.avenue > 0.3, "avenue needs a visible kerb either side");
  assert.ok(GRID.street - ROAD_W.street > 0.2, "street needs a visible kerb either side");
  // The avenues are the corridors that carry the island; they must read as the major road.
  assert.ok(ROAD_W.avenue > ROAD_W.street * 1.5, "avenues must be clearly wider than cross-streets");
});

test("the grid tags avenues and streets, and only every third avenue is grand", () => {
  const segs = streetGrid(cityScale(1200));
  const aves = segs.filter(s => s.kind === "avenue");
  const sts = segs.filter(s => s.kind === "street");
  assert.ok(aves.length > 0 && sts.length > 0, "both kinds are drawn");
  assert.equal(segs.length, aves.length + sts.length, "every segment is tagged");
  assert.ok(sts.every(s => !s.major), "cross-streets are never grand");
  // Grand avenues are a minority — they carry a median, so if this ever became most of them the
  // island would read as parkland rather than as a city.
  const grand = new Set(aves.filter(s => s.major).map(s => Math.round(s.x1 * 100)));
  assert.ok(grand.size > 0, "some avenues are grand");
  assert.ok(aves.filter(s => s.major).length < aves.length / 2, "grand avenues stay a minority");
});

test("avenue medians break at the cross-streets and stay on the island", () => {
  const k = cityScale(1200);
  const med = avenueMedians(k);
  assert.ok(med.length > 0, "grand avenues carry medians");
  // Each planter is one BLOCK long — never the whole avenue. A median drawn as one unbroken ribbon
  // read as a corridor of parkland joined onto Central Park, which is what this guards.
  const blockLen = GRID.blkT * GRID.lotT;
  for (const m of med) {
    const L = Math.hypot(m.x2 - m.x1, m.z2 - m.z1);
    assert.ok(L > 0 && L < blockLen * 1.5,
      `median ${L.toFixed(2)} should be about one block (${blockLen.toFixed(2)}), not a whole avenue`);
  }
});

test("Central Park's interior features all sit inside the park", () => {
  // The reservoir, lawns, lake and transverse roads are placed from the park's axis-space bounding
  // box, which is not a perfect rectangle — the park is a 9-point polygon. So the real guard is that
  // nothing pokes out of the actual green into the surrounding blocks, at any point of any ring.
  const f = parkFeatures();
  assert.ok(f.water.length >= 3 && f.lawn.length >= 2 && f.roads.length === 4, "the expected feature set is built");
  const ring = NYC.centralpark[0];
  const inside = (x, z) => pointInRing(x, z, ring);
  for (const [kind, sets] of [["water", f.water], ["lawn", f.lawn], ["roads", f.roads]])
    for (const r of sets)
      for (const [x, z] of r)
        assert.ok(inside(x, z), `${kind} point (${x.toFixed(2)}, ${z.toFixed(2)}) escaped the park`);
});

test("every waterfront pier reaches into open water, not onto land", () => {
  const R = NYC.manhattan[0];
  const boroughs = [NYC.brooklyn, NYC.queens, NYC.bronx, NYC.jersey].map(b => b[0]);
  const inWater = (x, z) => !pointInRing(x, z, R) && !boroughs.some(b => pointInRing(x, z, b));
  const piers = waterfrontPiers();
  assert.ok(piers.length > 20, "both river shores grow piers");
  for (const ring of piers) {
    // the outer (tip) edge midpoint — the far end that the inWater guard is supposed to protect
    const [p1, p2, p3, p4] = ring;
    const tx = (p3[0] + p4[0]) / 2, tz = (p3[1] + p4[1]) / 2;
    assert.ok(inWater(tx, tz), `pier tip (${tx.toFixed(1)}, ${tz.toFixed(1)}) landed on land`);
  }
});

test("crosswalks land on the roadway — on the island, never in the park", () => {
  const R = NYC.manhattan[0], park = NYC.centralpark[0];
  const walks = crosswalks(1);
  assert.ok(walks.length > 40, "the grid has crossings");
  for (const w of walks) {
    const mx = (w.x1 + w.x2) / 2, mz = (w.z1 + w.z2) / 2;
    assert.ok(pointInRing(mx, mz, R), "crosswalk is on the island");
    assert.ok(!pointInRing(mx, mz, park), "crosswalk is not inside the park");
  }
});
