// ============================================================================
// PROJECT AEON — priced in SPX6900 (shared valuation math)
// ============================================================================
// AEON's price tracks SPX far more closely than it tracks ETH — weekly log-return
// correlation ~0.53-0.57 vs ~0.36 — so SPX explains roughly 28% of AEON's price
// variation where rarity explains ~5%. That makes SPX, not ETH, the honest
// denominator for "is an AEON dear or cheap right now".
//
// The SERIES come from the builder (`aeon-market.json` → `spxValue`), which computes
// them once from one SPX source. This module owns the MATH applied to them, so the
// listings chart and the floor-vs-SPX chart cannot drift apart in either input or
// interpretation:
//
//   • ladderOf / percentileOf → where a given price sits in AEON's own history
//     (used to judge live asks)
//   • zStats                  → baseline, ±σ bands and the cheap/fair/expensive
//     verdict (used by the floor-vs-SPX time series)
//
// Series shape is [[ "YYYY-MM-DD", ratio ], …] where ratio = how many SPX coins one
// AEON costs. `spxValue.saleSeries` is the weekly median SALE; `spxValue.floorSeries`
// is the daily 7-day-median FLOOR. They answer different questions (typical trade vs
// cheapest entry) — pick deliberately.
// ============================================================================

export const median = a => {
  if (!a?.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Sorted values from a [[date, ratio]] series — the ladder a price is placed on. */
export const ladderOf = series => (series || []).map(r => r[1]).filter(v => v > 0).sort((a, b) => a - b);

/** Where `v` sits on `ladder`, 0-100. Null when there is not enough history to judge. */
export function percentileOf(ladder, v) {
  if (!ladder?.length || !(v > 0)) return null;
  let lo = 0;
  for (const x of ladder) { if (x <= v) lo++; else break; }
  return (lo / ladder.length) * 100;
}

/** "59th" — ordinal label for a percentile. */
export function ordinal(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n), v = r % 100, s = ["th", "st", "nd", "rd"];
  return r + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Baseline, log-σ bands and verdict for a ratio series.
 * Log space because the ratio is a multiplicative quantity spanning orders of magnitude.
 * ±0.5σ is the cheap/expensive threshold — deliberately wide, so ordinary drift is
 * called "fair" rather than dressed up as a signal.
 */
export function zStats(series) {
  const vals = ladderOf(series);
  if (vals.length < 20) return null;
  const base = median(vals);
  const logs = vals.map(Math.log);
  const lm = logs.reduce((s, v) => s + v, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((s, v) => s + (v - lm) ** 2, 0) / logs.length) || 1;
  const cur = series[series.length - 1][1];
  const z = (Math.log(cur) - lm) / sd;
  const state = z < -0.5 ? { t: "cheap", c: "#34d399" } : z > 0.5 ? { t: "expensive", c: "#fb7185" } : { t: "fair", c: "#fbbf24" };
  return {
    base, cur, z, state, sd,
    band: k => Math.exp(lm + k * sd),
    min: vals[0], max: vals[vals.length - 1],
    pctVsBase: (cur / base - 1) * 100,
    pct: percentileOf(vals, cur),
  };
}
