// AEON CITY / WHALE CITY — a reconstruction of Manhattan that wallets are laid out on.
//
// WHAT IS REAL AND WHAT IS PLAY. The building itself is data: its size is the wallet's holding,
// its glow is that wallet's recent buying or selling. The ADDRESS is a game — a neighbourhood
// derived deterministically from the wallet's own hash, so every wallet always lands on the same
// lot and can be looked up, but it says nothing about where anyone actually is. That framing is
// the whole point: fun on top, never a claim the data can't make.
//
// The island is hand-authored as west/east edges sampled south→north (Battery at z=0, Inwood at
// z≈216, ~1 unit ≈ 100m), which is enough to read as Manhattan without shipping a map dependency,
// an API key, or per-load tile costs.

// west edge, east edge at each z (south → north)
const EDGES = [
  [0, -3.5, 3.5], [6, -6, 5.5], [12, -8.5, 7.5], [20, -10.5, 9], [28, -11.5, 9.5],
  [36, -12, 10.5], [46, -12.5, 11], [56, -13, 11.5], [68, -13.5, 12], [80, -14, 12],
  [92, -13.5, 11.5], [104, -13, 11], [116, -12.5, 10.5], [128, -12, 9.5], [140, -11, 8.5],
  [152, -10, 7], [164, -9, 5.5], [176, -8, 4], [188, -6.5, 2.5], [200, -5, 1],
  [210, -3.5, -0.5], [216, -2.5, -1.5],
];

export const CITY_LENGTH = 216;

// Manhattan at full size swallows a few hundred buildings — the island reads empty. Scale the
// whole coordinate system to the population (lot spacing stays fixed) so the city looks built-up
// whether it's holding 180 whales or 500 holders. Purely cosmetic: it changes nothing about who
// lives where, since the neighbourhood still comes from the address hash.
export const cityScale = n => Math.min(1, Math.max(0.36, Math.sqrt((n || 1) / 900)));

// linear interpolation of the island's width at any z
export function islandEdges(z, k = 1) {
  z = z / k;
  if (z <= EDGES[0][0]) return [EDGES[0][1] * k, EDGES[0][2] * k];
  if (z >= EDGES.at(-1)[0]) return [EDGES.at(-1)[1] * k, EDGES.at(-1)[2] * k];
  for (let i = 1; i < EDGES.length; i++) {
    if (z <= EDGES[i][0]) {
      const [z0, w0, e0] = EDGES[i - 1], [z1, w1, e1] = EDGES[i];
      const t = (z - z0) / (z1 - z0);
      return [(w0 + (w1 - w0) * t) * k, (e0 + (e1 - e0) * t) * k];
    }
  }
  return [0, 0];
}

// The island outline as a closed ring (west edge north-bound, east edge south-bound).
export function islandOutline(k = 1) {
  const west = [], east = [];
  for (const [z, w, e] of EDGES) { west.push([w * k, z * k]); east.push([e * k, z * k]); }
  return [...west, ...east.reverse()];
}

// Central Park — 59th to 110th, between the two park-side avenues.
export const PARK = { z0: 84, z1: 122, x0: -7.5, x1: -1.5 };

// Neighbourhoods, south → north. `towers` marks the districts where real skyscrapers cluster,
// so the biggest holders land where tall buildings actually belong and the skyline reads as NY.
export const NEIGHBOURHOODS = [
  { id: "fidi", name: "Financial District", z0: 0, z1: 14, towers: true },
  { id: "tribeca", name: "Tribeca & SoHo", z0: 14, z1: 28 },
  { id: "village", name: "Greenwich Village", z0: 28, z1: 40 },
  { id: "chelsea", name: "Chelsea & Flatiron", z0: 40, z1: 52 },
  { id: "midtown", name: "Midtown", z0: 52, z1: 82, towers: true },
  { id: "ues", name: "Upper East Side", z0: 84, z1: 122, side: "east" },
  { id: "uws", name: "Upper West Side", z0: 84, z1: 122, side: "west" },
  { id: "harlem", name: "Harlem", z0: 124, z1: 156 },
  { id: "heights", name: "Washington Heights", z0: 156, z1: 190 },
  { id: "inwood", name: "Inwood", z0: 190, z1: 214 },
];
export const HOOD_BY_ID = Object.fromEntries(NEIGHBOURHOODS.map(n => [n.id, n]));

