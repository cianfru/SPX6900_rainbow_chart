import { RAW, D0 } from "./data.js";

export function dayN(ds) {
  return Math.max(1, Math.round((new Date(ds).getTime() - D0) / 86400000) + 1);
}

export function ds(day) {
  return new Date(D0 + (day - 1) * 86400000).toISOString().slice(0, 10);
}

// --- Fitting utilities (all run once at import time) ---

function wlsFitPowerLaw(data, lambda = 0) {
  const N = data.length;
  let Sw = 0, Swx = 0, Swy = 0, Swxx = 0, Swxy = 0;
  for (let i = 0; i < N; i++) {
    const { day, lnP: y } = data[i];
    const x = Math.log(day);
    const w = lambda > 0 ? Math.exp(lambda * i / N) : 1;
    Sw += w; Swx += w * x; Swy += w * y;
    Swxx += w * x * x; Swxy += w * x * y;
  }
  const det = Sw * Swxx - Swx * Swx;
  const a = (Sw * Swxy - Swx * Swy) / det;
  const b = (Swxx * Swy - Swx * Swxy) / det;
  return { a, b };
}

function fitLogQuadratic(data, lambda = 0) {
  const N = data.length;
  let S = new Float64Array(5); // x^0..x^4
  let T = new Float64Array(3); // x^0*y, x^1*y, x^2*y
  for (let i = 0; i < N; i++) {
    const { day, lnP: y } = data[i];
    const x = Math.log(day);
    const w = lambda > 0 ? Math.exp(lambda * i / N) : 1;
    let xp = 1;
    for (let j = 0; j < 5; j++) { S[j] += w * xp; xp *= x; }
    T[0] += w * y; T[1] += w * x * y; T[2] += w * x * x * y;
  }
  // Solve 3x3 normal equations: [S0 S1 S2; S1 S2 S3; S2 S3 S4] * [c b a] = [T0 T1 T2]
  const M = [
    [S[0], S[1], S[2], T[0]],
    [S[1], S[2], S[3], T[1]],
    [S[2], S[3], S[4], T[2]],
  ];
  // Gaussian elimination
  for (let col = 0; col < 3; col++) {
    let maxR = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[maxR][col])) maxR = r;
    [M[col], M[maxR]] = [M[maxR], M[col]];
    for (let r = col + 1; r < 3; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  const sol = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let v = M[r][3];
    for (let c = r + 1; c < 3; c++) v -= M[r][c] * sol[c];
    sol[r] = v / M[r][r];
  }
  return { c: sol[0], b1: sol[1], a2: sol[2] }; // c + b1*ln(t) + a2*ln(t)^2
}

function computeResiduals(data, predict) {
  return data.map(d => d.lnP - predict(d.day));
}

