// AEON CITY / WHALE CITY — wallets laid out on the real Manhattan.
//
// WHAT IS REAL AND WHAT IS PLAY. The building is data: its size is the wallet's holding, its glow
// is that wallet's recent buying or selling. The ADDRESS is a game — the neighbourhood comes from
// the wallet's own hash, so a wallet always lands on the same lot and can be looked up, but it
// says nothing about where anyone actually is. Fun on top, never a claim the data can't make.
//
// The island itself is REAL: src/nyc-geo.js is a one-time bake of OpenStreetMap's coastline
// (© OpenStreetMap contributors, ODbL), so the shape, the tilt, Central Park and the surrounding
// boroughs are true geometry rather than a sketch — with no map dependency, key or per-load cost.
import { NYC } from "./nyc-geo.js";

const MANHATTAN = NYC.manhattan[0];

// ── island axis ───────────────────────────────────────────────────────────────────────────────
// Manhattan runs about 29° off north, and that tilt is most of what makes it recognisable. Rather
// than straighten it, everything downstream works in AXIS space: `t` runs 0 (Battery) → 1 (Inwood)
// along the island's length, `u` runs across its width. Neighbourhoods are bands of `t`.
const AXIS = (() => {
  let cx = 0, cz = 0;
  for (const [x, z] of MANHATTAN) { cx += x; cz += z; }
  cx /= MANHATTAN.length; cz /= MANHATTAN.length;
  // principal axis via the covariance of the outline
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of MANHATTAN) { const dx = x - cx, dz = z - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ax = Math.cos(theta), az = Math.sin(theta);
  // orient south → north
  if (az < 0) { ax = -ax; az = -az; }
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of MANHATTAN) { const p = (x - cx) * ax + (z - cz) * az; if (p < lo) lo = p; if (p > hi) hi = p; }
  return { cx, cz, ax, az, lo, hi, len: hi - lo };
})();

export const CITY_LENGTH = AXIS.len;
export const toAxis = (x, z) => {
  const dx = x - AXIS.cx, dz = z - AXIS.cz;
  return { t: ((dx * AXIS.ax + dz * AXIS.az) - AXIS.lo) / AXIS.len, u: -dx * AXIS.az + dz * AXIS.ax };
};
export const fromAxis = (t, u) => {
  const p = AXIS.lo + t * AXIS.len;
  return { x: AXIS.cx + p * AXIS.ax - u * AXIS.az, z: AXIS.cz + p * AXIS.az + u * AXIS.ax };
};

// ── geometry helpers ──────────────────────────────────────────────────────────────────────────
export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
const inManhattan = (x, z) => pointInRing(x, z, MANHATTAN);
const PARK_RING = NYC.centralpark?.[0];
const inPark = (x, z) => (PARK_RING ? pointInRing(x, z, PARK_RING) : false);

// ── neighbourhoods ────────────────────────────────────────────────────────────────────────────
// Bands along the island axis, with a POPULATION WEIGHT. Weighting matters: an even spread put as
// many buildings in Inwood as in Midtown, which is why the city read as detached clusters rather
// than a place. These roughly track where density and towers actually are.
export const NEIGHBOURHOODS = [
  { id: "fidi", name: "Financial District", t0: 0.00, t1: 0.075, weight: 10, towers: true },
  { id: "tribeca", name: "Tribeca & SoHo", t0: 0.075, t1: 0.14, weight: 8 },
  { id: "village", name: "Greenwich Village", t0: 0.14, t1: 0.20, weight: 9 },
  { id: "chelsea", name: "Chelsea & Flatiron", t0: 0.20, t1: 0.26, weight: 9 },
  { id: "midtown", name: "Midtown", t0: 0.26, t1: 0.40, weight: 18, towers: true },
  { id: "ues", name: "Upper East Side", t0: 0.40, t1: 0.58, weight: 13, side: "east" },
  { id: "uws", name: "Upper West Side", t0: 0.40, t1: 0.58, weight: 11, side: "west" },
  { id: "harlem", name: "Harlem", t0: 0.58, t1: 0.75, weight: 10 },
  { id: "heights", name: "Washington Heights", t0: 0.75, t1: 0.90, weight: 8 },
  { id: "inwood", name: "Inwood", t0: 0.90, t1: 1.00, weight: 4 },
];
export const HOOD_BY_ID = Object.fromEntries(NEIGHBOURHOODS.map(n => [n.id, n]));

