// COST BASIS DISTRIBUTION — a percentile ladder of holders' entry prices over time.
//
// The raw material is `public/urpd-history.json`: for every week, the share of currently-held supply
// in each log-spaced price bucket (the cost-basis histogram, aka URPD). Reading that histogram as a
// weighted distribution and pulling percentiles (p20…p95) turns the "walls of supply" into smooth
// lines — the same object as the rainbow, but the bands are REAL acquisition prices, not a fitted
// curve. p50 is the median cost basis (≈ realized price); price threading the ladder = valuation
// position (above p95 ≈ everyone in profit; sinking toward p20 = the low percentiles as support).
//
// Two weightings, both from the same weekly histogram fields:
//   • `pct`     — SUPPLY-weighted (every coin counts equally) → the "BTC-weighted" view.
//   • `pctCoin` — COINTIME-weighted (each coin weighted by amount × days held) → conviction supply
//                 dominates, fresh churn barely registers. Only present once the engine emits it.
// Pure + framework-free so the chart and the tests share one implementation.

// The rainbow set, matched to the reference chart: p95 (dearest cohort) down to p20 (cheapest).
export const LADDER_PCTS = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20];

// The price below which fraction `p` (0..1) of the weighted distribution sits, interpolated within
// the crossing bucket in LOG price space (buckets are log-spaced, so geometric interpolation is right).
// edges: length n+1 bucket boundaries; weights: length n (any non-negative scale). null if empty.
export function percentileFromHist(edges, weights, p) {
  if (!Array.isArray(edges) || !Array.isArray(weights) || weights.length + 1 !== edges.length) return null;
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (!(total > 0)) return null;
  const target = Math.min(Math.max(p, 0), 1) * total;
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (cum + w >= target && w > 0) {
      const lo = edges[i], hi = edges[i + 1];
      if (!(lo > 0) || !(hi > 0)) return lo || hi || null;
      const f = (target - cum) / w;                 // 0..1 within the bucket
      return lo * Math.pow(hi / lo, f);             // geometric (log-space) interpolation
    }
    cum += w;
  }
  return edges[edges.length - 1];
}

// Share of the weighted distribution acquired at or below `spot` (bucket midpoint ≤ spot) — a
// distribution-aware "supply in profit". Returns 0..1, or null if the histogram is empty.
export function shareInProfit(edges, weights, spot) {
  if (!Array.isArray(edges) || !Array.isArray(weights) || weights.length + 1 !== edges.length) return null;
  if (!(spot > 0)) return null;
  let total = 0, below = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (!w) continue;
    total += w;
    const mid = Math.sqrt(edges[i] * edges[i + 1]);
    if (mid <= spot) below += w;
  }
  return total > 0 ? below / total : null;
}

// Supply-weighted MEAN of the distribution — the realized price (average cost basis, what MVRV uses).
// Distinct from the median (p50): a right-skewed distribution (a cohort that bought high) pulls the
// mean ABOVE the median. Returns null if the histogram is empty.
export function meanOf(edges, weights) {
  if (!Array.isArray(edges) || !Array.isArray(weights) || weights.length + 1 !== edges.length) return null;
  let tot = 0, sum = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (!w) continue;
    sum += w * Math.sqrt(edges[i] * edges[i + 1]);   // bucket geometric midpoint
    tot += w;
  }
  return tot > 0 ? sum / tot : null;
}

// Does the history carry the cointime-weighted field yet? (Data-gates the "Cointime" toggle.)
export function hasCointime(hist) {
  return !!hist?.weeks?.some(w => Array.isArray(w.pctCoin) && w.pctCoin.some(x => x > 0));
}

// Build the ladder: one row per week with { ts, spot, p95…p20 }, ready for a line chart.
// `field` picks the weighting ("pct" supply-weighted, "pctCoin" cointime-weighted).
export function buildLadder(hist, { field = "pct", percentiles = LADDER_PCTS } = {}) {
  if (!hist?.weeks?.length || !Array.isArray(hist.edges)) return null;
  const edges = hist.edges;
  const rows = [];
  for (const w of hist.weeks) {
    const weights = w[field];
    const ts = Date.parse(w.d);
    if (!Array.isArray(weights) || weights.length + 1 !== edges.length || !Number.isFinite(ts)) continue;
    const row = { ts, spot: w.spot > 0 ? w.spot : null };
    let ok = true;
    for (const p of percentiles) {
      const v = percentileFromHist(edges, weights, p / 100);
      if (!(v > 0)) { ok = false; break; }
      row["p" + p] = +v.toFixed(7);
    }
    if (ok) rows.push(row);
  }
  return rows.length ? { percentiles, rows } : null;
}

// Rainbow colour for a percentile line: p95 red → through green/cyan/blue → p20 magenta, matching
// the reference chart. rank 0 = highest percentile (red), n−1 = lowest (magenta).
export function ladderColor(rank, n) {
  const hue = n > 1 ? (rank / (n - 1)) * 300 : 0;   // 0 (red) … 300 (magenta)
  return `hsl(${Math.round(hue)}, 82%, 58%)`;
}
