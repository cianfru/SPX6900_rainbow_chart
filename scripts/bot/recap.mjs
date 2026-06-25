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

  const withHolders = days.filter(r => r.holders != null);
  const holders = withHolders.length >= 2
    ? { start: withHolders[0].holders, end: withHolders.at(-1).holders, delta: withHolders.at(-1).holders - withHolders[0].holders }
    : null;
  const beLast = [...days].reverse().find(r => r.be != null)?.be ?? null;
  const supLast = [...days].reverse().find(r => r.sup)?.sup ?? null;
  const fngLast = [...days].reverse().find(r => r.fng != null)?.fng ?? null;

  // all-time return at month end (vs the very first bundled print)
  const firstEver = DEFAULT_RAW[0];

  return {
    month, label: monthName(month), days: days.length,
    endDate: last.d,
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
  };
}
