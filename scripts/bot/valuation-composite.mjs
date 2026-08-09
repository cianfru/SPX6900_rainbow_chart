// Valuation composite v3 — INDEPENDENT AXES, de-duplicated, cross-asset anchored, now with a
// behaviour dimension.
//
// WHY v3 (measured, published on the Methods page): the old lenses were ALL "where does price SIT"
// — rainbow / MVRV / supply-in-profit are 0.69–0.85 correlated (one factor), and Pi Cycle was a
// BORROWED Bitcoin halving indicator on a non-halving asset. v3 drops both weak/redundant lenses
// (Pi Cycle, supply-in-profit) and adds the dimension they all missed — what holders are DOING:
//   • Exchange flow (organic netflow) — measured r ≈ 0.03 vs the old composite: genuinely orthogonal.
//   • Conviction (liveliness) — r ≈ 0.31: are long-held coins waking up or sitting tight?
// So the six lenses now span six DISTINCT dimensions: valuation (rainbow + MVRV), relative, flow,
// conviction, sentiment — each votes once. NUPL/SOPR stay out (0.83 / 0.60 = MVRV in disguise).
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
  { key: "valuation", label: "Valuation", weight: 40, blurb: "Price vs the power-law fair value and the crowd's cost basis.",
    members: [
      { key: "rainbow", label: "Rainbow power-law" },
      { key: "mvrv", label: "MVRV · cost basis", crossAsset: "mvrv" },
    ] },
  { key: "relative", label: "vs Alt market", weight: 18, blurb: "SPX priced against the broader altcoin market.",
    members: [{ key: "alt", label: "vs Alt market" }] },
  { key: "flow", label: "Exchange flow", weight: 18, blurb: "Coins moving onto exchanges (distribution) vs into self-custody (accumulation).",
    members: [{ key: "netflow", label: "Exchange netflow" }] },
  { key: "conviction", label: "Conviction", weight: 14, blurb: "Are long-held coins waking up (distribution) or sitting tight (holding)?",
    members: [{ key: "liveliness", label: "Liveliness" }] },
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

// Exchange flow lens: rolling 30-day ORGANIC net onto exchanges (cex-flow.json col 4 = organic net,
// listings/onboarding stripped). Positive = net distribution TO exchanges = sell-side = "expensive".
// Falls back to the 30-day change in raw CEX balance (onchain) if cex-flow isn't loaded (noisier).
function netflowSeries(s) {
  const W = 30;
  const days = s.cexFlow?.days;
  if (Array.isArray(days) && days.length > W) {
    const org = days.map(d => ({ ts: Date.parse(d[0]), v: Number(d[4]) || 0 })).filter(p => Number.isFinite(p.ts)).sort((a, b) => a.ts - b.ts);
    const out = [];
    for (let i = 0; i < org.length; i++) { let sum = 0; for (let j = Math.max(0, i - W + 1); j <= i; j++) sum += org[j].v; out.push({ ts: org[i].ts, v: sum }); }
    return out;
  }
  const oc = (s.onchain || []).filter(r => Number.isFinite(r.cexBal)).map(r => ({ ts: Date.parse(r.d), v: r.cexBal })).sort((a, b) => a.ts - b.ts);
  const out = [];
  for (let i = W; i < oc.length; i++) out.push({ ts: oc[i].ts, v: oc[i].v - oc[i - W].v });
  return out;
}

// Assemble each lens as [{ts, v}] oriented HIGHER = MORE EXPENSIVE, straight from stats.
function lensSeries(s) {
  return {
    rainbow: (s.series?.risk || []).map(([ts, v]) => ({ ts, v })),
    mvrv: (s.mvrvSeries || []).filter(r => r.mvrv > 0).map(r => ({ ts: r.ts, v: r.mvrv })),
    alt: (((buildAltRainbow(s.history || []) || {}).series) || []).map(r => ({ ts: r.ts, v: r.z })),
    netflow: netflowSeries(s),                            // higher = net distribution to exchanges = expensive
    liveliness: (s.onchain || []).filter(r => Number.isFinite(r.liveliness)).map(r => ({ ts: Date.parse(r.d), v: r.liveliness })), // rising = old coins waking up = distribution = expensive
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
