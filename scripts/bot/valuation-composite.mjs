// Custom valuation composite — a weighted basket of independent SPX6900 valuation indicators
// (on-chain + technical + sentiment), each CLEARLY LABELLED with its weight, combined into ONE
// historical over/under-valued oscillator. Replaces the "Am I Cheap?" snapshot with a time series.
//
// METHOD (fully reproducible — the honesty moat): each lens is oriented so HIGHER = MORE EXPENSIVE,
// then percentile-ranked over its OWN full history (0 = cheapest it's ever been, 1 = most expensive).
// The composite per week = the WEIGHTED AVERAGE of the available lenses' percentiles. So the number
// reads literally as "weighted percentile of expensiveness across everything we track." A valuation-
// POSITION over time, NOT a buy/sell signal. No Resvg import here so posts/tests/site can all use it.
import * as M from "../../src/models.js";
import { buildAltRainbow } from "../../src/alt-rainbow.js";

// The basket. weight = relative importance (sums to 100); tweak freely — it's the one knob.
export const INDICATORS = [
  { key: "rainbow", label: "Rainbow power-law", group: "technical", weight: 22 },
  { key: "mvrv", label: "MVRV · cost basis", group: "on-chain", weight: 22 },
  { key: "sip", label: "Supply in profit", group: "on-chain", weight: 16 },
  { key: "picycle", label: "Pi Cycle trend", group: "technical", weight: 16 },
  { key: "alt", label: "vs Alt market", group: "relative", weight: 12 },
  { key: "fng", label: "Fear & Greed", group: "sentiment", weight: 12 },
];
export const WEIGHT = Object.fromEntries(INDICATORS.map(i => [i.key, i.weight]));
const WK = 7 * 86400000;

// Over/under-valued zones on the 0..1 composite.
export const ZONES = [
  { max: 0.20, label: "Deeply undervalued", color: "#22c55e" },
  { max: 0.40, label: "Undervalued", color: "#84cc16" },
  { max: 0.60, label: "Fair value", color: "#fbbf24" },
  { max: 0.80, label: "Overvalued", color: "#fb923c" },
  { max: 1.01, label: "Deeply overvalued", color: "#f87171" },
];
export const zoneOf = v => ZONES.find(z => v < z.max) || ZONES.at(-1);

// empirical percentile of v within a sorted array (0 = min, 1 = max), ties → midpoint.
function ranker(sorted) {
  const n = sorted.length;
  return v => {
    let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let eq = lo; while (eq < n && sorted[eq] === v) eq++;
    return n ? (lo + (eq - lo) / 2) / n : 0.5;
  };
}

// Assemble each lens as [{ts, v}] oriented HIGHER = MORE EXPENSIVE, straight from stats.
function lensSeries(s) {
  return {
    rainbow: (s.series?.risk || []).map(([ts, v]) => ({ ts, v })),                       // 0..1 risk, high = stretched
    mvrv: (s.mvrvSeries || []).filter(r => r.mvrv > 0).map(r => ({ ts: r.ts, v: r.mvrv })), // high = rich vs cost basis
    sip: (s.onchain || []).map(r => ({ ts: Date.parse(r.d), v: r.sip })),                // high = most supply in profit = frothy
    picycle: ((M.piCycleRatio(s.drawn || []) || {}).rows || []).map(r => ({ ts: r.ts, v: r.ratio })), // high = top zone
    alt: (((buildAltRainbow(s.history || []) || {}).series) || []).map(r => ({ ts: r.ts, v: r.z })),   // high = rich vs alts
    fng: (s.series?.fng || []).map(([ts, v]) => ({ ts, v })),                            // high = greed
  };
}

// → { series: [{ts, composite (0..1), n, byLens:{key:pct}}], cur, indicators }
export function valuationComposite(s) {
  const raw = lensSeries(s);
  const pct = {};
  for (const k of Object.keys(raw)) {
    const arr = raw[k].filter(p => Number.isFinite(p.ts) && Number.isFinite(p.v)).sort((a, b) => a.ts - b.ts);
    if (arr.length < 10) { pct[k] = []; continue; } // need enough history to rank meaningfully
    const rank = ranker(arr.map(p => p.v).sort((a, b) => a - b));
    pct[k] = arr.map(p => ({ ts: p.ts, pct: rank(p.v) }));
  }
  let t0 = Infinity, t1 = -Infinity;
  for (const k of Object.keys(pct)) for (const p of pct[k]) { if (p.ts < t0) t0 = p.ts; if (p.ts > t1) t1 = p.ts; }
  if (!Number.isFinite(t0)) return { series: [], cur: null, indicators: INDICATORS };
  // forward-fill cursor per lens (called with increasing ts)
  const ff = arr => { let i = 0, last = null; return ts => { while (i < arr.length && arr[i].ts <= ts) last = arr[i++].pct; return last; }; };
  const cur = {}; for (const k of Object.keys(pct)) cur[k] = ff(pct[k]);
  const series = [];
  for (let ts = t0 - (t0 % WK); ts <= t1 + WK; ts += WK) {
    let sum = 0, wsum = 0; const byLens = {};
    for (const k of Object.keys(pct)) {
      const p = cur[k](ts); if (p == null) continue;
      byLens[k] = +p.toFixed(4); const w = WEIGHT[k] || 0; sum += w * p; wsum += w;
    }
    if (wsum <= 0) continue;
    series.push({ ts, composite: +(sum / wsum).toFixed(4), n: Object.keys(byLens).length, byLens });
  }
  return { series, cur: series.at(-1) || null, indicators: INDICATORS };
}
