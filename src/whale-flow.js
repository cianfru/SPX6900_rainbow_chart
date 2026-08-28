// Shared whale-flow rules for the "Whales Watching" views (City 3D, Mosaic, Spectrum, Live board).
// ONE definition of "a whale", "moved which way", and how each chain's net flow is chosen per window,
// so every view counts buying/selling the SAME way and the headline numbers reconcile.
//
//   • A WHALE is any wallet holding ≥ 100,000 SPX.
//   • It counts as BUYING or SELLING only if it moved MORE THAN 0.5% of its bag over the window
//     (min 1,000 SPX); anything smaller is dust and the wallet reads FLAT. Same cutoff everywhere.
//
// The views differ in HOW they read a wallet's flow (exact daily deltas vs a weekly reconstruction vs
// a live feed) and in WHICH chains they can show — those differences are labelled on each view, not
// hidden. This module owns the parts that must be identical: the floor, the dust rule, the window
// labels, and the cross-chain field assembly the Mosaic + Live board both count from.

export const WHALE_FLOOR = 1e5;

// dust deadzone: 0.5% of the bag (min 1,000 SPX). Below this a move is noise → the wallet reads flat.
export const flowDust = bal => Math.max(1000, (bal || 0) * 0.005);

// net tokens moved over the window → "buy" | "sell" | "flat", using the shared dust threshold.
export function classifyFlow(net, bal) {
  const d = flowDust(bal);
  if (net > d) return "buy";
  if (net < -d) return "sell";
  return "flat";
}

export const WINDOW_LABELS = { 1: "24 hours", 7: "1 week", 30: "30 days" };
export const windowLabel = d => WINDOW_LABELS[d] || `${d} days`;

// Assemble the whale field across chains for a chosen window, choosing each wallet's net the SAME way
// for every view that shows a live census. Returns
//   { rows:[{a,chain,bal,net}] (sorted biggest-buyer → biggest-seller), census }
// where census = { total, buying, selling, flat, byChain:{eth,base,sol} }.
//   • ETH (whales.json) banks all three windows (d1/d7/d30); on the 24h view we prefer the live net.
//   • Base & Solana (base/solana-onchain.json) carry only a ~30-day flow, so on shorter windows they
//     read flat unless the live feed serves them — we never invent a number we don't have.
export function whaleField({ whales, base, sol, live, win }) {
  const key = "d" + win;
  const liveMap = new Map();
  for (const w of live?.wallets || []) if (w.a) liveMap.set(w.chain === "sol" ? w.a : w.a.toLowerCase(), w.net);
  const ethNet = w => {
    if (win === 1 && w.a) { const lk = liveMap.get(w.a.toLowerCase()); if (Number.isFinite(lk)) return lk; }
    const v = w[key]; return Number.isFinite(v) ? v : (w.d30 || 0);
  };
  const altNet = (w, k) => (win === 30 ? (w.flow || 0) : (Number.isFinite(liveMap.get(k)) ? liveMap.get(k) : 0));

  const rows = [];
  for (const w of whales?.wallets || []) if (w && w.bal >= WHALE_FLOOR) rows.push({ a: w.a, chain: "eth", bal: w.bal, net: ethNet(w) });
  for (const w of base?.wallets || []) if (w && w.bal >= WHALE_FLOOR) rows.push({ a: w.a, chain: "base", bal: w.bal, net: altNet(w, w.a ? w.a.toLowerCase() : "") });
  for (const w of sol?.wallets || []) if (w && w.bal >= WHALE_FLOOR) rows.push({ a: w.a, chain: "sol", bal: w.bal, net: altNet(w, w.a) });

  const census = { total: rows.length, buying: 0, selling: 0, flat: 0, byChain: { eth: 0, base: 0, sol: 0 } };
  for (const r of rows) {
    const f = classifyFlow(r.net, r.bal);
    if (f === "buy") census.buying++; else if (f === "sell") census.selling++; else census.flat++;
    census.byChain[r.chain] = (census.byChain[r.chain] || 0) + 1;
  }
  census.net = rows.reduce((s, r) => s + (r.net || 0), 0);
  rows.sort((a, b) => b.net - a.net);
  return { rows, census };
}
