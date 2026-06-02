import { D0 } from "./data.js";

export function dayN(ds) {
  return Math.max(1, Math.round((new Date(ds).getTime() - D0) / 86400000) + 1);
}

export function ds(day) {
  return new Date(D0 + (day - 1) * 86400000).toISOString().slice(0, 10);
}

function fitLogQuadratic(data, lambda = 0) {
  const N = data.length;
  let S = new Float64Array(5);
  let T = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    const { day, lnP: y } = data[i];
    const x = Math.log(day);
    const w = lambda > 0 ? Math.exp(lambda * i / N) : 1;
    let xp = 1;
    for (let j = 0; j < 5; j++) { S[j] += w * xp; xp *= x; }
    T[0] += w * y; T[1] += w * x * y; T[2] += w * x * x * y;
  }
  const M = [
    [S[0], S[1], S[2], T[0]],
    [S[1], S[2], S[3], T[1]],
    [S[2], S[3], S[4], T[2]],
  ];
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
  return { c: sol[0], b1: sol[1], a2: sol[2] };
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
  const lqFit = fitLogQuadratic(pts, 2.0);
  const predict = day => {
    const x = Math.log(day);
    return lqFit.a2 * x * x + lqFit.b1 * x + lqFit.c;
  };
  const resid = computeResiduals(pts, predict);
  const std = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / resid.length);

  return {
    name: "Log-Quadratic",
    predict,
    bands: buildPercentileBands(resid),
    std,
    r2: computeR2(pts, predict),
    formula: `ln(P) = ${lqFit.a2.toFixed(3)}×(ln t)² + ${lqFit.b1.toFixed(3)}×ln t + ${lqFit.c.toFixed(3)}`,
    note: "Weighted log-quadratic regression with asymmetric percentile bands (p2 to p98). Captures the S-curve growth trajectory typical of early-stage memecoins.",
  };
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
