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

// ── WHY THE BASELINE MOVES ───────────────────────────────────────────────────
// A flat full-history baseline is wrong for this ratio. AEON-in-SPX has collapsed
// structurally — median ~45,800 SPX in late 2023 against ~2,100 now — not because
// AEON fell but because SPX appreciated ~130x from a fraction of a cent. Averaging
// across that compares today to a regime that cannot recur, and it flatters: it put
// the floor ask at the 59th percentile when against the last year it is the 98th.
// Full-history sigma is also so wide (the ratio spans two orders of magnitude) that
// the chart could only ever say "fair".
//
// So baseline and percentile are both TRAILING: judged against the recent regime,
// which adapts on its own and needs no hardcoded break date.
export const WINDOW_DAYS = 365;
const DAY = 86400e3;

/** Trailing median of the ratio → [[date, baseline]]. Expands until it has minN points. */
export function rollingBaseline(series, days = WINDOW_DAYS, minN = 30) {
  const pts = (series || []).map(([d, r]) => ({ t: Date.parse(d), d, r })).filter(p => p.r > 0);
  return pts.map((p, i) => {
    let w = pts.filter(q => q.t <= p.t && q.t >= p.t - days * DAY).map(q => q.r);
    if (w.length < minN) w = pts.slice(0, i + 1).map(q => q.r);   // early history: expanding
    return [p.d, median(w)];
  });
}

/** Values from the trailing window only — the ladder a price should be judged against. */
export function recentLadder(series, days = WINDOW_DAYS, minN = 30) {
  const pts = (series || []).filter(r => r[1] > 0);
  if (!pts.length) return [];
  const end = Date.parse(pts[pts.length - 1][0]);
  let w = pts.filter(r => Date.parse(r[0]) >= end - days * DAY).map(r => r[1]);
  if (w.length < minN) w = pts.map(r => r[1]);
  return w.sort((a, b) => a - b);
}

/**
 * Deviation from the TRAILING baseline, in log space (the ratio is multiplicative).
 * sigma is measured on those deviations, not on the raw level, so the bands track the
 * regime instead of spanning all of history. ±0.5σ is deliberately wide — ordinary
 * drift should read "fair", not be dressed up as a signal.
 */
export function zStats(series, days = WINDOW_DAYS) {
  const vals = ladderOf(series);
  if (vals.length < 20) return null;
  const baseSeries = rollingBaseline(series, days);
  const baseAt = new Map(baseSeries);
  const devs = series.map(([d, r]) => (r > 0 && baseAt.get(d) > 0 ? Math.log(r / baseAt.get(d)) : null)).filter(v => v != null);
  const dm = devs.reduce((s, v) => s + v, 0) / devs.length;
  const sd = Math.sqrt(devs.reduce((s, v) => s + (v - dm) ** 2, 0) / devs.length) || 1;
  const cur = series[series.length - 1][1];
  const base = baseSeries[baseSeries.length - 1][1];
  const z = (Math.log(cur / base) - dm) / sd;
  const state = z < -0.5 ? { t: "cheap", c: "#34d399" } : z > 0.5 ? { t: "expensive", c: "#fb7185" } : { t: "fair", c: "#fbbf24" };
  const ladder = recentLadder(series, days);
  return {
    base, cur, z, state, sd, baseSeries,
    // band multiplier applied to the baseline at each point → curved, regime-tracking bands
    bandMult: k => Math.exp(dm + k * sd),
    min: vals[0], max: vals[vals.length - 1],
    pctVsBase: (cur / base - 1) * 100,
    pct: percentileOf(ladder, cur),          // vs the recent regime, not all history
    pctAll: percentileOf(vals, cur),
    windowDays: days, nWindow: ladder.length,
  };
}
