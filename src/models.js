import { D0 } from "./data.js";

export function dayN(ds) {
  return Math.max(1, Math.round((new Date(ds).getTime() - D0) / 86400000) + 1);
}

export function ds(day) {
  return new Date(D0 + (day - 1) * 86400000).toISOString().slice(0, 10);
}

function fitOffsetPowerLaw(data, t0) {
  // Linear regression in log-log space with virtual origin offset t0:
  //   ln(P) = a * ln(t + t0) + b
  const N = data.length;
  let Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
  for (let i = 0; i < N; i++) {
    const x = Math.log(data[i].day + t0);
    const y = data[i].lnP;
    Sx += x; Sy += y; Sxx += x * x; Sxy += x * y;
  }
  const a = (N * Sxy - Sx * Sy) / (N * Sxx - Sx * Sx);
  const b = (Sy - a * Sx) / N;
  return { a, b };
}

function ssRes(data, predict) {
  let s = 0;
  for (const d of data) {
    const r = d.lnP - predict(d.day);
    s += r * r;
  }
  return s;
}

// Search for the offset t0 that minimizes SS residuals (golden section ish via grid)
function bestT0(data) {
  let bestT0 = 0, bestSS = Infinity;
  for (let t0 = 0; t0 <= 500; t0 += 10) {
    const { a, b } = fitOffsetPowerLaw(data, t0);
    const ss = ssRes(data, day => a * Math.log(day + t0) + b);
    if (ss < bestSS) { bestSS = ss; bestT0 = t0; }
  }
  // Refine
  for (let t0 = Math.max(0, bestT0 - 10); t0 <= bestT0 + 10; t0 += 1) {
    const { a, b } = fitOffsetPowerLaw(data, t0);
    const ss = ssRes(data, day => a * Math.log(day + t0) + b);
    if (ss < bestSS) { bestSS = ss; bestT0 = t0; }
  }
  return bestT0;
}

function computeResiduals(data, predict) {
  return data.map(d => d.lnP - predict(d.day));
}

function computeR2(data, predict) {
  const N = data.length;
  const meanY = data.reduce((s, d) => s + d.lnP, 0) / N;
  const ss_tot = data.reduce((s, d) => s + (d.lnP - meanY) ** 2, 0);
  const ss_res = data.reduce((s, d) => s + (d.lnP - predict(d.day)) ** 2, 0);
  return 1 - ss_res / ss_tot;
}

function buildPercentileBands(residuals) {
  const sorted = [...residuals].sort((a, b) => a - b);
  const N = sorted.length;
  const pct = p => {
    const idx = p * (N - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return [
    pct(0.02), pct(0.07), pct(0.16), pct(0.30), pct(0.50),
    pct(0.70), pct(0.84), pct(0.93), pct(0.98), pct(0.995),
  ];
}

export function buildModel(RAW) {
  const pts = RAW.map(r => ({ day: dayN(r.date), lnP: Math.log(r.price) }));
  const t0 = bestT0(pts);
  const { a, b } = fitOffsetPowerLaw(pts, t0);
  const predict = day => a * Math.log(day + t0) + b;
  const resid = computeResiduals(pts, predict);
  const std = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / resid.length);

  return {
    name: "Offset Power Law",
    predict,
    bands: buildPercentileBands(resid),
    std,
    r2: computeR2(pts, predict),
    t0, a, b,
    formula: `ln(P) = ${a.toFixed(3)} × ln(t + ${t0}) ${b >= 0 ? "+" : "−"} ${Math.abs(b).toFixed(3)}`,
    note: `Offset power law with virtual origin ${t0} days before launch. Bands are asymmetric percentiles (p2 to p98) of residuals — they widen on the upside since bubbles overshoot more than capitulations undershoot.`,
  };
}

// Risk metric (0–1): how expensive price is vs the model, min–max normalized
// across the series' own log-deviations. 0 = cheapest seen, 1 = most expensive.
export function buildRiskSeries(m, series) {
  const zs = series.map(r => Math.log(r.price) - m.predict(dayN(r.date)));
  let lo = Infinity, hi = -Infinity;
  for (const v of zs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = (hi - lo) || 1;
  return series.map((r, i) => ({
    date: r.date,
    ts: new Date(r.date).getTime(),
    price: r.price,
    risk: Math.min(1, Math.max(0, (zs[i] - lo) / span)),
  }));
}

// Drawdown from the running all-time high (0 = at ATH, -0.7 = 70% below peak).
export function buildDrawdownSeries(series) {
  let peak = -Infinity;
  return series.map(r => {
    if (r.price > peak) peak = r.price;
    return {
      date: r.date,
      ts: new Date(r.date).getTime(),
      price: r.price,
      peak,
      dd: r.price / peak - 1,
    };
  });
}

export const BAND_LABELS = [
  { l: "Fire Sale", c: "#6366f1" },
  { l: "BUY!", c: "#3b82f6" },
  { l: "Accumulate", c: "#06b6d4" },
  { l: "Still Cheap", c: "#22c55e" },
  { l: "HODL!", c: "#84cc16" },
  { l: "Bubble?", c: "#f59e0b" },
  { l: "FOMO", c: "#ea580c" },
  { l: "SELL!", c: "#dc2626" },
  { l: "Max Bubble", c: "#8b0000" },
];

export const TARGETS = [
  { price: 1, label: "$1", mc: "$0.9B", c: "#64748b" },
  { price: 6.9, label: "$6.90", mc: "$6.5B", c: "#f59e0b" },
  { price: 69, label: "$69", mc: "$65B", c: "#ef4444" },
  { price: 690, label: "$690", mc: "$648B", c: "#c084fc" },
  { price: 6900, label: "$6,900", mc: "$6.5T", c: "#f472b6" },
];

export function bandVal(m, day, bandIdx) {
  return Math.exp(m.predict(day) + m.bands[bandIdx]);
}

export function bandIndex(m, price, day) {
  const z = Math.log(price) - m.predict(day);
  for (let i = 0; i < m.bands.length - 1; i++) {
    if (z < m.bands[i + 1]) return i;
  }
  return m.bands.length - 2;
}

export function whenHitsCenter(m, price) {
  const targetLn = Math.log(price);
  let lo = 1, hi = 365.25 * 100;
  if (m.predict(hi) < targetLn) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    m.predict(mid) < targetLn ? lo = mid : hi = mid;
  }
  const d = (lo + hi) / 2;
  if (d / 365.25 > 50) return null;
  return { d, y: d / 365.25, dt: new Date(D0 + (d - 1) * 86400000) };
}

export function whenHitsBand(m, price, bandIdx) {
  const targetLn = Math.log(price);
  let lo = 1, hi = 365.25 * 100;
  const valAt = d => m.predict(d) + m.bands[bandIdx];
  if (valAt(hi) < targetLn) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    valAt(mid) < targetLn ? lo = mid : hi = mid;
  }
  const d = (lo + hi) / 2;
  if (d / 365.25 > 50) return null;
  return { d, y: d / 365.25, dt: new Date(D0 + (d - 1) * 86400000) };
}
