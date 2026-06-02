import { D0 } from "./data.js";

export function dayN(ds) {
  return Math.max(1, Math.round((new Date(ds).getTime() - D0) / 86400000) + 1);
}

export function ds(day) {
  return new Date(D0 + (day - 1) * 86400000).toISOString().slice(0, 10);
}

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

function buildSymmetricBands(std) {
  return [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5].map(z => z * std);
}

export function buildModels(RAW) {
  const pts = RAW.map(r => ({ day: dayN(r.date), lnP: Math.log(r.price) }));

  // Model 1: Offset Power Law
  const OFFSET_T0 = 281.2;
  const offsetPts = RAW.map(r => ({ day: dayN(r.date) + OFFSET_T0, lnP: Math.log(r.price) }));
  const offsetFit = wlsFitPowerLaw(offsetPts);
  const offsetPredict = day => offsetFit.a * Math.log(day + OFFSET_T0) + offsetFit.b;
  const offsetResid = computeResiduals(pts, offsetPredict);
  const offsetStd = Math.sqrt(offsetResid.reduce((s, r) => s + r * r, 0) / offsetResid.length);

  // Model 2: Weighted Power Law
  const wlsFit = wlsFitPowerLaw(pts, 3.0);
  const wlsPredict = day => wlsFit.a * Math.log(day) + wlsFit.b;
  const wlsResid = computeResiduals(pts, wlsPredict);
  const wlsStd = Math.sqrt(wlsResid.reduce((s, r) => s + r * r, 0) / wlsResid.length);

  // Model 3: Log-Quadratic
  const lqFit = fitLogQuadratic(pts, 2.0);
  const lqPredict = day => {
    const x = Math.log(day);
    return lqFit.a2 * x * x + lqFit.b1 * x + lqFit.c;
  };
  const lqResid = computeResiduals(pts, lqPredict);
  const lqStd = Math.sqrt(lqResid.reduce((s, r) => s + r * r, 0) / lqResid.length);

  // Model 4: Full dataset equal weight
  const fullFit = wlsFitPowerLaw(pts);
  const fullPredict = day => fullFit.a * Math.log(day) + fullFit.b;
  const fullResid = computeResiduals(pts, fullPredict);
  const fullStd = Math.sqrt(fullResid.reduce((s, r) => s + r * r, 0) / fullResid.length);

  return {
    logquad: {
      key: "logquad", name: "Log-Quadratic",
      desc: "Curved fit — captures S-shape inflection",
      predict: lqPredict, bands: buildPercentileBands(lqResid),
      std: lqStd, r2: computeR2(pts, lqPredict),
      formula: `ln(P) = ${lqFit.a2.toFixed(3)}×(ln t)² + ${lqFit.b1.toFixed(3)}×ln t + ${lqFit.c.toFixed(3)}`,
      note: "Weighted log-quadratic with asymmetric percentile bands. Captures curvature in growth trajectory.",
      bandType: "percentile",
    },
    offset: {
      key: "offset", name: "Offset Power Law",
      desc: "Virtual origin — best linear log-log fit",
      predict: offsetPredict, bands: buildPercentileBands(offsetResid),
      std: offsetStd, r2: computeR2(pts, offsetPredict),
      formula: `ln(P) = ${offsetFit.a.toFixed(3)}×ln(t+281) + ${(offsetFit.b).toFixed(3)}`,
      note: "Virtual origin ~Nov 2022. Asymmetric percentile bands. Strong in mid-range.",
      bandType: "percentile",
    },
    weighted: {
      key: "weighted", name: "Weighted Recent",
      desc: "Emphasizes recent price action",
      predict: wlsPredict, bands: buildPercentileBands(wlsResid),
      std: wlsStd, r2: computeR2(pts, wlsPredict),
      formula: `ln(P) = ${wlsFit.a.toFixed(3)}×ln(t) + ${(wlsFit.b).toFixed(3)}`,
      note: "Exponential weighting (λ=3) gives recent data 20× more influence. Asymmetric bands.",
      bandType: "percentile",
    },
    full: {
      key: "full", name: "Full Dataset",
      desc: "Conservative, all data equal weight",
      predict: fullPredict, bands: buildSymmetricBands(fullStd),
      std: fullStd, r2: computeR2(pts, fullPredict),
      formula: `ln(P) = ${fullFit.a.toFixed(3)}×ln(t) + ${(fullFit.b).toFixed(3)}`,
      note: "All data points, equal weight, symmetric σ bands. Most conservative projection.",
      bandType: "symmetric",
    },
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
