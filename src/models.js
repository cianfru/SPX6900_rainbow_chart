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

// Drawdown cycles: each time price makes an all-time high and then declines,
// capture the decline from that peak DOWN TO ITS LOWEST POINT (we stop at the
// trough — once no new low is made, the drawdown is over). Overlaying these
// shows whether later cycles get longer/shallower as the asset matures.
// `minPeakPrice` skips the immature, low-liquidity early ATHs.
export function buildDrawdownCycles(series, { minDepth = 0.3, minPeakPrice = 0 } = {}) {
  if (series.length === 0) return [];
  const dayOf = d => new Date(d).getTime() / 86400000;
  let peak = -Infinity, peakDay = 0, peakDate = series[0].date;
  let cur = null;
  const out = [];
  const close = ongoing => {
    if (cur && cur.peakPrice >= minPeakPrice && (ongoing || cur.minDD <= -minDepth)) {
      // truncate at the trough (deepest point) — peak → bottom only
      let ti = 0;
      for (let i = 1; i < cur.points.length; i++) {
        if (cur.points[i].dd < cur.points[ti].dd) ti = i;
      }
      const trunc = cur.points.slice(0, ti + 1);
      out.push({
        startDate: cur.startDate,
        peakPrice: cur.peakPrice,
        lowDate: cur.points[ti].date,
        minDD: cur.points[ti].dd,
        points: trunc,
        ongoing: !!ongoing,
      });
    }
    cur = null;
  };
  for (const r of series) {
    if (r.price >= peak) {
      close(false);
      peak = r.price; peakDate = r.date; peakDay = dayOf(r.date);
    } else {
      if (!cur) cur = { startDate: peakDate, peakPrice: peak, points: [{ day: 0, dd: 0, date: peakDate }], minDD: 0 };
      const dd = r.price / peak - 1;
      cur.points.push({ day: Math.round(dayOf(r.date) - peakDay), dd, date: r.date });
      if (dd < cur.minDD) cur.minDD = dd;
    }
  }
  close(true); // always include the ongoing drawdown, if any
  return out;
}

// Rally cycles: the mirror of drawdown cycles. Each correction's trough (found by
// buildDrawdownCycles) is a launch pad; from there we measure the climb UP to the
// rally's highest point before the next bottom. Overlaying these shows whether
// later recoveries run higher/longer as the asset matures.
export function buildRallyCycles(series, { minDepth = 0.4, minPeakPrice = 0.05, minGain = 0.3 } = {}) {
  if (series.length === 0) return [];
  const dayOf = d => new Date(d).getTime() / 86400000;
  const idxByDate = new Map(series.map((r, i) => [r.date, i]));

  // Reuse drawdown trough detection so bottoms are defined identically to the
  // drawdown chart. lowPrice = peakPrice × (1 + minDD).
  const dds = buildDrawdownCycles(series, { minDepth, minPeakPrice });
  const bottoms = dds
    .map(c => ({ date: c.lowDate, price: c.peakPrice * (1 + c.minDD), idx: idxByDate.get(c.lowDate) }))
    .filter(b => b.idx != null)
    .sort((a, b) => a.idx - b.idx);

  const out = [];
  for (let k = 0; k < bottoms.length; k++) {
    const start = bottoms[k];
    const end = k + 1 < bottoms.length ? bottoms[k + 1].idx : series.length; // exclusive
    const startDay = dayOf(start.date);
    const points = [{ day: 0, gain: 0, date: start.date }];
    let maxGain = 0, peakDate = start.date, peakIdx = start.idx;
    for (let i = start.idx + 1; i < end; i++) {
      const gain = series[i].price / start.price - 1;
      points.push({ day: Math.round(dayOf(series[i].date) - startDay), gain, date: series[i].date });
      if (gain > maxGain) { maxGain = gain; peakDate = series[i].date; peakIdx = i; }
    }
    if (maxGain < minGain) continue;
    // truncate at the rally's peak — bottom → top only (mirror of drawdown's peak → bottom)
    const ti = points.findIndex(p => p.date === peakDate);
    out.push({
      startDate: start.date,
      lowPrice: start.price,
      peakDate,
      maxGain,
      points: points.slice(0, ti + 1),
      // ongoing if this is the latest bottom and price is still at/near its rally high
      ongoing: end === series.length && peakIdx >= series.length - 1,
    });
  }
  return out;
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
