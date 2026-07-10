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
// `ath` (optional {price, date}) is the true intraday high-water mark — the weekly-thinned
// close series misses the intraday ATH spike, so from ath.date on we floor the running peak
// to ath.price. The price LINE stays on real closes; only the drawdown depth reflects the
// true high (so the top may show price a bit below a fresh-high, which is honest).
export function buildDrawdownSeries(series, ath = null) {
  let peak = -Infinity;
  const athTs = ath && ath.price > 0 ? new Date(ath.date).getTime() : null;
  return series.map(r => {
    if (r.price > peak) peak = r.price;
    const ts = new Date(r.date).getTime();
    if (athTs != null && ts >= athTs && ath.price > peak) peak = ath.price;
    return { date: r.date, ts, price: r.price, peak, dd: r.price / peak - 1 };
  });
}

// Drawdown cycles: each time price makes an all-time high and then declines,
// capture the decline from that peak DOWN TO ITS LOWEST POINT (we stop at the
// trough — once no new low is made, the drawdown is over). Overlaying these
// shows whether later cycles get longer/shallower as the asset matures.
// `minPeakPrice` skips the immature, low-liquidity early ATHs.
// `ath` (optional {price, date}) steps the running high-water mark up to the true
// intraday ATH the weekly bundle misses, so the CURRENT cycle shows the real depth
// (e.g. from $2.28, not the $1.82 close). Opt-in — callers that want close-based cycles
// (the fire-sale/rally derivation) just omit it.
export function buildDrawdownCycles(series, { minDepth = 0.3, minPeakPrice = 0, ath = null } = {}) {
  if (series.length === 0) return [];
  const dayOf = d => new Date(d).getTime() / 86400000;
  const athTs = ath && ath.price > 0 ? new Date(ath.date).getTime() : null;
  let peak = -Infinity, peakDay = 0, peakDate = series[0].date, athApplied = false;
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
    // At (or first past) the ATH date, step the high-water mark to the true intraday high
    // once — the close there sits below it, so the cycle from the ATH shows the real depth.
    if (athTs != null && !athApplied && new Date(r.date).getTime() >= athTs && ath.price > peak) {
      close(false);
      peak = ath.price; peakDate = ath.date; peakDay = dayOf(ath.date); athApplied = true;
    }
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

// Shared core: given launch-pad anchors (sorted by index), measure the climb from
// each anchor to its highest point before the next anchor, truncating at that peak.
function ralliesFromAnchors(series, anchors, minGain) {
  const dayOf = d => new Date(d).getTime() / 86400000;
  const out = [];
  for (let k = 0; k < anchors.length; k++) {
    const a0 = anchors[k].idx;
    const end = k + 1 < anchors.length ? anchors[k + 1].idx : series.length; // exclusive
    // Peak = the highest price in the window; the rally is the climb up to it.
    let peakIdx = a0;
    for (let i = a0 + 1; i < end; i++) if (series[i].price > series[peakIdx].price) peakIdx = i;
    // Re-anchor to the true low BEFORE that peak, so the climb starts at the real
    // bottom (no dip below its own start) — without pulling the anchor past the
    // peak, which would erase the rally. The detected trough isn't always the
    // actual low (a deeper low can precede the run).
    let startIdx = a0;
    for (let i = a0 + 1; i <= peakIdx; i++) if (series[i].price < series[startIdx].price) startIdx = i;
    const start = series[startIdx];
    const startDay = dayOf(start.date);
    const points = [];
    let maxGain = 0;
    for (let i = startIdx; i <= peakIdx; i++) {
      const gain = series[i].price / start.price - 1;
      points.push({ day: Math.round(dayOf(series[i].date) - startDay), gain, date: series[i].date });
      if (gain > maxGain) maxGain = gain;
    }
    if (maxGain < minGain) continue;
    out.push({
      startDate: start.date,
      lowPrice: start.price,
      peakDate: series[peakIdx].date,
      maxGain,
      points,
      ongoing: end === series.length && peakIdx >= series.length - 1,
    });
  }
  return out;
}

// Rally cycles: the mirror of drawdown cycles. Each correction's trough (found by
// buildDrawdownCycles) is a launch pad; from there we measure the climb UP to the
// rally's highest point before the next bottom. Overlaying these shows whether
// later recoveries run higher/longer as the asset matures.
export function buildRallyCycles(series, { minDepth = 0.4, minPeakPrice = 0.05, minGain = 0.3 } = {}) {
  if (series.length === 0) return [];
  const idxByDate = new Map(series.map((r, i) => [r.date, i]));
  // Reuse drawdown trough detection so bottoms are defined identically to the
  // drawdown chart. lowPrice = peakPrice × (1 + minDD).
  const dds = buildDrawdownCycles(series, { minDepth, minPeakPrice });
  const anchors = dds
    .map(c => ({ date: c.lowDate, price: c.peakPrice * (1 + c.minDD), idx: idxByDate.get(c.lowDate) }))
    .filter(b => b.idx != null)
    .sort((a, b) => a.idx - b.idx);
  return ralliesFromAnchors(series, anchors, minGain);
}

// Fire-sale rallies: anchor each rally at the lowest price of a contiguous
// "Fire Sale" (cheapest band) episode, then ride to the next local peak. Answers
// "if you bought every time price hit the capitulation band, how did it run?"
export function buildFireSaleRallies(series, m, { minGain = 0.3 } = {}) {
  if (!m || series.length === 0) return [];
  const anchors = [];
  let inEpisode = false, epLowIdx = -1, epLowPrice = Infinity;
  const flush = () => {
    if (epLowIdx >= 0) anchors.push({ date: series[epLowIdx].date, price: series[epLowIdx].price, idx: epLowIdx });
    inEpisode = false; epLowIdx = -1; epLowPrice = Infinity;
  };
  for (let i = 0; i < series.length; i++) {
    const inFireSale = bandIndex(m, series[i].price, dayN(series[i].date)) === 0;
    if (inFireSale) {
      inEpisode = true;
      if (series[i].price < epLowPrice) { epLowPrice = series[i].price; epLowIdx = i; }
    } else if (inEpisode) {
      flush();
    }
  }
  if (inEpisode) flush();

  // Coalesce troughs that belong to the SAME capitulation. A brief pop out of the
  // fire-sale band and back in (a choppy bottom) otherwise splits one event into
  // several anchors — and a shallow re-dip can mask the true low, since the deeper
  // trough's rally gets truncated at the re-dip and dropped for being < minGain.
  // Merge consecutive anchors unless price staged a real rally (>= minGain) between
  // them, keeping the LOWEST trough so the anchor is the actual capitulation low.
  const coalesced = [];
  for (const a of anchors) {
    const prev = coalesced[coalesced.length - 1];
    if (prev) {
      let peakBetween = 0;
      for (let i = prev.idx + 1; i < a.idx; i++) if (series[i].price > peakBetween) peakBetween = series[i].price;
      if (peakBetween / prev.price - 1 < minGain) { // no real rally between → same event
        if (a.price < prev.price) { prev.date = a.date; prev.price = a.price; prev.idx = a.idx; }
        continue;
      }
    }
    coalesced.push({ ...a });
  }
  return ralliesFromAnchors(series, coalesced, minGain);
}

// Golden/death cross: 50-day vs 200-day simple moving averages. Interpolates the
// (irregularly-sampled) price history to a DAILY series first, then rolls true SMAs
// over it — so the MAs are smooth even across the sparse early history. Returns the
// daily rows (where the 200-MA exists), the cross events, and today's state. Shared by
// the card, its copy and the Quant so they can't drift.
export function goldenCross(series) {
  const s = (series || []).filter(r => r.price > 0).map(r => ({ t: new Date(r.date).getTime(), p: r.price })).sort((a, b) => a.t - b.t);
  if (s.length < 2) return { rows: [], crosses: [], price: null, ma50: null, ma200: null, gap: null };
  const DAY = 86400000;
  // daily linear-interpolated price series
  const d = [];
  for (let t = s[0].t, j = 0; t <= s.at(-1).t; t += DAY) {
    while (j + 1 < s.length && s[j + 1].t <= t) j++;
    let p = s[j].p;
    if (j + 1 < s.length && s[j + 1].t > s[j].t) { const f = (t - s[j].t) / (s[j + 1].t - s[j].t); p = s[j].p + (s[j + 1].p - s[j].p) * f; }
    d.push({ t, p });
  }
  // running-sum rolling SMAs
  const ma = n => { const out = Array(d.length).fill(null); let sum = 0; for (let i = 0; i < d.length; i++) { sum += d[i].p; if (i >= n) sum -= d[i - n].p; if (i >= n - 1) out[i] = sum / n; } return out; };
  const m50 = ma(50), m200 = ma(200);
  const rows = d.map((r, i) => ({ ts: r.t, p: r.p, ma50: m50[i], ma200: m200[i] })).filter(r => r.ma200 != null);
  const crosses = [];
  for (let i = 1; i < rows.length; i++) {
    const pa = rows[i - 1].ma50 - rows[i - 1].ma200, pb = rows[i].ma50 - rows[i].ma200;
    if (pa <= 0 && pb > 0) crosses.push({ ts: rows[i].ts, y: rows[i].ma50, type: "golden" });
    if (pa >= 0 && pb < 0) crosses.push({ ts: rows[i].ts, y: rows[i].ma50, type: "death" });
  }
  const last = rows.at(-1) || { p: null, ma50: null, ma200: null };
  return { rows, crosses, price: last.p, ma50: last.ma50, ma200: last.ma200, gap: (last.ma50 && last.ma200) ? last.ma50 / last.ma200 - 1 : null };
}

// Shared phrasing for the golden/death cross state (card, copy, Quant agree).
export function crossState(gap) {
  if (gap == null) return { label: "", watch: "", color: "#94a3b8" };
  if (gap >= 0) return { label: "50D above 200D", watch: gap < 0.05 ? "golden cross — fresh" : "", color: "#4ade80" };
  return { label: `50D ${Math.round(gap * 100)}% below 200D`, watch: gap > -0.06 ? "▲ golden-cross watch" : "", color: "#f87171" };
}

// Pi Cycle ratio = 111-day MA / (350-day MA × 2) — the CONTINUOUS "MAs Divided" gauge
// from Bitcoin's Pi Cycle Top indicator (350/111 ≈ π). >1 = top zone, <0.5 = historically
// an accumulation zone. We use the ratio as a descriptive extension gauge (NOT the binary
// "top in 3 days" cross, which is overfit for a ~2yr memecoin) — clearly "a Bitcoin
// indicator applied to SPX, for context". Same daily-interpolation as goldenCross so the
// MAs are smooth across sparse early history. Returns the ratio rows (where the 350-MA
// exists), the current point, the peak, and threshold-cross events. Shared by card+chart.
export function piCycleRatio(series) {
  const s = (series || []).filter(r => r.price > 0).map(r => ({ t: new Date(r.date).getTime(), p: r.price })).sort((a, b) => a.t - b.t);
  const empty = { rows: [], cur: null, peak: null, crosses: [] };
  if (s.length < 2) return empty;
  const DAY = 86400000;
  const d = [];
  for (let t = s[0].t, j = 0; t <= s.at(-1).t; t += DAY) {
    while (j + 1 < s.length && s[j + 1].t <= t) j++;
    let p = s[j].p;
    if (j + 1 < s.length && s[j + 1].t > s[j].t) { const f = (t - s[j].t) / (s[j + 1].t - s[j].t); p = s[j].p + (s[j + 1].p - s[j].p) * f; }
    d.push({ t, p });
  }
  const ma = n => { const out = Array(d.length).fill(null); let sum = 0; for (let i = 0; i < d.length; i++) { sum += d[i].p; if (i >= n) sum -= d[i - n].p; if (i >= n - 1) out[i] = sum / n; } return out; };
  const m111 = ma(111), m350 = ma(350);
  const rows = [];
  for (let i = 0; i < d.length; i++) if (m111[i] != null && m350[i] != null) rows.push({ ts: d[i].t, price: d[i].p, ma111: m111[i], ma350: m350[i], ratio: m111[i] / (m350[i] * 2) });
  if (!rows.length) return empty;
  const crosses = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].ratio, b = rows[i].ratio;
    if (a < 1 && b >= 1) crosses.push({ ts: rows[i].ts, ratio: b, type: "top" });
    if (a >= 1 && b < 1) crosses.push({ ts: rows[i].ts, ratio: b, type: "cooldown" });
    if (a > 0.5 && b <= 0.5) crosses.push({ ts: rows[i].ts, ratio: b, type: "accumulation" });
  }
  const peak = rows.reduce((m, r) => r.ratio > m.ratio ? r : m, rows[0]);
  // Zone thresholds (owner-tuned 2026-07-08 after checking BTC vs SPX on the same math):
  //  • ACCUMULATION side stays at Bitcoin's fixed 0.5 / 0.4 — validated: SPX sits below 0.5
  //    ~30% of the time, almost exactly BTC's ~31%, so those levels transfer cleanly.
  //  • The TOP is TILTED UP to SPX's own distribution — SPX runs far hotter than BTC (above
  //    1.0 ~26% of the time vs BTC's ~8%), so BTC's "top = 1.0" fires far too often for SPX.
  //    We use SPX's p90 (≈1.4–1.5, matching BTC's ~8% rarity at 1.0). BTC_TOP (1.0) is kept
  //    only as a light reference line ("Bitcoin's top line"), not an SPX zone boundary.
  const sorted = rows.map(r => r.ratio).slice().sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const zones = { deep: 0.4, accum: 0.5, top: Math.max(1.1, q(0.90)), btcTop: 1.0 };
  return { rows, cur: rows.at(-1), peak, crosses, zones };
}

