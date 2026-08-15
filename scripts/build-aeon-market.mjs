// ============================================================================
// PROJECT AEON — market valuation (NFT MVRV / supply-in-profit / URPD / deals)
// ============================================================================
// The SPX on-chain playbook, applied to the NFT. From the sale log + current owners +
// rarity + floor → public/aeon-market.json:
//   • cost basis per held token = its current owner's last purchase price
//   • realized price / MVRV = floor·N ÷ Σ cost basis; supply-in-profit = share of held
//     tokens now worth more (floor) than their owner paid
//   • URPD = cost-basis histogram (in/out of profit vs floor)
//   • fair-value model: log(price) ~ a + b·log(rarity rank), from real sales
//   • deals = recent sales far below fair value (the realized deal detector, no live feed)
//   • biggest sales + trait premiums (which traits command a price)
//
//   node scripts/build-aeon-market.mjs --sales=dune/out/aeon_sales.csv --transfers=dune/out/aeon_transfers.csv
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { liveTail, describeTail } from "./aeon-live-tail.mjs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const SALES = arg("sales") || "dune/out/aeon_sales.csv";
const TRANSFERS = arg("transfers") || "dune/out/aeon_transfers.csv";
const OUT = arg("out") || "public/aeon-market.json";
const ETHLIKE = new Set(["ETH", "WETH", "bpETH", "bETH", "wETH"]);
const ZERO = "0x" + "0".repeat(40), DEAD = "0x000000000000000000000000000000000000dead";
const DAY = 86400e3;

const parseTime = s => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function parseSales(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iT = h.indexOf("time"), iId = h.indexOf("token_id"), iP = h.indexOf("price"), iC = h.indexOf("currency_symbol"),
        iB = h.indexOf("buyer"), iS = h.indexOf("seller"), iM = h.indexOf("marketplace");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(","); const cur = (c[iC] || "").trim(); if (cur && !ETHLIKE.has(cur)) continue;
    const price = Number(c[iP]); if (!(price > 0)) continue;
    rows.push({ t: parseTime(c[iT]), id: Number(c[iId]), price, buyer: (c[iB] || "").toLowerCase(), seller: (c[iS] || "").toLowerCase(), mkt: (c[iM] || "").trim() });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}
function currentOwners(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iTo = h.indexOf("to_address"), iId = h.indexOf("token_id"), iT = h.indexOf("time");
  const owner = new Map();
  for (let i = 1; i < lines.length; i++) { const c = lines[i].split(","); const t = parseTime(c[iT]); const id = Number(c[iId]); const p = owner.get(id); if (!p || t >= p.t) owner.set(id, { to: (c[iTo] || "").toLowerCase(), t }); }
  return owner;
}

function fit(pairs) {  // log(y)=a+b·log(rank), plus R² so callers can judge the fit
  const n = pairs.length; if (n < 8) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [rank, price] of pairs) { const x = Math.log(rank), y = Math.log(price); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
  const my = sy / n; let sst = 0, sse = 0;
  for (const [rank, price] of pairs) { const y = Math.log(price); sst += (y - my) ** 2; sse += (y - (a + b * Math.log(rank))) ** 2; }
  return { a, b, n, r2: sst > 0 ? 1 - sse / sst : 0, expected: r => Math.exp(a + b * Math.log(r)) };
}

