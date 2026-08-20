// ANOMALY RADAR — a GENERIC, across-the-board scanner. Instead of N hand-written detectors (which only
// catch what someone thought to code), this walks EVERY numeric series in the daily feeds and flags any
// whose latest value is statistically far from its own recent history. So an abnormal move in ANY metric
// — concentration, gini, a HODL band, SOPR, liveliness, a specific balance — surfaces on its own, with no
// bespoke detector required. The bespoke detectors keep the honest narrative framing for the headline
// signals; this is the safety net that guarantees nothing weird passes unseen.
//
// ROBUST by design: uses median + MAD (not mean/σ) so one past spike can't hide a new one, references a
// TRAILING window excluding the last few points, and gates on BOTH a high robust-z AND a non-trivial
// relative move (so a rounding wiggle on a flat series never reads as "10σ"). Ranked by |z|. It is honest
// about the multiple-comparisons cost: scanning ~40 series, it reports the count and ranks, never claims
// each is independently meaningful.

const median = a => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// robust z of the latest point vs a SHORT trailing window (excluding the last `skip` points). A short
// reference is deliberate: it turns this into a JUMP detector — a slow healthy trend blends into its own
// recent window (latest ≈ recent median → low z), while a sudden spike stands far out. That's what keeps
// "1y+ supply drifting up 12% over a quarter" from reading as an anomaly while a one-day exit wave screams.
function robustZ(series, { win = 28, skip = 2 } = {}) {
  const s = series.filter(Number.isFinite);
  if (s.length < 30) return null;
  const latest = s[s.length - 1];
  const ref = s.slice(-(win + skip), -skip);
  if (ref.length < 20) return null;
  const med = median(ref);
  const mad = median(ref.map(x => Math.abs(x - med)));
  const scale = 1.4826 * mad || Math.abs(med) * 0.02 || 1e-9;   // MAD→σ; floor prevents divide-by-zero on flat series
  const z = (latest - med) / scale;
  const rel = med !== 0 ? (latest - med) / Math.abs(med) : (latest === 0 ? 0 : 1);
  return { z, latest, med, rel };
}

// Series registry. onchain + history are auto-enumerated (numeric fields), so a NEW field added to the
// FIFO engine is scanned automatically — future-proof. A skip-list drops price (its own rainbow), arrays/
// objects, and near-duplicate balances; LABELS/CHART give a human name + click-through. Extra series-
// shaped feeds (exit-flow supply, cex organic flow, valuation composite/axes) are added explicitly.
const SKIP = new Set(["d", "date", "spot", "p", "tiers", "wealth", "cexVenues", "coinDays", "heldTokens",
  "burnBal", "custBal", "supplyBase", "supplySol", "sp", "t3es",
  "fng"]);   // Fear & Greed is a whole-crypto index, not SPX-native — kept off the SPX conditions desk
const LABELS = {
  mvrv: "MVRV", sip: "Supply in profit", top10: "Top-10 concentration", top100: "Top-100 concentration",
  whaleN: "Whale count (≥100k)", whalePct: "Whale supply share", gini: "Gini", holders: "ETH holders",
  rp: "Realized price", sopr: "SOPR", nrpl: "Net realized P/L", nrplProfit: "Realized profit", nrplLoss: "Realized loss",
  liveliness: "Liveliness", cdd: "Coin-days destroyed", dormancy: "Dormancy", cexBal: "On exchanges",
  lpBal: "In liquidity pools", bridgeBal: "Bridged supply", liqEx: "Liquid (CEX+LP) supply",
  splitCount: "Wallet splits", splitSupply: "Split supply", lthProfit: "LTH in profit", lthLoss: "LTH in loss",
  sthProfit: "STH in profit", sthLoss: "STH in loss", holdersBase: "Base holders", holdersSol: "Solana holders",
  be: "Break-even (realized)", fng: "Fear & Greed",
};
const CHART = {
  mvrv: "mvrv", sip: "supplyprofit", top10: "concentration", top100: "concentration", whaleN: "whales",
  gini: "concentration", holders: "holdersprice", rp: "floormodel", sopr: "sopr", nrpl: "nrpl",
  liveliness: "liveliness", cexBal: "cexsupply", lpBal: "cexsupply", bridgeBal: "walletgrowth",
  holdersBase: "walletgrowth", holdersSol: "walletgrowth", be: "mvrv", fng: "feargreed",
};
const AGE_LABELS = ["Supply age 0–1m", "Supply age 1–3m", "Supply age 3–6m", "Supply age 6–12m", "Supply held 1y+"];
const SUP_LABELS = { diamond: "Diamond supply (>90d)", gold: "Gold tier", silver: "Silver tier", bronze: "Bronze tier", wood: "Wood tier" };