// Shared phrasing/zone for the current Pi Cycle ratio against SPX's zones (card, copy,
// chart agree). `zones` comes from piCycleRatio(...).zones — fixed 0.5/0.4 accumulation,
// SPX-calibrated top.
export function piCycleState(ratio, zones) {
  if (ratio == null || !zones) return { label: "", zone: "", color: "#94a3b8" };
  if (ratio >= zones.top) return { label: "top zone", zone: "top", color: "#f87171" };
  if (ratio >= zones.accum) return { label: "mid-range", zone: "fair", color: "#94a3b8" };
  if (ratio >= zones.deep) return { label: "accumulation zone", zone: "accum", color: "#38bdf8" };
  return { label: "deep accumulation", zone: "deep", color: "#4ade80" };
}

// Underwater summary for the drawdown card + its copy (one source so they agree):
// the drawdown series plus headline stats — current dd, deepest ever, and how many
// times price returned to a fresh all-time high (dd back to ~0), i.e. the recovery
// count that makes the "deep dip → new ATH" rhythm concrete.
export function drawdownSummary(series, ath = null) {
  const dd = buildDrawdownSeries(series, ath);
  let deepest = 0, athCount = 0, below = false;
  for (const r of dd) {
    if (r.dd < deepest) deepest = r.dd;
    if (r.dd >= -0.001) { if (below) { athCount++; below = false; } } else below = true;
  }
  return { series: dd, current: dd.length ? dd.at(-1).dd : 0, deepest, athCount };
}

