// Monthly recap: distil a calendar month's story from the bundled daily snapshots
// (public/history.json) + the frozen rainbow model. Pure — the runner passes the
// history array (and optional live majors). Powers the monthly recap thread.
import { DEFAULT_RAW, SUPPLY } from "../../src/data.js";
import * as M from "../../src/models.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const monthName = ym => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

// month = "2026-06"; history = public/history.json array (daily snapshots, oldest→newest).
export function computeMonthlyRecap(month, history) {
  const m = M.buildModel(DEFAULT_RAW);
  const days = history.filter(r => r.d.startsWith(month) && r.p > 0).sort((a, b) => a.d.localeCompare(b.d));
  if (days.length < 2) return null;
  const first = days[0], last = days.at(-1);
  const open = first.p, close = last.p;

  let hi = -Infinity, lo = Infinity, hiD = first.d, loD = first.d;
  const bandsTouched = new Set();
  let bestDay = { ret: -Infinity, d: null }, worstDay = { ret: Infinity, d: null };
  for (let i = 0; i < days.length; i++) {
    const r = days[i];
    if (r.p > hi) { hi = r.p; hiD = r.d; }
    if (r.p < lo) { lo = r.p; loD = r.d; }
    bandsTouched.add(M.bandIndex(m, r.p, M.dayN(r.d)));
    if (i > 0) {
      const ret = r.p / days[i - 1].p - 1;
      if (ret > bestDay.ret) bestDay = { ret, d: r.d };
      if (ret < worstDay.ret) worstDay = { ret, d: r.d };
    }
  }
  const endBandIdx = M.bandIndex(m, close, M.dayN(last.d));
  const endCenter = Math.exp(m.predict(M.dayN(last.d)));

  // SPX "risk level" 0..100: where price sits in the rainbow's log-residual range
  // (the same lo/hi spread the bands are built from). 0 ≈ deep-value / Fire Sale
  // floor, 100 ≈ stretched / euphoria top. Pairs with crypto Fear & Greed.
  let rLo = Infinity, rHi = -Infinity;
  for (const r of DEFAULT_RAW) { const v = Math.log(r.price) - m.predict(M.dayN(r.date)); if (v < rLo) rLo = v; if (v > rHi) rHi = v; }
  const riskAt = (p, d) => {
    const resid = Math.log(p) - m.predict(M.dayN(d));
    return Math.max(0, Math.min(100, ((resid - rLo) / ((rHi - rLo) || 1)) * 100));
  };

  const withHolders = days.filter(r => r.holders != null);
  const holders = withHolders.length >= 2
    ? { start: withHolders[0].holders, end: withHolders.at(-1).holders, delta: withHolders.at(-1).holders - withHolders[0].holders }
    : null;
  const beLast = [...days].reverse().find(r => r.be != null)?.be ?? null;
  const supLast = [...days].reverse().find(r => r.sup)?.sup ?? null;
  const fngLast = [...days].reverse().find(r => r.fng != null)?.fng ?? null;

  // all-time return at month end (vs the very first bundled print)
  const firstEver = DEFAULT_RAW[0];

  // Diamond-hands supply share over the month, GUARDED against a source/method SEAM.
  // The daily `sup.diamond` figure changed source in Aug 2026 (HolderScan → on-chain FIFO),
  // a ~20pp definitional STEP in a single day that is NOT a real cohort move. Genuine
  // diamond-share aging is well under ~1.5pp/day, so any single-day jump >5pp is a
  // discontinuity — anchor the series to the point AFTER the last such seam so the recap
  // (line + text) compares like with like and never subtracts across a regime change.
  let diamondSeries = days.filter(r => r.sup && r.sup.diamond != null)
    .map(r => [Date.parse(r.d), (r.sup.diamond / SUPPLY) * 100]);
  const SEAM_PP = 5;
  let seamAt = 0;
  for (let i = 1; i < diamondSeries.length; i++) {
    if (Math.abs(diamondSeries[i][1] - diamondSeries[i - 1][1]) > SEAM_PP) seamAt = i;
  }
  if (seamAt > 0) diamondSeries = diamondSeries.slice(seamAt);

  return {
    month, label: monthName(month), days: days.length,
    startDate: first.d, endDate: last.d,
    open, close, change: close / open - 1,
    high: hi, highDate: hiD, low: lo, lowDate: loD,
    endBand: M.BAND_LABELS[endBandIdx], endBandIdx, vsCenter: close / endCenter - 1, center: endCenter,
    bandsTouched: [...bandsTouched].sort((a, b) => a - b).map(i => M.BAND_LABELS[i].l),
    bestDay, worstDay,
    holders,
    avgHolderPnl: beLast ? close / beLast - 1 : null,
    diamondOfTotal: supLast ? supLast.diamond / SUPPLY : null,
    fng: fngLast,
    allTimeReturn: close / firstEver.price - 1,
    priceSeries: days.map(r => [Date.parse(r.d), r.p]),
    holderSeries: withHolders.map(r => [Date.parse(r.d), r.holders]),
    riskSeries: days.map(r => [Date.parse(r.d), riskAt(r.p, r.d)]),
    fngSeries: days.filter(r => r.fng != null).map(r => [Date.parse(r.d), r.fng]),
    diamondSeries,
  };
}
