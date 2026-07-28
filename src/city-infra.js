import { fromLatLon, BRIDGE_LINE } from "./city-map.js";

// THE REST OF THE TOKEN — everything that isn't a holder.
//
// The city started as a map of Ethereum holders, which is 667M of a 931M supply. This is the other
// 264M: the coins sitting on exchanges, in the Uniswap pool, locked in the bridge that backs Base
// and Solana, and the 69M that were burned. Rendered as the infrastructure a real port city has —
// docks, a bridge, a monument — so the whole supply is visible in one place instead of split
// between a map and four separate charts.
//
// EVERY SITE IS WHERE THE REAL THING IS. The port sits off Red Hook, which is New York's actual
// container terminal. The bridge runs the Brooklyn Bridge's line. The monument stands on Liberty
// Island. None of that is decoration — placing them correctly is what stops the city becoming a
// diagram with a New York skin, and it means anyone who knows the city can check us.
//
// The honest framing, which belongs on the page: the SUPPLIES, the venues and the bridge are real
// and checkable. Which borough stands for which chain is a game.

// ── sites, in real coordinates ────────────────────────────────────────────────────────────────
export const SITES = {
  // Liberty Island. The burn address holds 69.01M coins that can never move, and the one statue
  // everybody on earth can identify from its outline happens to be holding up a flame.
  monument: { lat: 40.6892, lon: -74.0445, name: "Liberty Island" },
  // Governors Island — the small island in the harbour, for the Uniswap pool. SPX launched as a
  // DEX token, so the LP is the oldest thing here; putting it on its own island says that.
  lp: { lat: 40.6892, lon: -74.0165, name: "Governors Island" },
  // The Brooklyn Bridge's real line. Manhattan (Ethereum) to Brooklyn (Base) — the Wormhole bridge
  // is what actually backs the supply on the other chains, so the span carries a real number.
  // ⚠ The line itself comes from city-map (BRIDGE_LINE), which needs it to clear the lots the
  // roadway lands on. One copy: a second would let the deck and its plaza drift apart, which is
  // how the road came to end inside a building in the first place.
  bridge: { ...BRIDGE_LINE, name: "Brooklyn Bridge" },
  // Red Hook: New York's container port. The exchange district goes in the water off it.
  // In the WATER off Red Hook, not on it — the first pass ran the berths inland across Brooklyn.
  port: { lat: 40.6700, lon: -74.0300, along: 0.0200, across: 0.0080, name: "Red Hook" },
};

// Fallbacks for the two balances the FIFO engine doesn't emit per row YET. Both are documented in
// the project notes and neither moves quickly — the burn is fixed by definition (0x…dead is
// receive-only) and the bridge shifts slowly. They're superseded the moment a pipeline run lands.
export const FALLBACK = { burn: 69_010_000, bridge: 111_500_000 };

// Pull the supply picture out of the latest on-chain row. Pure, so the numbers on the page and the
// numbers in a test come from the same place.
export function infraFrom(row) {
  const venues = Object.entries(row?.cexVenues || {})
    .map(([name, tokens]) => ({ name, tokens }))
    .filter(v => v.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
  const cex = venues.reduce((s, v) => s + v.tokens, 0) || row?.cexBal || 0;
  return {
    venues, cex,
    lp: row?.lpBal || 0,
    bridge: row?.bridgeBal || FALLBACK.bridge,
    burn: row?.burnBal || FALLBACK.burn,
    held: row?.heldTokens || 0,
    // Flagged so the page can say which figures came from the live reconstruction and which are
    // the documented constants — rather than presenting both as equally fresh.
    estimated: [!row?.bridgeBal && "bridge", !row?.burnBal && "burn"].filter(Boolean),
  };
}

// Docks laid along the waterfront, biggest venue nearest the mouth of the harbour. Returns world
// coordinates so the renderer never has to know about latitude.
export function portBerths(venues, k = 1) {
  const { lat, lon, along, across } = SITES.port;
  const total = venues.reduce((s, v) => s + v.tokens, 0) || 1;
  let t = 0;
  return venues.map(v => {
    const share = v.tokens / total;
    const mid = t + share / 2;
    t += share;
    const p = fromLatLon(lat + along * mid, lon + across * mid);
    return {
      ...v, share,
      x: p.x * k, z: p.z * k,
      // Warehouse footprint is the venue's share of exchange-held supply. Kraken is ~42% of it, so
      // it should visibly dwarf everything — that is the finding, not a rendering accident.
      len: Math.max(0.9, share * 26) * k,
      wide: Math.max(0.7, Math.sqrt(share) * 5) * k,
      tall: Math.max(0.5, Math.sqrt(share) * 4.5) * k,
    };
  });
}

export const siteAt = (site, k = 1) => {
  const p = fromLatLon(site.lat, site.lon);
  return { x: p.x * k, z: p.z * k };
};

export const bridgeSpan = (k = 1) => {
  const a = fromLatLon(...SITES.bridge.from), b = fromLatLon(...SITES.bridge.to);
  return { ax: a.x * k, az: a.z * k, bx: b.x * k, bz: b.z * k };
};

export const fmtTokens = n =>
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(Math.round(n));