// ── AEON PRICED IN SPX ───────────────────────────────────────────────────────────
// AEON's price tracks SPX far more than it tracks ETH (weekly log-return correlation
// ~0.53 vs ~0.36), and SPX explains ~28% of AEON's variance against rarity's ~5% — so
// SPX is the denominator that actually says whether AEON is dear or cheap.
//
// Judging asks only against a trailing ETH median is misleading on its own: it reported
// "everything is over market" while, priced in SPX, those same recent trades sat at the
// 9th-50th percentile of AEON's own history, i.e. historically CHEAP. This emits the
// SPX-denominated ladder so any surface can place a price on that history.
function spxValuation(salesDaily) {
  const spx = new Map();
  try {
    const ph = JSON.parse(readFileSync("public/price-history.json", "utf8"));
    for (const r of (Array.isArray(ph) ? ph : ph.points || [])) if (r?.date && r.price > 0) spx.set(r.date, r.price);
  } catch { /* fall through to history.json only */ }
  try {   // fresher tail from the daily snapshot cron
    for (const r of JSON.parse(readFileSync("public/history.json", "utf8"))) if (r?.d && r.p > 0) spx.set(r.d, r.p);
  } catch { /* bundle-only is fine */ }
  if (!spx.size) return null;

  // weekly median AEON sale in USD, joined to SPX that week
  const wk = new Map();
  for (const r of salesDaily) {
    if (!(r.sales > 0) || !(r.avgEth > 0) || !(r.floorEth > 0) || !(r.floorUsd > 0)) continue;
    const t = Date.parse(r.d), w = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    if (!wk.has(w)) wk.set(w, { a: [], e: [] });
    wk.get(w).a.push(r.avgEth); wk.get(w).e.push(r.floorUsd / r.floorEth);
  }
  // saleSeries — weekly median SALE in SPX. The benchmark for "is this ask dear?", since
  // a typical trade is the right comparison for a listing.
  const saleSeries = [];
  for (const [w, v] of [...wk.entries()].sort()) {
    const p = spx.get(w); if (!(p > 0)) continue;
    const usd = median(v.a) * median(v.e);
    if (usd > 0) saleSeries.push([w, Math.round(usd / p)]);   // how many SPX one AEON costs
  }
  if (saleSeries.length < 20) return null;

  const spxDates = [...spx.keys()].sort();
  const spxNow = spx.get(spxDates[spxDates.length - 1]);
  const lastDaily = [...salesDaily].reverse().find(r => r.floorEth > 0 && r.floorUsd > 0);
  const ethUsd = lastDaily ? lastDaily.floorUsd / lastDaily.floorEth : null;

  // floorSeries — daily FLOOR in SPX (7-day median, de-spiked). A different question from saleSeries
  // (cheapest entry vs typical trade), so both are emitted rather than merged. History comes from the
  // sales-derived USD floor (2y deep), but AEON sells rarely so that tail freezes between trades —
  // EXTEND it with the daily Alchemy LISTING floor (aeon-history.json, floor in ETH) for every day
  // past the last sale, priced with the most recent ETH/USD (slow-moving). So the series stays
  // daily-fresh no matter how sparse sales are, which is what makes the chart follow the floor live.
  const dailyFloor = salesDaily.filter(r => r.floorUsd > 0).map(r => ({ d: r.d, usd: r.floorUsd }));
  const lastFloorDay = dailyFloor.length ? dailyFloor[dailyFloor.length - 1].d : "0000-00-00";
  if (ethUsd) {
    try {
      for (const r of JSON.parse(readFileSync("public/aeon-history.json", "utf8")))
        if (r?.d && r.d > lastFloorDay && r.floor > 0) dailyFloor.push({ d: r.d, usd: r.floor * ethUsd });
    } catch { /* listing-floor history optional — the sales-only tail is the fallback */ }
  }
  const floorSeries = [];
  dailyFloor.forEach((r, i) => {
    const p = spx.get(r.d); if (!(p > 0)) return;
    const roll = median(dailyFloor.slice(Math.max(0, i - 6), i + 1).map(x => x.usd));
    if (roll > 0) floorSeries.push([r.d, Math.round(roll / p)]);
  });
  const ladder = saleSeries.map(x => x[1]).sort((a, b) => a - b);
  const ratioNow = saleSeries[saleSeries.length - 1][1];
  return {
    spxNow: +spxNow.toFixed(6), ethUsd: ethUsd ? Math.round(ethUsd) : null,
    ratioNow, pctNow: +(ladder.filter(x => x <= ratioNow).length / ladder.length * 100).toFixed(1),
    median: Math.round(median(ladder)), n: ladder.length,
    saleSeries, floorSeries,
  };
}

// ── MARKET LEVEL over time ───────────────────────────────────────────────────────
// AEON's market moves fast (median sale 0.35Ξ over 180d but 0.60Ξ over the last 30d),
// so one static fit over 180 days scores every OLD sale as a "steal" purely because the
// market was cheaper then, and understates today's fair value. Level is therefore a
// rolling median of nearby sales, widening the window until it has a usable sample.
function marketLevelAt(sorted, t, halfWin = 30 * DAY, minN = 12) {
  for (let w = halfWin; w <= 180 * DAY; w *= 2) {
    const v = [];
    for (const s of sorted) { if (s.t >= t - w && s.t <= t + w) v.push(s.price); }
    if (v.length >= minN) return median(v);
  }
  return median(sorted.map(s => s.price));
}

