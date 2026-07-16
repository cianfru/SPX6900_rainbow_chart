// SPX6900 vs the ALT MARKET — relative-strength "rainbow".
// Series = SPX price ÷ TOTAL3ES (alt market cap ex-BTC/ETH/stables), rebased to 1× at
// SPX's launch = "how much SPX has out/under-performed the whole alt sector over time".
// Because it's a RATIO (not price-vs-age), the bands are a LOG-LINEAR trend ± σ (z-score),
// NOT the age power-law fit: above trend = SPX stretched vs alts, below = cheap vs alts.
// Pure + bundle-backed so the bot card and the site chart share one source (no drift).
import { SPX_DAILY } from "./spx-daily.js";
import { TOTAL3ES } from "./total3es-history.js";

const DAY = 86400000;

// Join SPX daily closes with TOTAL3ES on common dates → [{ts, ratio}] (ratio = spx/alts).
export function altRatio(spxPairs = SPX_DAILY, t3esPairs = TOTAL3ES) {
  const alt = new Map(t3esPairs.map(([d, v]) => [d, v]));
  const out = [];
  for (const [d, px] of spxPairs) {
    const a = alt.get(d);
    if (a > 0 && px > 0) out.push({ ts: Date.parse(d + "T00:00:00Z"), d, ratio: px / a });
  }
  return out.sort((x, y) => x.ts - y.ts);
}

// Log-linear trend + z-score bands over the rebased ratio.
export function buildAltRainbow(spxPairs, t3esPairs, opts = {}) {
  const raw = altRatio(spxPairs, t3esPairs);
  if (raw.length < 30) return null;
  const r0 = raw[0].ratio, t0 = raw[0].ts;
  // rebased relative strength (1× at launch) + day index for the fit
  const pts = raw.map(p => ({ ts: p.ts, d: p.d, rr: p.ratio / r0, t: (p.ts - t0) / DAY }));

  // OLS on log(rr) vs t
  const y = pts.map(p => Math.log(p.rr)), x = pts.map(p => p.t), n = pts.length;
  const sT = x.reduce((s, v) => s + v, 0), sY = y.reduce((s, v) => s + v, 0);
  const sTT = x.reduce((s, v) => s + v * v, 0), sTY = x.reduce((s, v, i) => s + v * y[i], 0);
  const b = (n * sTY - sT * sY) / (n * sTT - sT * sT || 1);
  const a = (sY - b * sT) / n;
  const trendLog = t => a + b * t;
  const res = pts.map((p, i) => y[i] - trendLog(p.t));
  // floor σ so a (near-)perfect fit yields z≈0 instead of 0/0 numerical noise.
  const sigma = Math.max(Math.sqrt(res.reduce((s, v) => s + v * v, 0) / n), 1e-6);

  const series = pts.map((p, i) => ({ ts: p.ts, d: p.d, rr: p.rr, trend: Math.exp(trendLog(p.t)), z: res[i] / sigma }));
  // 5 rainbow bands at trend × exp(k·σ), k = -2..2 (blue cheap → red stretched)
  const KS = [-2, -1, 0, 1, 2];
  const bands = KS.map(k => ({ k, points: pts.map(p => ({ ts: p.ts, val: Math.exp(trendLog(p.t) + k * sigma) })) }));

  const cur = series.at(-1);
  return { series, bands, fit: { a, b, sigma }, cur: { ...cur, label: zLabel(cur.z) } };
}

export function zLabel(z) {
  if (z >= 1.5) return "richly stretched vs alts";
  if (z >= 0.5) return "outperforming its trend vs alts";
  if (z > -0.5) return "in line with the alt market";
  if (z > -1.5) return "cheap vs alts";
  return "deeply cheap vs alts";
}

// Continuous 0..1 (blue→red) for a z in ±2.5σ, for colouring.
export const zToUnit = z => Math.max(0, Math.min(1, (z + 2.5) / 5));
