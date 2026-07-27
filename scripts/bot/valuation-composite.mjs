// Valuation composite v2 — INDEPENDENT AXES, de-duplicated, cross-asset anchored.
//
// WHY v2 (measured, published on the Methods page): the old flat basket weighted six lenses,
// but rainbow / MVRV / supply-in-profit are 0.69–0.85 correlated (all "price vs a cost/value
// anchor"), and SOPR is 0.85 with MVRV — so the "6-lens" number was really ~one factor counted
// several times. v2 groups correlated lenses into AXES, combines WITHIN each axis, then weights
// ACROSS axes, so a signal votes once. The only genuinely independent lens measured so far is
// distribution/relative — trend overlaps valuation ~0.5–0.8, kept as its own (faster) axis.
//
// NORMALISATION: each lens is oriented HIGHER = MORE EXPENSIVE and percentile-ranked over its own
// history. For the UNITLESS lenses (MVRV, Pi Cycle) the percentile is BLENDED 50/50 with its rank
// against BITCOIN's decade — so SPX isn't judged on one ~3-year cycle alone (the cross-asset anchor).
//
// The composite reads as "weighted percentile of expensiveness across independent axes." A
// valuation POSITION over time, NOT a buy/sell signal. No Resvg import so posts/tests/site can use it.
import * as M from "../../src/models.js";
import { buildAltRainbow } from "../../src/alt-rainbow.js";
import { BTC_HISTORY, BTC_FIRST_DATE } from "../../src/btc-history.js";

const DAY = 86400000;
const ANCHOR = 0.5; // cross-asset blend: 0 = SPX-only, 1 = BTC-only; 0.5 = half each

// ── The axes. weight sums to 100 across axes; members are averaged WITHIN an axis. ───────────
export const AXES = [
  { key: "valuation", label: "Valuation", weight: 45, blurb: "Price vs the crowd's cost basis and the power-law fair value.",
    members: [
      { key: "rainbow", label: "Rainbow power-law" },
      { key: "mvrv", label: "MVRV · cost basis", crossAsset: "mvrv" },
      { key: "sip", label: "Supply in profit" },
    ] },
  { key: "trend", label: "Trend", weight: 25, blurb: "How stretched price is from its own trend — a faster horizon.",
    members: [{ key: "picycle", label: "Pi Cycle trend", crossAsset: "picycle" }] },
  { key: "relative", label: "vs Alt market", weight: 20, blurb: "SPX priced against the broader altcoin market.",
    members: [{ key: "alt", label: "vs Alt market" }] },
  { key: "sentiment", label: "Sentiment", weight: 10, blurb: "Crypto-wide Fear & Greed — market mood, not SPX-specific.",
    members: [{ key: "fng", label: "Fear & Greed" }] },
];
// Flat member list (back-compat + the Methods table): each member carries its axis + axis weight.
export const INDICATORS = AXES.flatMap(a => a.members.map(m => ({ key: m.key, label: m.label, group: a.key, axis: a.label, weight: a.weight })));
export const WEIGHT = Object.fromEntries(AXES.map(a => [a.key, a.weight]));