// ── CURRENT CLEARING LEVEL — the anchor for scoring TODAY's sales ─────────────────
// The market level above is a TIME-window median, which lags a sharp move. When a buyer
// swept 16 pieces in July the floor ~doubled, and for weeks afterward EVERY ordinary
// sale scored as a 20–30% "steal" against that stale 30-day median — spamming the account
// with fake deals while the floor merely reverted to normal.
//
// The clearing level is COUNT-based instead: the median of the last K DISTINCT BUYERS'
// prices. Two properties that fix it elegantly:
//   • it tracks where pieces ACTUALLY clear right now, within a few sales, not a month —
//     so once the floor corrects, sales at the new floor read ~0% off, not 30% off.
//   • DEDUPED BY BUYER, so a single sweep (one wallet, many buys) can't set the market
//     price — the thing that started this whole distortion counts once.
// `sorted` is ascending by time; we walk backward = most recent first.
function clearingLevel(sorted, K = 14) {
  const seen = new Map();
  for (let i = sorted.length - 1; i >= 0 && seen.size < K; i--) {
    const b = sorted[i].buyer || sorted[i].id;      // fallback keeps one-per-token if buyer is missing
    if (!seen.has(b)) seen.set(b, sorted[i].price);
  }
  return seen.size >= 6 ? median([...seen.values()]) : null;   // too thin → caller falls back to the time median
}
// The clearing level K..2K buyers ago, so the caller can tell if the floor is correcting
// (clearingLevel below priorClearing) rather than settled.
function priorClearing(sorted, K = 14) {
  const prices = [], seen = new Set();
  for (let i = sorted.length - 1; i >= 0; i--) { const b = sorted[i].buyer || sorted[i].id; if (!seen.has(b)) { seen.add(b); prices.push(sorted[i].price); } }
  const slice = prices.slice(K, 2 * K);
  return slice.length >= 6 ? median(slice) : null;
}