// deterministic 0..1 from an address — the same wallet always gets the same home
export const hash01 = s => {
  let h = 2166136261;
  const str = String(s || "").toLowerCase();
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};
// a second, independent stream from the same address (for the lot within a neighbourhood)
const hash01b = s => hash01("lot:" + s);

const TOWER_HOODS = NEIGHBOURHOODS.filter(n => n.towers);

// Which neighbourhood a wallet lives in. Derived from the address hash, EXCEPT that the biggest
// holders are drawn from the skyscraper districts — otherwise the towers scatter into Inwood and
// the city stops looking like New York. `bigT` is 0..1, the wallet's size rank (1 = biggest).
export function neighbourhoodFor(address, bigT = 0) {
  const h = hash01(address);
  if (bigT > 0.9) return TOWER_HOODS[Math.floor(h * TOWER_HOODS.length) % TOWER_HOODS.length];
  return NEIGHBOURHOODS[Math.floor(h * NEIGHBOURHOODS.length) % NEIGHBOURHOODS.length];
}

// A lot inside a neighbourhood, snapped to a street grid so buildings line up along blocks
// instead of scattering. `seq` disambiguates wallets that hash into the same cell.
const AVENUE = 2.4, STREET = 2.0;
export function lotFor(address, hood, seq = 0, k = 1) {
  const ha = hash01(address), hb = hash01b(address);
  const z0 = hood.z0 * k, z1 = hood.z1 * k, depth = z1 - z0;
  const rows = Math.max(1, Math.round(depth / STREET));
  const row = (Math.floor(hb * rows) + seq * 7) % rows;
  const z = z0 + 1 + row * Math.max(0, depth - 2) / Math.max(1, rows - 1 || 1);

  let [w, e] = islandEdges(z, k);
  w += 1.1; e -= 1.1;                                   // keep off the waterfront
  if (hood.side === "east") w = Math.max(w, PARK.x1 * k + 0.9);   // east of Central Park
  if (hood.side === "west") e = Math.min(e, PARK.x0 * k - 0.9);   // west of Central Park
  const cols = Math.max(1, Math.round((e - w) / AVENUE));
  const col = (Math.floor(ha * cols) + seq * 3) % cols;
  const x = cols <= 1 ? (w + e) / 2 : w + col * (e - w) / (cols - 1);
  return { x, z };
}

// Full placement for a set of wallets. Sorted by score so size rank drives the tower districts;
// collisions are nudged to a free lot so no two buildings share a plot.
export function placeCity(items, k = 1) {
  const n = items.length;
  const taken = new Set();
  return items.map((it, i) => {
    const bigT = n > 1 ? 1 - i / (n - 1) : 1;
    const hood = neighbourhoodFor(it.a, bigT);
    let lot, key, seq = 0;
    do {
      lot = lotFor(it.a, hood, seq, k);
      key = `${lot.x.toFixed(2)}:${lot.z.toFixed(2)}`;
      seq++;
    } while (taken.has(key) && seq < 40);
    taken.add(key);
    // centre the island on the origin so the camera framing stays simple
    return { ...it, hood, x: lot.x, z: lot.z - (CITY_LENGTH * k) / 2 };
  });
}

// "Where do you live?" — answers for ANY address, whether or not it holds. That's deliberate:
// the lookup is a property of the address itself, so anyone can find their block.
export function lookupHome(address) {
  const a = String(address || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  const hood = neighbourhoodFor(a, 0);
  const lot = lotFor(a, hood, 0);
  return { a, hood, x: lot.x, z: lot.z - CITY_LENGTH / 2 };
}