// Fire-sale rallies with the CURRENT (last) episode extended to the live price. Each
// COMPLETED rally stays low→peak ("how far the climb ran"); the last one is redrawn
// low→today so its endpoint is the REAL current gain — its peak may be behind it. A
// rally ENDS only when price re-enters the Fire Sale band (a fresh anchor), NOT on a %
// pullback (deep dips are routine in crypto, so a % threshold would end rallies on
// noise). Adds {live, peakGain, nowGain, daysSince, offPeak} to the current rally.
export function buildFireSaleRalliesLive(series, m, opts = {}) {
  const rallies = buildFireSaleRallies(series, m, opts).map(c => ({ ...c, points: c.points.slice() }));
  const cur = rallies[rallies.length - 1];
  if (!cur) return rallies;
  const lowIdx = series.findIndex(r => r.date === cur.startDate);
  if (lowIdx < 0) return rallies;
  const low = series[lowIdx].price, startDay = new Date(cur.startDate).getTime() / 86400000;
  cur.peakGain = cur.maxGain; // the high-water mark of this episode
  cur.points = series.slice(lowIdx).map(r => ({ day: Math.round(new Date(r.date).getTime() / 86400000 - startDay), gain: r.price / low - 1, date: r.date }));
  cur.nowGain = cur.points[cur.points.length - 1].gain;
  cur.daysSince = cur.points[cur.points.length - 1].day;
  cur.offPeak = cur.peakGain > 0 ? (1 + cur.nowGain) / (1 + cur.peakGain) - 1 : 0; // ≤0, how far below the peak now
  cur.live = true;
  return rallies;
}