function main() {
  const duneSales = parseSales(SALES);
  // Splice the free Alchemy bank onto the weekly Dune baseline so the market LEVEL — and
  // therefore fair value, the listings verdict and the sale-alert threshold — stays current
  // between pulls. Rows strictly newer than the last Dune sale, so no double-counting.
  const tail = liveTail(duneSales.length ? duneSales[duneSales.length - 1].t : 0);
  console.log(describeTail(tail, "aeon-market"));
  const sales = [...duneSales, ...tail.map(r => ({ t: r.t, id: r.id, price: r.price, buyer: r.buyer, seller: r.seller, mkt: r.mkt }))]
    .sort((a, b) => a.t - b.t);
  const owners = currentOwners(TRANSFERS);
  const rar = JSON.parse(readFileSync("public/aeon-rarity.json", "utf8"));
  const R = new Map(rar.tokens.map(t => [t.id, t]));
  // live floor from the daily Alchemy banker (aeon.json), fall back to the sales floor
  const floor = (() => {
    try { const f = JSON.parse(readFileSync("public/aeon.json", "utf8")).floor; if (f > 0) return f; } catch { /* next */ }
    try { return JSON.parse(readFileSync("public/aeon-sales.json", "utf8")).current?.floorEth; } catch { return null; }
  })();
  // TODAY, not the last sale — AEON sells rarely, so keying the run off the last trade froze the whole
  // file (and its `updated` date) between sales. Windows below are relative to now = actual today.
  const now = Date.now();

  // per-token sale chain → current owner's cost basis (last sale where they were buyer)
  const byToken = new Map();
  for (const s of sales) (byToken.get(s.id) || byToken.set(s.id, []).get(s.id)).push(s);
  const costBasis = new Map(); // token id → price current owner paid
  for (const [id, arr] of byToken) {
    const last = arr[arr.length - 1];
    const own = owners.get(id)?.to;
    if (own && own === last.buyer && own !== ZERO && own !== DEAD) costBasis.set(id, last.price);
  }

  // ── VALUATION: MVRV, supply in profit, URPD (over priced, still-held tokens) ──
  const bases = [...costBasis.values()];
  const realizedPrice = median(bases);
  const heldPriced = bases.length;
  const inProfit = floor > 0 ? bases.filter(c => floor >= c).length : 0;
  const mvrv = floor > 0 && bases.length ? (floor * bases.length) / bases.reduce((s, c) => s + c, 0) : null;
  // URPD buckets (log-spaced cost basis)
  const lo = Math.min(...bases), hi = Math.max(...bases), nb = 28;
  const ll = Math.log(lo), span = (Math.log(hi) - ll) || 1;
  const urpd = Array.from({ length: nb }, (_, i) => ({ lo: Math.exp(ll + span * i / nb), hi: Math.exp(ll + span * (i + 1) / nb), n: 0, prof: 0 }));
  for (const c of bases) { let bi = Math.min(nb - 1, Math.floor((Math.log(c) - ll) / span * nb)); if (bi < 0) bi = 0; urpd[bi].n++; if (floor >= c) urpd[bi].prof++; }

  // ── FAIR VALUE ───────────────────────────────────────────────────────────────
  // Fit the RARITY effect on realized sales with the market trend divided out, then
  // price any piece as: market level at that moment × the rarity factor for its rank.
  //
  // Two biases this removes, both of which were making the site lie:
  //  1. The listings chart used to fit fair value on the ASKS themselves — circular. It
  //     measured "cheap vs what other sellers wish for", so it called #1011 (rank 152)
  //     "61% off" at 1.22Ξ when no AEON had fetched more than 1.10Ξ in 90 days.
  //  2. A single 180-day fit is stale-low in a rising market, so old sales scored as
  //     steals just for being old.
  // Rarity turns out to be a WEAK price driver here (see r2 below) — the fitted slope is
  // shallow on purpose because that is what the sales say; it is not forced flat.
  const rankOf = s => R.get(s.id)?.rank;
  const priced = sales.filter(s => rankOf(s) > 0).sort((a, b) => a.t - b.t);
  const levelCache = new Map();
  const levelAt = t => { const k = Math.round(t / DAY); if (!levelCache.has(k)) levelCache.set(k, marketLevelAt(priced, t)); return levelCache.get(k); };
  // detrended: price ÷ market level at that sale's own date → isolates rarity from timing
  const rarityFit = fit(priced.map(s => [rankOf(s), s.price / (levelAt(s.t) || 1)]));
  // ⭐ SCORE "cheap" against where pieces are CLEARING now, not a lagging time median (see
  // clearingLevel). Falls back to the old time median only when the market is too thin to
  // have K distinct recent buyers. The rarity FIT above still uses the per-sale time level,
  // so the historical scatter is unchanged — only "how cheap is a sale RIGHT NOW" moves.
  const levelNow = clearingLevel(priced) ?? levelAt(now);
  const priorLvl = priorClearing(priced);
  // How fast the clearing price is moving: <0 = the floor is correcting DOWN. The watcher
  // raises the steal bar while this is sharply negative, so a market-wide repricing doesn't
  // read as a field of individual "steals".
  const floorTrend = (levelNow && priorLvl) ? +((levelNow / priorLvl) - 1).toFixed(3) : null;
  const rarityFactor = r => (rarityFit ? Math.exp(rarityFit.a + rarityFit.b * Math.log(r)) : 1);
  const fairAt = (rank, t) => (levelAt(t) || levelNow) * rarityFactor(rank);

  // ⭐ CADENCE-CALIBRATED STEAL BAR. A fixed 20% either spams (in a cheap market) or goes silent
  // (in a correcting one). Instead, set the bar from the DATA: over the last 60 days, the discount
  // (vs the clearing level at each sale's own time) that ~1 day in 7 clears — so a "steal" post
  // lands roughly weekly and self-adjusts to volume and regime. Floored so a 12%-off sale in a
  // dead stretch never gets called a steal. The watcher reads this instead of a hardcoded 20%.
  const stealBar = (() => {
    const CAL = 60 * DAY, TARGET = 7, ABS_MIN = 0.15;
    const byDay = new Map();
    for (let i = 0; i < priced.length; i++) {
      const s = priced[i];
      if (s.t < now - CAL) continue;
      const seen = new Map();
      for (let j = i; j >= 0 && seen.size < 14; j--) if (!seen.has(priced[j].buyer)) seen.set(priced[j].buyer, priced[j].price);
      if (seen.size < 6) continue;
      const rk = rankOf(s); if (!(rk > 0)) continue;
      const exp = median([...seen.values()]) * rarityFactor(rk);
      const disc = (exp - s.price) / exp;
      const day = new Date(s.t).toISOString().slice(0, 10);
      byDay.set(day, Math.max(byDay.get(day) ?? -Infinity, disc));
    }
    const daily = [...byDay.values()].sort((a, b) => b - a);
    if (daily.length < 10) return +(ABS_MIN + 0.05).toFixed(3);
    const K = Math.max(1, Math.round(CAL / DAY / TARGET));   // ~ window / target days
    return +Math.max(ABS_MIN, daily[Math.min(K, daily.length) - 1]).toFixed(3);
  })();

  // SPX REGIME — the "where should the market be" reference the eye uses. A single-wallet pump on a
  // thin market spikes the ETH floor, but the collection's value in SPX (a stable denominator) shows
  // the spike AND the reversion to its baseline. `spxStretch` = current AEON-in-SPX vs its trailing
  // median. Positive = overvalued / reverting → the watcher gets MORE conservative on steals, since a
  // "cheap" sale in that regime is the mean-reversion, not a deal.
  const spxVal = (() => { try { return spxValuation(JSON.parse(readFileSync("public/aeon-sales.json", "utf8")).daily || []); } catch { return null; } })();
  const spxStretch = (() => {
    const fs = spxVal?.floorSeries || [];
    if (fs.length < 20) return null;
    const base = median(fs.slice(-120).map(x => x[1]));
    return (base > 0) ? +((fs.at(-1)[1] / base) - 1).toFixed(3) : null;
  })();

  const cutoff = now - 180 * DAY;
  const recentSales = sales.filter(s => s.t >= cutoff && R.has(s.id));
  const scored = recentSales.map(s => {
    const rank = R.get(s.id).rank, exp = fairAt(rank, s.t), disc = (exp - s.price) / exp;
    return { id: s.id, price: +s.price.toFixed(3), rank, exp: +exp.toFixed(3), disc: +disc.toFixed(3), img: R.get(s.id).img, d: new Date(s.t).toISOString().slice(0, 10) };
  });
  // downsampled scatter for the chart (keep every sale up to ~500)
  const sstep = Math.max(1, Math.ceil(scored.length / 500));
  const salesScatter = scored.filter((_, i) => i % sstep === 0).map(({ img, exp, ...r }) => r);
  // Art for the hover tooltip. Keyed by token (not repeated per sale) — a token that traded
  // 5 times would otherwise carry 5 copies of the same URL. ~196 entries vs 351 points, and
  // far cheaper than the site loading the 1.3 MB rarity file just to resolve images.
  const scatterImgs = {};
  for (const p of salesScatter) { const im = R.get(p.id)?.img; if (im && !scatterImgs[p.id]) scatterImgs[p.id] = im; }
  // ONE ROW PER TOKEN. A token that traded repeatedly has several sale records, and the raw
  // list showed the same piece 3× in the gallery (#863 at 48/39/38% off) — which reads as a
  // rendering bug, not as history. Keep each token's single best (deepest-discount) sale.
  const bestPerToken = (rows, better) => {
    const m = new Map();
    for (const r of rows) { const p = m.get(r.id); if (!p || better(r, p)) m.set(r.id, r); }
    return [...m.values()];
  };
  const deals = bestPerToken(scored.filter(d => d.disc > 0.2), (a, b) => a.disc > b.disc)
    .sort((a, b) => b.disc - a.disc).slice(0, 24);

  // ── BIGGEST SALES ── (also one row per token — its highest-ever sale)
  const biggest = bestPerToken(
    sales.map(s => ({
      id: s.id, price: +s.price.toFixed(3), rank: R.get(s.id)?.rank ?? null, img: R.get(s.id)?.img ?? null,
      buyer: s.buyer, seller: s.seller, mkt: s.mkt, d: new Date(s.t).toISOString().slice(0, 10),
    })),
    (a, b) => a.price > b.price,
  ).sort((a, b) => b.price - a.price).slice(0, 24);

  // ── TRAIT PREMIUMS: median recent sale price per trait value ──
  const recent = sales.filter(s => s.t >= now - 180 * DAY && R.has(s.id));
  const tv = new Map(); // "Type=Value" → prices
  for (const s of recent) for (const a of R.get(s.id).traits) { const k = a.t + " · " + a.v; (tv.get(k) || tv.set(k, []).get(k)).push(s.price); }
  const traitPremiums = [...tv.entries()].filter(([, p]) => p.length >= 4)
    .map(([k, p]) => ({ trait: k, floor: +Math.min(...p).toFixed(3), median: +median(p).toFixed(3), sales: p.length }))
    .sort((a, b) => b.median - a.median).slice(0, 30);

  const out = {
    updated: new Date(now).toISOString().slice(0, 10), floor, supply: rar.total,
    valuation: {
      floor, realizedPrice: +realizedPrice.toFixed(4), mvrv: mvrv != null ? +mvrv.toFixed(3) : null,
      heldPriced, supplyInProfitPct: heldPriced ? +(inProfit / heldPriced * 100).toFixed(1) : null,
    },
    urpd: urpd.map(b => ({ lo: +b.lo.toFixed(4), hi: +b.hi.toFixed(4), n: b.n, prof: b.prof })),
    // a/b describe the RARITY factor only (detrended); multiply by `level` for a price.
    // r2 is deliberately published — it is low (~0.05), i.e. rarity explains very little of
    // AEON's price, and any surface using this must say so rather than imply precision.
    fairModel: rarityFit
      ? { a: rarityFit.a, b: rarityFit.b, r2: +rarityFit.r2.toFixed(4), n: rarityFit.n, level: +levelNow.toFixed(4), method: "sales-detrended" }
      : null,
    levelNow: +levelNow.toFixed(4),
    floorTrend, stealBar, spxStretch,
    spxValue: spxVal,
    salesScatter, scatterImgs, deals, biggest, traitPremiums,
    // ── WHERE THE FAIR-VALUE MODEL MAY BE QUOTED ────────────────────────────────
    // The rarity fit is drawn through the whole sale log, but the top of the curve is
    // almost empty: rank 1 has TWO comparable sales, rank 5 has fifteen, while rank 1000
    // has thousands. Quoting a percentage against the fitted line up there implies
    // precision that does not exist — it is what produced "1860% above what this rarity
    // trades at" for the rank-1 piece. minRank is the lowest rank at which a neighbourhood
    // of [rank/2, rank*2] holds at least `threshold` real sales; below it, surfaces should
    // say something empirical instead. Computed, not hardcoded, so it relaxes on its own as
    // the sale log grows.
    rankSupport: (() => {
      const TOT = rar.total || 3333, cum = new Array(TOT + 2).fill(0);
      for (const s of sales) { const rk = R.get(s.id)?.rank; if (rk > 0 && rk <= TOT) cum[rk]++; }
      for (let r = 1; r <= TOT; r++) cum[r] += cum[r - 1];
      const comp = r => cum[Math.min(TOT, r * 2)] - cum[Math.max(1, Math.ceil(r / 2)) - 1];
      const threshold = 30;
      let minRank = 1;
      for (let r = TOT; r >= 1; r--) if (comp(r) < threshold) { minRank = r + 1; break; }
      return { threshold, minRank, atRank1: comp(1) };
    })(),
    // Empirical superlatives for a big sale — where it actually sits among every realized
    // sale. No model, no fitting: "the highest this collection has ever traded at" is a
    // fact, and a far better headline than a percentage against an extrapolated line.
    priceMilestones: (() => {
      const priced = sales.filter(s => s.price > 0).sort((a, b) => b.price - a.price);
      if (!priced.length) return null;
      const windowHigh = {};
      for (const d of [30, 90, 180, 365]) {
        const w = sales.filter(s => s.price > 0 && s.t >= now - d * DAY);
        if (w.length) windowHigh[d] = +Math.max(...w.map(s => s.price)).toFixed(3);
      }
      return {
        n: priced.length,
        top: priced.slice(0, 10).map(s => ({ price: +s.price.toFixed(3), id: s.id, d: new Date(s.t).toISOString().slice(0, 10) })),
        windowHigh,
      };
    })(),
    // Fresh sales feed for the notable-sale watcher (aeon-sale-watch.mjs). Kept separate
    // from `deals` because a sale can be newsworthy for being RARE or BIG, not only cheap.
    // ⭐ RE-SCORED against the CURRENT CLEARING LEVEL (not each sale's own-time level): "is
    // this cheap TODAY" must be judged against today's clearing price, or a reverting floor
    // makes every sale a steal. `deals`/`salesScatter` keep their per-time disc (history).
    recentSales: scored.filter(s => Date.parse(s.d) >= now - 14 * DAY)
      .sort((a, b) => Date.parse(b.d) - Date.parse(a.d))
      .map(s => {
        const exp = +(levelNow * rarityFactor(s.rank)).toFixed(3);
        return { id: s.id, price: s.price, rank: s.rank, exp, disc: +((exp - s.price) / exp).toFixed(3), img: s.img, d: s.d };
      }),
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");

  console.log(
    `aeon-market: floor ${floor} ETH · realized price ${out.valuation.realizedPrice} ETH · MVRV ${out.valuation.mvrv}\n` +
    `  supply in profit ${out.valuation.supplyInProfitPct}% (of ${heldPriced} priced-held) · ${deals.length} recent deals\n` +
    `  biggest sale #${biggest[0].id} ${biggest[0].price} ETH · priciest trait ${traitPremiums[0]?.trait} (${traitPremiums[0]?.median} ETH median)`
  );
}

main();