const num = v => (typeof v === "number" && Number.isFinite(v));

// collect [{key,label,chart,series}] from a daily array by auto-enumerating its numeric fields
function seriesFromDaily(arr, { extraNested } = {}) {
  if (!Array.isArray(arr) || arr.length < 30) return [];
  const last = arr[arr.length - 1];
  const out = [];
  for (const k of Object.keys(last)) {
    if (SKIP.has(k)) continue;
    if (num(last[k])) out.push({ key: k, label: LABELS[k] || k, chart: CHART[k], series: arr.map(r => r[k]) });
    else if (k === "age" && Array.isArray(last.age)) last.age.forEach((_, i) => out.push({ key: `age${i}`, label: AGE_LABELS[i] || `age band ${i}`, chart: "hodlwaves", series: arr.map(r => r.age?.[i]) }));
    // NOTE: the HolderScan sup.* tiers (gold/silver/bronze/wood) are deliberately NOT scanned — they
    // reshuffle by threshold-crossing (a cohort ageing gold→diamond looks like a ±hundreds-of-M "jump"
    // that isn't real). The FIFO age bands above are the honest maturation signal and are scanned instead.
  }
  return out;
}

// scanAnomalies(feeds, opts) → { date, count, scanned, items:[{label, chart, value, z, rel, dir}] }
export function scanAnomalies(feeds, opts = {}) {
  const Z = opts.z ?? 4;              // robust-z gate (conservative for ~40 comparisons)
  const REL = opts.rel ?? 0.03;       // AND a ≥3% move vs the median, so flat-series rounding never flags
  const { onchain = [], history = [], exitFlow, cexFlow, valuation } = feeds;
  const reg = [...seriesFromDaily(onchain), ...seriesFromDaily(history)];

  // explicit series-shaped feeds
  if (Array.isArray(exitFlow?.days)) {
    reg.push({ key: "exitSupply", label: "Supply leaving (holders exiting)", chart: "exitflow", series: exitFlow.days.map(r => (r[3] || 0) + (r[4] || 0)) });
    reg.push({ key: "exitCount", label: "Wallets leaving", chart: "exitflow", series: exitFlow.days.map(r => (r[1] || 0) + (r[2] || 0)) });
  }
  if (Array.isArray(cexFlow?.days)) reg.push({ key: "cexOrganic", label: "Exchange organic net flow", chart: "cexflow", series: cexFlow.days.map(r => r[4]) });
  if (Array.isArray(valuation?.series)) reg.push({ key: "composite", label: "Valuation composite", chart: "valuation", series: valuation.series.map(r => (Array.isArray(r) ? r[1] : r?.v)) });

  const items = [];
  const seen = new Set();
  for (const s of reg) {
    if (seen.has(s.label)) continue; seen.add(s.label);   // dedupe by display name (cexBal appears in 2 feeds)
    const r = robustZ(s.series, opts);
    if (!r) continue;
    if (Math.abs(r.z) >= Z && Math.abs(r.rel) >= REL) {
      items.push({ key: s.key, label: s.label, chart: s.chart || null, value: +r.latest.toFixed(4), median: +r.med.toFixed(4), z: +r.z.toFixed(1), rel: +(r.rel * 100).toFixed(1), dir: r.z > 0 ? "up" : "down" });
    }
  }
  items.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { date: history.at?.(-1)?.d || onchain.at?.(-1)?.d || null, scanned: seen.size, count: items.length, items };
}