export const ZONES = [
  { max: 0.20, label: "Deeply undervalued", color: "#00e676" },
  { max: 0.40, label: "Undervalued", color: "#a3e635" },
  { max: 0.60, label: "Fair value", color: "#ffd60a" },
  { max: 0.80, label: "Overvalued", color: "#ff8c00" },
  { max: 1.01, label: "Deeply overvalued", color: "#ff2d55" },
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

// Bitcoin reference distributions for the cross-asset anchor (sorted value arrays).
function btcRefs(s) {
  const refs = {};
  const bm = (s.btcMvrv?.points || s.btcMvrv || []).map(p => (Array.isArray(p) ? p[1] : p.v ?? p.mvrv)).filter(Number.isFinite);
  if (bm.length > 50) refs.mvrv = bm.slice().sort((a, b) => a - b);
  const d0 = Date.parse(BTC_FIRST_DATE);
  const btcDrawn = BTC_HISTORY.map(([d, p]) => ({ ts: d0 + d * DAY, price: p }));
  const bp = ((M.piCycleRatio(btcDrawn) || {}).rows || []).map(r => r.ratio).filter(Number.isFinite);
  if (bp.length > 50) refs.picycle = bp.slice().sort((a, b) => a - b);
  return refs;
}

// Assemble each lens as [{ts, v}] oriented HIGHER = MORE EXPENSIVE, straight from stats.
function lensSeries(s) {
  return {
    rainbow: (s.series?.risk || []).map(([ts, v]) => ({ ts, v })),
    mvrv: (s.mvrvSeries || []).filter(r => r.mvrv > 0).map(r => ({ ts: r.ts, v: r.mvrv })),
    sip: (s.onchain || []).map(r => ({ ts: Date.parse(r.d), v: r.sip })),
    picycle: ((M.piCycleRatio(s.drawn || []) || {}).rows || []).map(r => ({ ts: r.ts, v: r.ratio })),
    alt: (((buildAltRainbow(s.history || []) || {}).series) || []).map(r => ({ ts: r.ts, v: r.z })),
    fng: (s.series?.fng || []).map(([ts, v]) => ({ ts, v })),
  };
}

// → { series:[{ts, composite, byAxis, byLens, n}], cur, axes, indicators }
export function valuationComposite(s) {
  const raw = lensSeries(s);
  const refs = btcRefs(s);
  const memberOf = Object.fromEntries(AXES.flatMap(a => a.members.map(m => [m.key, m])));

  // percentile series per member (blended with BTC for the cross-asset ones)
  const pct = {};
  for (const k of Object.keys(raw)) {
    const arr = raw[k].filter(p => Number.isFinite(p.ts) && Number.isFinite(p.v)).sort((a, b) => a.ts - b.ts);
    if (arr.length < 10) { pct[k] = []; continue; }
    const own = ranker(arr.map(p => p.v).slice().sort((a, b) => a - b));
    const ca = memberOf[k]?.crossAsset, btc = ca && refs[ca] ? ranker(refs[ca]) : null;
    pct[k] = arr.map(p => ({ ts: p.ts, pct: btc ? (1 - ANCHOR) * own(p.v) + ANCHOR * btc(p.v) : own(p.v) }));
  }

  let t0 = Infinity, t1 = -Infinity;
  for (const k of Object.keys(pct)) for (const p of pct[k]) { if (p.ts < t0) t0 = p.ts; if (p.ts > t1) t1 = p.ts; }
  if (!Number.isFinite(t0)) return { series: [], cur: null, axes: AXES, indicators: INDICATORS };

  const ff = arr => { let i = 0, last = null; return ts => { while (i < arr.length && arr[i].ts <= ts) last = arr[i++].pct; return last; }; };
  const cursor = {}; for (const k of Object.keys(pct)) cursor[k] = ff(pct[k]);

  const series = [];
  // DAILY grid (was weekly) — every lens is daily-capable, so the composite is a daily series.
  for (let ts = t0 - (t0 % DAY); ts <= t1 + DAY; ts += DAY) {
    const byLens = {};
    for (const k of Object.keys(pct)) { const p = cursor[k](ts); if (p != null) byLens[k] = +p.toFixed(4); }
    // combine WITHIN each axis (mean of its available members), then weight ACROSS axes
    let sum = 0, wsum = 0; const byAxis = {};
    for (const a of AXES) {
      const vals = a.members.map(m => byLens[m.key]).filter(v => v != null);
      if (!vals.length) continue;
      const axisPct = vals.reduce((x, y) => x + y, 0) / vals.length;
      byAxis[a.key] = +axisPct.toFixed(4);
      sum += a.weight * axisPct; wsum += a.weight;
    }
    if (wsum <= 0) continue;
    series.push({ ts, composite: +(sum / wsum).toFixed(4), byAxis, byLens, n: Object.keys(byAxis).length });
  }
  return { series, cur: series.at(-1) || null, axes: AXES, indicators: INDICATORS };
}