function computeStats(residuals) {
  const N = residuals.length;
  const mean = residuals.reduce((s, r) => s + r, 0) / N;
  const std = Math.sqrt(residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / N);
  const sorted = [...residuals].sort((a, b) => a - b);
  const pct = p => {
    const idx = p * (N - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const ss_res = residuals.reduce((s, r) => s + r * r, 0);
  const ss_tot = residuals.reduce((s, r) => s + (r - mean) ** 2, 0) + N * mean * mean;
  const meanLnP = residuals.reduce((s, _, i) => s, 0); // not needed, r2 uses raw
  return { mean, std, pct, ss_res };
}

function computeR2(data, predict) {
  const N = data.length;
  const meanY = data.reduce((s, d) => s + d.lnP, 0) / N;
  const ss_tot = data.reduce((s, d) => s + (d.lnP - meanY) ** 2, 0);
  const ss_res = data.reduce((s, d) => s + (d.lnP - predict(d.day)) ** 2, 0);
  return 1 - ss_res / ss_tot;
}

// Prepare data points
const pts = RAW.map(r => ({ day: dayN(r.date), lnP: Math.log(r.price) }));
const ptsTrimmed = pts.filter(p => p.day > 90);

// --- Model 1: Offset Power Law (original best fit) ---
const OFFSET_T0 = 281.2;
const offsetPts = RAW.map(r => ({ day: dayN(r.date) + OFFSET_T0, lnP: Math.log(r.price) }));
const offsetFit = wlsFitPowerLaw(offsetPts);
const offsetPredict = day => offsetFit.a * Math.log(day + OFFSET_T0) + offsetFit.b;
const offsetResid = computeResiduals(pts, offsetPredict);
const offsetStats = computeStats(offsetResid);
const offsetR2 = computeR2(pts, offsetPredict);

// --- Model 2: Weighted Power Law (recent data emphasized) ---
const wlsFit = wlsFitPowerLaw(pts, 3.0);
const wlsPredict = day => wlsFit.a * Math.log(day) + wlsFit.b;
const wlsResid = computeResiduals(pts, wlsPredict);
const wlsStats = computeStats(wlsResid);
const wlsR2 = computeR2(pts, wlsPredict);

// --- Model 3: Log-Quadratic ---
const lqFit = fitLogQuadratic(pts, 2.0);
const lqPredict = day => {
  const x = Math.log(day);
  return lqFit.a2 * x * x + lqFit.b1 * x + lqFit.c;
};
const lqResid = computeResiduals(pts, lqPredict);
const lqStats = computeStats(lqResid);
const lqR2 = computeR2(pts, lqPredict);

// --- Model 4: Original full dataset (conservative) ---
const fullFit = wlsFitPowerLaw(pts);
const fullPredict = day => fullFit.a * Math.log(day) + fullFit.b;
const fullResid = computeResiduals(pts, fullPredict);
const fullStats = computeStats(fullResid);
const fullR2 = computeR2(pts, fullPredict);

// Asymmetric percentile bands for each model
function buildPercentileBands(residuals) {
  const sorted = [...residuals].sort((a, b) => a - b);
  const N = sorted.length;
  const pct = p => {
    const idx = p * (N - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  // 9 band edges from bottom to top
  return [
    pct(0.02),  // -2σ equivalent (fire sale floor)
    pct(0.07),
    pct(0.16),  // -1σ
    pct(0.30),
    pct(0.50),  // median
    pct(0.70),
    pct(0.84),  // +1σ
    pct(0.93),
    pct(0.98),  // +2σ equivalent
    pct(0.995), // +2.5σ (max bubble ceiling)
  ];
}

function buildSymmetricBands(std) {
  return [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5].map(z => z * std);
}

const offsetBands = buildPercentileBands(offsetResid);
const wlsBands = buildPercentileBands(wlsResid);
const lqBands = buildPercentileBands(lqResid);
const fullBands = buildSymmetricBands(fullStats.std);

export const MODELS = {
  logquad: {
    key: "logquad",
    name: "Log-Quadratic",
    desc: "Curved fit — captures S-shape inflection",
    predict: lqPredict,
    bands: lqBands,
    std: lqStats.std,
    r2: lqR2,
    formula: `ln(P) = ${lqFit.a2.toFixed(3)}×(ln t)² + ${lqFit.b1.toFixed(3)}×ln t + ${lqFit.c.toFixed(3)}`,
    note: "Weighted log-quadratic with asymmetric percentile bands. Captures curvature in growth trajectory.",
    bandType: "percentile",
  },
  offset: {
    key: "offset",
    name: "Offset Power Law",
    desc: "Virtual origin — best linear log-log fit",
    predict: offsetPredict,
    bands: offsetBands,
    std: offsetStats.std,
    r2: offsetR2,
    formula: `ln(P) = ${offsetFit.a.toFixed(3)}×ln(t+281) + ${(offsetFit.b).toFixed(3)}`,
    note: "Virtual origin ~Nov 2022. Asymmetric percentile bands. Strong in mid-range.",
    bandType: "percentile",
  },
  weighted: {
    key: "weighted",
    name: "Weighted Recent",
    desc: "Emphasizes recent price action",
    predict: wlsPredict,
    bands: wlsBands,
    std: wlsStats.std,
    r2: wlsR2,
    formula: `ln(P) = ${wlsFit.a.toFixed(3)}×ln(t) + ${(wlsFit.b).toFixed(3)}`,
    note: "Exponential weighting (λ=3) gives recent data 20× more influence. Asymmetric bands.",
    bandType: "percentile",
  },
  full: {
    key: "full",
    name: "Full Dataset",
    desc: "Conservative, all data equal weight",
    predict: fullPredict,
    bands: fullBands,
    std: fullStats.std,
    r2: fullR2,
    formula: `ln(P) = ${fullFit.a.toFixed(3)}×ln(t) + ${(fullFit.b).toFixed(3)}`,
    note: "All data points, equal weight, symmetric σ bands. Most conservative projection.",
    bandType: "symmetric",
  },
};

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

// Band value at a given day for model m
export function bandVal(m, day, bandIdx) {
  const lnCenter = m.predict(day);
  return Math.exp(lnCenter + m.bands[bandIdx]);
}

// Which band index is the price in?
export function bandIndex(m, price, day) {
  const z = Math.log(price) - m.predict(day);
  for (let i = 0; i < m.bands.length - 1; i++) {
    if (z < m.bands[i + 1]) return i;
  }
  return m.bands.length - 2;
}

// When does the center/band line hit a price?
export function whenHits(m, price, bandOffset = 0) {
  const targetLn = Math.log(price);
  let lo = 1, hi = 365.25 * 100;
  const valAt = d => m.predict(d) + (typeof bandOffset === 'number' ? m.bands[bandOffset] || 0 : 0);
  if (typeof bandOffset === 'number' && bandOffset >= 0 && bandOffset < m.bands.length) {
    if (valAt(hi) < targetLn) return null;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      valAt(mid) < targetLn ? lo = mid : hi = mid;
    }
  } else {
    // Center line
    if (m.predict(hi) < targetLn) return null;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      m.predict(mid) < targetLn ? lo = mid : hi = mid;
    }
  }
  const d = (lo + hi) / 2;
  const y = d / 365.25;
  if (y > 50) return null;
  return { d, y, dt: new Date(D0 + (d - 1) * 86400000) };
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
