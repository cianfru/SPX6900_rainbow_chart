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
// ⭐ ONE GRID DRIVES BOTH THE LOTS AND THE STREETS. They used to be independent: lots were a solid
// lattice with no gaps at 1.45 x 1.25, while the painted street lines were drawn on unrelated
// 1.9 x 2.2 spacing. So buildings abutted each other in an unbroken carpet AND the streets ran
// underneath them — the city had no blocks and no avenues, just a field of towers with decorative
// lines painted under it.
//
// Now lots are grouped into BLOCKS with real gaps between them, and streetGrid draws down the
// middle of those gaps, so the corridors you see are the corridors the buildings left.
//
// The proportions are Manhattan's: blocks are LONG across the island (avenue to avenue, ~274 m in
// reality) and SHORT along it (street to street, ~80 m). Buildings nearly touch inside a block —
// which is correct, that's a city block — and the space is all in the streets between them.
export const GRID = {
  lotU: 1.15,      // lot width across the island
  lotT: 1.15,      // lot depth along the island
  blkU: 5,         // lots per block across — the long side
  blkT: 2,         // lots per block along — the short side
  street: 1.20,    // gap between blocks along the island
  avenue: 2.10,    // gap between block columns — wider, these are the avenues
};
const PERIOD_U = GRID.blkU * GRID.lotU + GRID.avenue;
const PERIOD_T = GRID.blkT * GRID.lotT + GRID.street;
const SHORE = 1.0;

// Block columns are indexed from the island's centre line, so every district lands on the SAME
// grid. Letting each neighbourhood start its own lattice made the avenues jog at every boundary.
const COLS = Math.ceil(24 / PERIOD_U);

// The grid, as both the lots buildings stand on AND the block slabs they stand on top of. The
// pavement is per BLOCK, never per building: one tile each would need roughly double the pitch in
// both axes to fit a road around it, which is a quarter of the capacity and turns Manhattan into an
// office park. Buildings share a block the way they share a street — the road is the gap BETWEEN
// blocks, which the grid already leaves.
export function hoodGrid(hood, k = 1) {
  const lots = [], blocks = [];
  const perT = PERIOD_T / (AXIS.len * k);          // one block row, in t units
  const lotT = GRID.lotT / (AXIS.len * k);
  const first = Math.ceil(hood.t0 / perT);         // snap to the global row grid
  for (let bi = first; bi * perT < hood.t1; bi++) {
    // One slab per block, emitted only where the block actually has buildable land — otherwise
    // pavement juts out over the river wherever a block is clipped by the coastline.
    for (let bu = -COLS; bu <= COLS; bu++) {
      const tMid = bi * perT + (GRID.blkT / 2) * lotT;
      const uMid = bu * PERIOD_U;
      if (tMid >= hood.t1) continue;
      if (hood.side === "east" && uMid < 0) continue;
      if (hood.side === "west" && uMid > 0) continue;
      const c = fromAxis(tMid, uMid / k);
      if (!inManhattan(c.x, c.z) || inPark(c.x, c.z)) continue;
      blocks.push({ x: c.x * k, z: c.z * k, w: GRID.blkU * GRID.lotU, d: GRID.blkT * GRID.lotT });
    }
    for (let li = 0; li < GRID.blkT; li++) {
      const t = bi * perT + (li + 0.5) * lotT;
      if (t >= hood.t1) break;
      for (let bu = -COLS; bu <= COLS; bu++) {
        for (let lu = 0; lu < GRID.blkU; lu++) {
          const u = bu * PERIOD_U + (lu + 0.5 - GRID.blkU / 2) * GRID.lotU;
          const { x, z } = fromAxis(t, u / k);     // lots sit on the real island at scale k
          if (!inManhattan(x, z) || inPark(x, z)) continue;
          // keep a margin off the waterfront so buildings don't hang over the edge
          if (!inManhattan(x + SHORE, z) || !inManhattan(x - SHORE, z) ||
              !inManhattan(x, z + SHORE) || !inManhattan(x, z - SHORE)) continue;
          if (hood.side === "east" && u < 0) continue;
          if (hood.side === "west" && u > 0) continue;
          lots.push({ x: x * k, z: z * k });
        }
      }
    }
  }
  return { lots, blocks };
}

// Lots only — the shape every existing caller expects.
export function hoodLots(hood, k = 1) { return hoodGrid(hood, k).lots; }

// The whole grid is rotated to the island's true tilt, so slabs need the same angle.
export const AXIS_ANGLE = Math.atan2(AXIS.az, AXIS.ax);

// Scale the whole city to the population so it always looks built-up rather than empty. The
// divisor is tuned so blocks come out ~85% FULL. Two failures either side of that: too sparse and
// each block holds three buildings in a big empty rectangle, which reads as suburbia; too tight and
// the placer runs out of island. Manhattan blocks are solid — the space in a real city is in the
// streets between blocks, not inside them, which is why the grid gaps do this job now instead.
export const cityScale = n => Math.min(1, Math.max(0.4, Math.sqrt((n || 1) / 1450)));

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
        // ⚠ THE LOT HASH MUST BE INDEPENDENT OF THE NEIGHBOURHOOD HASH. Using hash01(it.a) for both
        // is what caused the visible clumping: neighbourhoods are picked by comparing that hash
        // against cumulative weights, so every wallet in Midtown had a hash inside Midtown's slice
        // (~0.36-0.54), and feeding the same number back in as a lot index put them all in the same
        // ~18% strip of a row-major lot list. Whole districts piled into one band with dead space
        // either side. A salted second hash is uniform over 0..1 whichever district you landed in.
        let j = Math.floor(hash01(it.a + "|lot") * lots.length) % lots.length;
        for (let s = 0; s < lots.length; s++) {
          if (!used.has(j)) { used.add(j); lot = lots[j]; break; }
          j = (j + stride) % lots.length;                                     // scatter, don't clump
        }
      }
    }
    // Genuinely out of room: park it off the east shore rather than stack it on a roof.
    if (!lot) { const p = fromAxis((i % 100) / 100, 26 + (i % 4) * 1.4); lot = { x: p.x * k, z: p.z * k }; }
    // A whisper of setback variation. Manhattan IS a grid, so this stays small — enough that the
    // blocks don't read as a printed lattice, far short of letting two buildings touch (lots are
    // 1.45 x 1.25 apart and the widest footprint is ~1.08).
    const jx = (hash01(it.a + "|jx") - 0.5) * 0.16, jz = (hash01(it.a + "|jz") - 0.5) * 0.11;
    return { ...it, hood, x: lot.x + jx, z: lot.z + jz };
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