// Hindsight strategy: start with 1×, buy each cycle low and sell at that cycle's
// peak (compounding), sitting in cash between cycles. Returns an equity curve vs a
// HODL-from-first-low baseline. Perfect timing — illustrative, not achievable live.
export function buildCycleStrategy(series, cycles) {
  if (!series.length || !cycles.length) return null;
  const idxByDate = new Map(series.map((r, i) => [r.date, i]));
  const cyc = cycles
    .map(c => ({ low: c.lowPrice, maxGain: c.maxGain, bIdx: idxByDate.get(c.startDate), pIdx: idxByDate.get(c.peakDate) }))
    .filter(c => c.bIdx != null && c.pIdx != null)
    .sort((a, b) => a.bIdx - b.bIdx);
  if (!cyc.length) return null;

  const startIdx = cyc[0].bIdx;
  const startPrice = series[startIdx].price;
  const rows = [];
  let realized = 1, k = 0; // realized = locked-in equity from completed sells
  for (let i = startIdx; i < series.length; i++) {
    const price = series[i].price;
    // bank any cycles whose peak we've passed
    while (k < cyc.length && i > cyc[k].pIdx) { realized *= (1 + cyc[k].maxGain); k++; }
    const inMarket = k < cyc.length && i >= cyc[k].bIdx && i <= cyc[k].pIdx;
    const strat = inMarket ? realized * (price / cyc[k].low) : realized;
    rows.push({ ts: new Date(series[i].date).getTime(), date: series[i].date, strat, hodl: price / startPrice });
  }
  const last = rows[rows.length - 1];
  return { rows, stratRet: last.strat - 1, hodlRet: last.hodl - 1, startDate: series[startIdx].date };
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
