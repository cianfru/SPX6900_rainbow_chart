// SUPPLY TURNOVER — of all held SPX, what share last changed hands within each time horizon.
// The complement of holding age: HODL Waves asks "held for how long?"; this asks "how much MOVED
// within N?". Reads the FIFO age distribution from onchain.json — the finer `ageFine` (7 buckets,
// [<1d, 1-7d, 7-30d, 1-3m, 3-6m, 6-12m, 1y+]) when the engine has emitted it, else the coarser 5-band
// `age` ([<1m, 1-3m, 3-6m, 6-12m, 1y+]) so it works before the sub-week buckets land in the daily cron.
// Every horizon is CUMULATIVE ("moved within N"), so the numbers only ever increase with the horizon.

// The "moved within" horizons, short → long. `fine:true` ones need `ageFine`; they read null on the
// coarse fallback. `days` is the horizon length (used to label the trend). Warm (recent) → cool (old).
export const HORIZONS = [
  { key: "d1", label: "24 hours", short: "24h", days: 1, c: "#f43f5e", fine: true },
  { key: "w1", label: "1 week", short: "1wk", days: 7, c: "#fb7185", fine: true },
  { key: "m1", label: "1 month", short: "1mo", days: 30, c: "#fb923c", fine: false },
  { key: "m3", label: "3 months", short: "3mo", days: 90, c: "#fbbf24", fine: false },
  { key: "m6", label: "6 months", short: "6mo", days: 180, c: "#38bdf8", fine: false },
  { key: "y1", label: "1 year", short: "1yr", days: 365, c: "#818cf8", fine: false },
];

// One onchain row → cumulative % of held supply that moved within each horizon (+ dormant 1y+).
// Sub-week horizons come back null when only the coarse `age` is available.
export function turnoverOf(row) {
  if (!row) return null;
  const f = Array.isArray(row.ageFine) && row.ageFine.length === 7 ? row.ageFine : null;
  const a = Array.isArray(row.age) && row.age.length === 5 ? row.age : null;
  if (!f && !a) return null;
  const rnd = n => (n == null ? null : +n.toFixed(2));
  let d1 = null, w1 = null, m1, m3, m6, y1;
  if (f) {
    d1 = f[0];
    w1 = f[0] + f[1];
    m1 = f[0] + f[1] + f[2];
    m3 = m1 + f[3];
    m6 = m3 + f[4];
    y1 = m6 + f[5];
  } else {
    m1 = a[0];
    m3 = m1 + a[1];
    m6 = m3 + a[2];
    y1 = m6 + a[3];
  }
  return { d1: rnd(d1), w1: rnd(w1), m1: rnd(m1), m3: rnd(m3), m6: rnd(m6), y1: rnd(y1), dormant: rnd(100 - y1), fine: !!f };
}

// Stacked age bands for the HODL-waves-style "waves" view, bottom (warm, just moved) → top (cool,
// dormant). The finer 7-band split when EVERY row carries ageFine (so the fresh layer breaks out into
// <1d / 1wk / 1mo — the velocity HODL waves can't show), else the coarse 5-band age split.
export const FINE_BANDS = [
  { key: "b0", label: "< 1 day", c: "#f43f5e" },
  { key: "b1", label: "1–7 days", c: "#fb7185" },
  { key: "b2", label: "1–4 weeks", c: "#fb923c" },
  { key: "b3", label: "1–3 months", c: "#fbbf24" },
  { key: "b4", label: "3–6 months", c: "#34d399" },
  { key: "b5", label: "6–12 months", c: "#38bdf8" },
  { key: "b6", label: "1 year+", c: "#818cf8" },
];
export const COARSE_BANDS = [
  { key: "b0", label: "< 1 month", c: "#f87171" },
  { key: "b1", label: "1–3 months", c: "#fb923c" },
  { key: "b2", label: "3–6 months", c: "#fbbf24" },
  { key: "b3", label: "6–12 months", c: "#38bdf8" },
  { key: "b4", label: "1 year+", c: "#818cf8" },
];
export function turnoverStack(onchain) {
  const rows = (onchain || [])
    .filter(r => Array.isArray(r.age) && r.age.length === 5)
    .map(r => ({ r, ts: Date.parse(r.d || r.date) }))
    .filter(x => Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);
  if (rows.length < 2) return null;
  const fine = rows.every(x => Array.isArray(x.r.ageFine) && x.r.ageFine.length === 7);
  const bands = fine ? FINE_BANDS : COARSE_BANDS;
  const data = rows.map(({ r, ts }) => {
    const src = fine ? r.ageFine : r.age;
    const o = { ts };
    bands.forEach((b, i) => { o[b.key] = src[i]; });
    return o;
  });
  return { bands, data, fine };
}

// A time series of the turnover horizons, oldest → newest (for the "over time" view).
export function turnoverSeries(onchain) {
  return (onchain || [])
    .map(row => {
      const t = turnoverOf(row);
      return t ? { ts: Date.parse(row.d || row.date), ...t } : null;
    })
    .filter(x => x && Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);
}
