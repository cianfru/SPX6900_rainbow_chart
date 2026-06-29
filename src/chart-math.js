// Pure math for the interactive chart pages — mirrors the bot's card generators
// (scripts/bot/risk-cards.mjs, roi-card.mjs, rsi-card.mjs) so the website chart
// and its tweet card tell the same story. Each takes the `series` ({date, price})
// the app already has and (where needed) the fitted model `m`.
import { dayN } from "./models.js";

// continuous 0..1 → jet-ish colour: blue → cyan → green → yellow → orange → red.
// (Identical to riskColor in scripts/bot/risk-cards.mjs.)
const toRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const STOPS = [[0, "#2563eb"], [0.25, "#06b6d4"], [0.5, "#22c55e"], [0.7, "#eab308"], [0.85, "#f97316"], [1, "#ef4444"]].map(([p, h]) => [p, toRGB(h)]);
export function riskColor(r) {
  r = Math.max(0, Math.min(1, r));
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) if (r >= STOPS[i][0] && r <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  const t = (r - a[0]) / ((b[0] - a[0]) || 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const ts = d => new Date(d).getTime();

// --- Valuation z-score: log-residual from the power-law fair value ----------
export const zToUnit = (z, mean, std) => Math.max(0, Math.min(1, 0.5 + (z - mean) / (std * 5)));
export function zScoreSeries(series, m) {
  const pts = series.map(r => ({ ts: ts(r.date), date: r.date, price: r.price, z: Math.log(r.price) - m.predict(dayN(r.date)) }));
  const mean = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  const std = Math.sqrt(pts.reduce((a, p) => a + (p.z - mean) ** 2, 0) / pts.length) || 1;
  // attach the fair value (price/exp(z)), the sigma and the 0..1 colour position
  for (const p of pts) { p.fair = p.price / Math.exp(p.z); p.sigma = (p.z - mean) / std; p.u = zToUnit(p.z, mean, std); p.color = riskColor(p.u); }
  return { pts, mean, std };
}

// --- 20-week (140d) extension oscillator (Cowen-style) ----------------------
export function extensionSeries(series) {
  const pts = series.map(r => ({ ts: ts(r.date), date: r.date, price: r.price })).sort((a, b) => a.ts - b.ts);
  const WK20 = 140 * 86400000;
  const maAt = t => { let s = 0, n = 0; for (const q of pts) if (q.ts > t - WK20 && q.ts <= t) { s += q.price; n++; } return n ? s / n : pts[0].price; };
  const rows = pts.map(p => { const ma = maAt(p.ts); const ext = Math.log(p.price / ma); return { ...p, ma, ext, pct: (p.price / ma - 1) * 100 }; });
  const absSorted = rows.map(r => Math.abs(r.ext)).sort((a, b) => a - b);
  const maxAbs = Math.max(0.05, absSorted[Math.floor(absSorted.length * 0.9)] || 0.05);
  for (const r of rows) { const u = 0.5 + 0.5 * Math.max(-1, Math.min(1, r.ext / maxAbs)); r.u = u; r.color = riskColor(u); }
  const cur = rows.at(-1);
  return { rows, maxAbs, cur };
}

// --- 365-day running ROI: price(t) / price(t−365d) --------------------------
export function runningRoiSeries(series) {
  const pts = series.map(r => ({ ts: ts(r.date), date: r.date, price: r.price })).sort((a, b) => a.ts - b.ts);
  const YEAR = 365 * 86400000;
  const priceAtTs = target => { let best = null, bd = Infinity; for (const p of pts) { const d = Math.abs(p.ts - target); if (d < bd) { bd = d; best = p; } } return bd <= 18 * 86400000 ? best.price : null; };
  const rows = pts.map(p => { const prev = priceAtTs(p.ts - YEAR); return { ts: p.ts, date: p.date, price: p.price, roi: prev ? p.price / prev : null }; });
  const withRoi = rows.filter(r => r.roi != null);
  const cur = withRoi.at(-1)?.roi ?? 1;
  return { rows, firstRoiTs: withRoi[0]?.ts ?? pts[0].ts, cur };
}

// --- RSI dots (PlanB homage): monthly closes, Wilder RSI, geometric MA ------
export const RSI_PERIOD = 6, GMA_MONTHS = 6, RSI_LO = 35, RSI_HI = 85;
export const rsiColor = v => riskColor((v - RSI_LO) / (RSI_HI - RSI_LO));

function rsiSeries(prices, period) {
  const out = new Array(prices.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i < prices.length; i++) {
    const ch = prices[i] - prices[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= period) { ag += g; al += l; if (i === period) { ag /= period; al /= period; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } }
    else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); }
  }
  return out;
}

// last close per calendar month (the series' final point carries the live price)
function monthlyCloses(series) {
  const byM = new Map();
  for (const r of series) { const d = new Date(r.date); byM.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), { ts: ts(r.date), price: r.price }); }
  return [...byM.keys()].sort((a, b) => a - b).map(k => byM.get(k));
}

export function rsiDotsSeries(series) {
  const raw = monthlyCloses(series);
  const rsis = rsiSeries(raw.map(p => p.price), RSI_PERIOD);
  const dots = raw.map((p, i) => ({ ...p, rsi: rsis[i] })).filter(p => p.rsi != null).map(p => ({ ...p, color: rsiColor(p.rsi) }));
  const xMin = dots.length ? dots[0].ts : raw[0].ts;
  const gma = raw.map((p, i) => {
    const lo = Math.max(0, i - GMA_MONTHS + 1); let acc = 0;
    for (let j = lo; j <= i; j++) acc += Math.log(raw[j].price);
    return { ts: p.ts, v: Math.exp(acc / (i - lo + 1)), primed: i >= GMA_MONTHS - 1 };
  }).filter(g => g.primed && g.ts >= xMin);
  const cur = rsis.at(-1) ?? (dots.at(-1)?.rsi ?? 50);
  return { dots, gma, cur, xMin };
}