// weighted pick from a 0..1 hash
const TOTAL_W = NEIGHBOURHOODS.reduce((s, n) => s + n.weight, 0);
const TOWER_HOODS = NEIGHBOURHOODS.filter(n => n.towers);
const TOWER_W = TOWER_HOODS.reduce((s, n) => s + n.weight, 0);
function weightedPick(list, total, h) {
  let acc = 0;
  for (const n of list) { acc += n.weight / total; if (h <= acc) return n; }
  return list[list.length - 1];
}

// deterministic 0..1 from an address — the same wallet always gets the same home
export const hash01 = s => {
  let h = 2166136261;
  const str = String(s || "").toLowerCase();
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};

// Which neighbourhood a wallet lives in — its own hash, weighted by how built-up each district is.
// The biggest holders are drawn from the tower districts, or the skyscrapers scatter into Inwood
// and the skyline stops reading as New York. `bigT` is 0..1, the size rank (1 = biggest).
export function neighbourhoodFor(address, bigT = 0) {
  const h = hash01(address);
  return bigT > 0.9 ? weightedPick(TOWER_HOODS, TOWER_W, h) : weightedPick(NEIGHBOURHOODS, TOTAL_W, h);
}

// ── lots ──────────────────────────────────────────────────────────────────────────────────────
// A street grid in AXIS space, clipped to the real coastline (and to Central Park, which is not
// buildable). Avenues run along the island, streets across it — the same way Manhattan is laid out.
const AVENUE = 1.45, STREET = 1.25, SHORE = 1.0;
export function hoodLots(hood, k = 1) {
  const lots = [];
  const t0 = hood.t0, t1 = hood.t1;
  const halfW = 22;                                   // scan wider than the island; clipping trims it
  const dt = STREET / (AXIS.len * k);
  for (let t = t0 + dt * 0.5; t < t1; t += dt) {
    for (let u = -halfW; u <= halfW; u += AVENUE) {
      const { x, z } = fromAxis(t, u / k);             // lots sit on the real island at scale k
      const X = x * k, Z = z * k;
      if (!inManhattan(x, z)) continue;               // test in real coords, place in scaled ones
      if (inPark(x, z)) continue;                     // no building in Central Park
      // keep a margin off the waterfront so buildings don't hang over the edge
      if (!inManhattan(x + SHORE, z) || !inManhattan(x - SHORE, z) ||
          !inManhattan(x, z + SHORE) || !inManhattan(x, z - SHORE)) continue;
      if (hood.side === "east" && u < 0) continue;     // east of the park
      if (hood.side === "west" && u > 0) continue;     // west of the park
      lots.push({ x: X, z: Z });
    }
  }
  return lots;
}

// Scale the whole city to the population so it always looks built-up rather than empty.
export const cityScale = n => Math.min(1, Math.max(0.4, Math.sqrt((n || 1) / 1400)));

// One lot per wallet, never two.
//
// Two behaviours on purpose. Residential districts SCATTER: the address hash picks a lot, and if
// it's taken we step by a large stride co-prime with the lot count instead of +1. Probing by +1
// makes every collision pile onto the next lot, which is what produced solid rectangular blocks
// with dead space between them. A co-prime stride visits the whole neighbourhood, so the same
// number of buildings spreads out like a real residential street instead of clumping.
//
// The TOWER districts do the opposite and cluster on purpose — downtown should read as a dense
// core, so their lots are ordered from the centre of the district outward and filled from the
// middle. That's the "unless it's the financial part" case.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function strideFor(n) {
  if (n < 3) return 1;
  let s = Math.max(2, Math.floor(n * 0.618));      // golden-ratio step spreads probes evenly
  while (gcd(s, n) !== 1) s++;                     // co-prime ⇒ the probe visits every lot
  return s % n || 1;
}