// ── open water ────────────────────────────────────────────────────────────────────────────────
// ⚠ THE BOROUGH OUTLINES ARE ADMINISTRATIVE BOUNDARIES, NOT COASTLINES. In New York those run out
// into open water by definition — Brooklyn's county line crosses the middle of the Upper Bay — so
// drawing them as land pours concrete over the harbour and the island ends up sitting in a puddle
// with a thin moat around it. This is the SAME trap already documented for Manhattan, where the
// admin relation was swapped for the natural "Manhattan Island" feature; the boroughs were never
// re-fetched.
//
// The proper fix is to re-fetch each borough's natural coastline. Overpass is unreachable from the
// build sandbox (the network policy 504s it), so instead of inventing shorelines we paint the KNOWN
// water bodies back on TOP of the boroughs, traced from real coordinates. Honest scope: these are
// hand-entered and are SCENERY ONLY — no wallet is ever placed on or near them, and nothing is
// measured from them. 🔲 Replace with real coastlines when OSM is reachable.
//
// ONLY the harbour is patched, deliberately. A first pass also blocked in the Lower Bay and Jamaica
// Bay as rectangles, and they rendered as exactly that — hard straight edges across the sea, which
// looked more wrong than the error they were fixing. The harbour survives because it is traced
// along real shorelines on both banks and lands where the eye already expects water. Distance haze
// handles everything further out, which is honest: it hides the far geography rather than
// inventing it.
//
// Projection matches nyc-geo.js exactly: equirectangular about (40.7808, -73.9665), 1 unit = 100 m.
const LAT0 = 40.7808, LON0 = -73.9665, M = 1113.2, LONS = Math.cos(LAT0 * Math.PI / 180) * M;
const ll = ([lat, lon]) => [(lon - LON0) * LONS, (lat - LAT0) * M];
// Exported so the infrastructure layer can place things at their REAL coordinates too.
export const fromLatLon = (lat, lon) => { const [x, z] = ll([lat, lon]); return { x, z }; };

export const WATER = [
  {
    id: "harbour", name: "The Hudson, the Upper Bay and the East River",
    // Traced along the REAL shorelines on either side — the New Jersey waterfront from Weehawken
    // down past Liberty State Park and Bayonne, across the Narrows, then back up Brooklyn's
    // waterfront through Red Hook and DUMBO to Long Island City. Everything between is water that
    // the borough boundaries claim as land.
    //
    // It deliberately runs UNDER Manhattan: the island is drawn after the water, so overlapping is
    // free and the alternative — trying to trace the harbour's northern edge along the island's own
    // coastline by hand — would introduce a seam that has to be maintained.
    ring: [
      [40.7520, -74.0270], [40.7520, -73.9560], [40.7350, -73.9590], [40.7200, -73.9670],
      [40.7030, -73.9880], [40.6980, -73.9985], [40.6760, -74.0170], [40.6540, -74.0190],
      [40.6330, -74.0270], [40.6050, -74.0330], [40.6080, -74.0580], [40.6420, -74.0760],
      [40.6680, -74.0740], [40.6900, -74.0500], [40.7150, -74.0370], [40.7400, -74.0290],
    ].map(ll),
  },
];

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
  const halfW = 24;
  const perT = PERIOD_T / (AXIS.len * k);
  const lotT = GRID.lotT / (AXIS.len * k);
  const gapT = (GRID.street / 2) / (AXIS.len * k);
  // Trace a line only where it is actually on the island, so streets stop at the water rather than
  // running out over it.
  const trace = (pt, steps, step) => {
    let run = null;
    for (let i = 0; i <= steps; i++) {
      const { x, z } = pt(i * step);
      const on = inManhattan(x, z) && !inPark(x, z);
      if (on && !run) run = [x * k, z * k];
      else if (!on && run) { segs.push([run[0], run[1], x * k, z * k]); run = null; }
    }
    if (run) { const { x, z } = pt(steps * step); segs.push([run[0], run[1], x * k, z * k]); }
  };
  // cross-streets: down the middle of the gap between block rows
  for (let bi = 0; bi * perT < 1; bi++) {
    const t = bi * perT + GRID.blkT * lotT + gapT;
    if (t >= 1) break;
    trace(u => fromAxis(t, (u - halfW) / k), 120, halfW * 2 / 120);
  }
  // avenues: down the middle of the gap between block columns
  for (let bu = -COLS; bu < COLS; bu++) {
    const u = (bu + 0.5) * PERIOD_U;
    trace(t => fromAxis(t, u / k), 260, 1 / 260);
  }
  return segs;
}