export function placeCity(items, k = 1) {
  const n = items.length;
  const cache = new Map();
  const lotsOf = h => {
    let e = cache.get(h.id);
    if (!e) {
      let lots = hoodLots(h, k);
      if (h.towers && lots.length) {                // downtown: fill from the core outward
        let cx = 0, cz = 0;
        for (const l of lots) { cx += l.x; cz += l.z; }
        cx /= lots.length; cz /= lots.length;
        lots = lots.slice().sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
      }
      e = { lots, used: new Set(), stride: strideFor(lots.length), dense: !!h.towers, next: 0 };
      cache.set(h.id, e);
    }
    return e;
  };
  const free = h => { const e = lotsOf(h); return e.used.size < e.lots.length ? e : null; };

  return items.map((it, i) => {
    const bigT = n > 1 ? 1 - i / (n - 1) : 1;
    let hood = neighbourhoodFor(it.a, bigT);
    let slot = free(hood);
    if (!slot) { const alt = NEIGHBOURHOODS.find(h => free(h)); if (alt) { hood = alt; slot = free(alt); } }
    let lot = null;
    if (slot) {
      const { lots, used, stride, dense } = slot;
      if (dense) {
        while (slot.next < lots.length && used.has(slot.next)) slot.next++;   // pack from the core
        if (slot.next < lots.length) { used.add(slot.next); lot = lots[slot.next]; }
      } else {
        let j = Math.floor(hash01(it.a) * lots.length) % lots.length;
        for (let s = 0; s < lots.length; s++) {
          if (!used.has(j)) { used.add(j); lot = lots[j]; break; }
          j = (j + stride) % lots.length;                                     // scatter, don't clump
        }
      }
    }
    // Genuinely out of room: park it off the east shore rather than stack it on a roof.
    if (!lot) { const p = fromAxis((i % 100) / 100, 26 + (i % 4) * 1.4); lot = { x: p.x * k, z: p.z * k }; }
    return { ...it, hood, x: lot.x, z: lot.z };
  });
}

// "Where do you live?" — answers for ANY address, holder or not: the neighbourhood is a property
// of the address itself, so anyone can find their block.
export function lookupHome(address) {
  const a = String(address || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  const hood = neighbourhoodFor(a, 0);
  const lots = hoodLots(hood, 1);
  const lot = lots.length ? lots[Math.floor(hash01(a) * lots.length) % lots.length] : fromAxis((hood.t0 + hood.t1) / 2, 0);
  return { a, hood, x: lot.x, z: lot.z };
}

// Backdrop geography (scenery only — no wallet is ever placed on it).
export const BACKDROP = [
  { id: "brooklyn", rings: NYC.brooklyn || [] },
  { id: "queens", rings: NYC.queens || [] },
  { id: "bronx", rings: NYC.bronx || [] },
  { id: "jersey", rings: NYC.jersey || [] },
];
export const ISLETS = [{ id: "roosevelt", rings: NYC.roosevelt || [] }];
export const ISLAND_RING = MANHATTAN;
export const PARK_RINGS = PARK_RING ? [PARK_RING] : [];

// Manhattan's street grid, clipped to the coastline — avenues along the island, streets across.
export function streetGrid(k = 1) {
  const segs = [];
  const dt = 2.2 / AXIS.len, halfW = 22;
  for (let t = 0.004; t < 1; t += dt) {                       // cross-streets
    let run = null;
    for (let u = -halfW; u <= halfW; u += 0.4) {
      const { x, z } = fromAxis(t, u);
      const on = inManhattan(x, z) && !inPark(x, z);
      if (on && !run) run = [x * k, z * k];
      else if (!on && run) { segs.push([run[0], run[1], x * k, z * k]); run = null; }
    }
  }
  for (let u = -halfW; u <= halfW; u += 1.9) {                // avenues
    let run = null;
    for (let t = 0; t <= 1; t += 0.004) {
      const { x, z } = fromAxis(t, u);
      const on = inManhattan(x, z) && !inPark(x, z);
      if (on && !run) run = [x * k, z * k];
      else if (!on && run) { segs.push([run[0], run[1], x * k, z * k]); run = null; }
    }
  }
  return segs;
}
