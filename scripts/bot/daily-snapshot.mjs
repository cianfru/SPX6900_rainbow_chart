// DAILY SNAPSHOT — the control-panel "terminal one-pager": a granular day-over-day read across the
// metrics that matter, computed from the committed daily feeds ($0, keyless). Complements the Brief
// (event detector) with a STATE table: valuation & buy-zone distance, holders & conviction, exchange
// flow, whale-cohort net buy/sell over 1d/7d/30d, and smart-money. Everything is a delta off the daily
// series we already bank — no new data. Writes public/daily-snapshot.json, rendered by /control.
//
// HONESTY: several conviction reads are SUPPLY shares, not wallet counts (that is all the feeds carry);
// labelled as such. Rows also carry the source date so the panel can flag a stale feed.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { scanAnomalies } from "./anomaly-scan.mjs";
import { valuationCheck } from "./valuation-check.mjs";

const read = f => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; } };
// delta of a numeric accessor over the last N rows of a daily array (null if not enough history)
const backDelta = (arr, acc, n) => {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const last = arr[arr.length - 1], prev = arr[arr.length - 1 - n];
  if (!last || !prev) return null;
  const a = acc(last), b = acc(prev);
  return (Number.isFinite(a) && Number.isFinite(b)) ? a - b : null;
};
const dateOf = x => (x && (x.updated || (Array.isArray(x) ? x[x.length - 1]?.d : null))) || null;

// row: label, value, deltas over [1,7,30] rows, a fmt hint, goodUp (is an increase bullish?), note
const row = (label, value, arr, acc, fmt, goodUp, note) => ({
  label, value, fmt, goodUp: !!goodUp, note: note || "",
  d: [1, 7, 30].map(n => backDelta(arr, acc, n)),
});

export function buildDailySnapshot(feeds) {
  const { history = [], onchain = [], whales, smartMoney, valuation, cexFlow, exitFlow, longshort,
    cityHistory, aeon, aeonHistory = [], aeonMarket, aeonSales } = feeds;
  const oc = onchain.length ? onchain[onchain.length - 1] : null;
  const h = history.length ? history[history.length - 1] : null;
  // Prefer the LIVE daily price (history.json `p`) over onchain.spot: the FIFO engine prices spot off
  // the weekly price-history feed, so onchain.spot can lag a few days mid-week (it froze the header at
  // the Monday price through a pump). history.json is the live daily fetch → the truest "now".
  const spot = h?.p ?? oc?.spot ?? whales?.spot ?? 0;
  const sections = [], alerts = [];

  // ---- VALUATION ----------------------------------------------------------
  const val = [];
  if (oc) {
    val.push(row("MVRV (price ÷ realized)", oc.mvrv, onchain, r => r.mvrv, "x", false,
      oc.mvrv < 1 ? `under cost basis · buyers' zone ≈ 0.5` : "over cost basis"));
    val.push(row("Supply in profit", oc.sip, onchain, r => r.sip, "pct", true, "share of supply above its cost"));
  }
  if (valuation?.cur) {
    const c = valuation.cur.composite, zone = (valuation.zones || []).find(z => c <= z.max);
    const compAcc = r => (Array.isArray(r) ? r[1] : r.v);
    val.push({ label: "Valuation composite", value: c, fmt: "pctile", goodUp: false, note: zone?.label || "",
      d: [1, 7, 30].map(n => backDelta(valuation.series || [], compAcc, n)) });
  }
  if (oc && oc.mvrv != null) {
    // Accumulation-zone proximity (MVRV 0.5 = historically where SPX bottoms). An ALERT is only for
    // genuine proximity — IN the zone, or NEAR it (within ~10%). Being merely "undervalued" a quarter
    // above the zone is NOT an alert (the MVRV row shows it) — that "Approaching" banner at +24% was a
    // false positive: it fired all the way up to MVRV 0.75 (+50% above), so it was permanently stuck on.
    const buy = 0.5, pctAbove = ((oc.mvrv - buy) / buy) * 100;
    if (oc.mvrv <= buy) alerts.push(`🟢 IN the accumulation zone — MVRV ${oc.mvrv.toFixed(2)} (≤ 0.5, historically where SPX has bottomed).`);
    else if (oc.mvrv <= buy * 1.1) alerts.push(`🟢 Near accumulation — MVRV ${oc.mvrv.toFixed(2)}, just +${pctAbove.toFixed(0)}% above the 0.5 zone.`);
    if (valuation?.cur?.composite <= 0.2) alerts.push(`🟢 Composite ${(valuation.cur.composite * 100).toFixed(0)}/100 — deep-value zone.`);
  }
  if (val.length) sections.push({ title: "Valuation", rows: val });

  // ---- HOLDERS & CONVICTION ----------------------------------------------
  const hold = [];
  if (h) {
    hold.push(row("Holders (Ethereum)", h.holders, history, r => r.holders, "int", true, "wallet count"));
    if (h.holdersBase != null) hold.push(row("Holders (Base)", h.holdersBase, history, r => r.holdersBase, "int", true, ""));
    if (h.holdersSol != null) hold.push(row("Holders (Solana)", h.holdersSol, history, r => r.holdersSol, "int", true, ""));
  }
  if (oc) {
    // Conviction by HOLDING AGE — share of supply held longer than 90 / 155 / 365 days. All from the
    // FIFO per-lot engine, so they nest exactly (90d ⊇ 155d ⊇ 1yr). 90d = age bands 3-6m+6-12m+1y+;
    // 155d = the long-term-holder standard (lthProfit+lthLoss); 1yr = the oldest HODL band.
    const d90 = r => (r.age?.[2] || 0) + (r.age?.[3] || 0) + (r.age?.[4] || 0);
    const d155 = r => (r.lthProfit || 0) + (r.lthLoss || 0);
    hold.push(row("Supply held 90+ days", d90(oc), onchain, d90, "pct", true, "share of all supply held longer than 90 days"));
    hold.push(row("Supply held 155+ days", d155(oc), onchain, d155, "pct", true, "share held longer than 155 days — the long-term-holder standard"));
    hold.push(row("Supply held 1 year+", oc.age?.[4], onchain, r => r.age?.[4], "pct", true, "share held longer than a year — the strongest hands"));
  }
  if (hold.length) sections.push({ title: "Holders & conviction", rows: hold });

  // ---- CONCENTRATION (whales spreading out vs consolidating) --------------
  // A standing read, not just a radar spike: rising top-N share = supply consolidating into fewer
  // hands (a risk), falling = distributing to more wallets. From the FIFO engine, daily.
  const conc = [];
  if (oc?.top100 != null) {
    conc.push(row("Top-100 wallets' share", oc.top100, onchain, r => r.top100, "pct", false, "share of holder supply held by the 100 biggest wallets — rising = consolidating"));
    if (oc.top10 != null) conc.push(row("Top-10 wallets' share", oc.top10, onchain, r => r.top10, "pct", false, "the 10 biggest wallets' share of holder supply"));
    if (oc.gini != null) conc.push(row("Gini coefficient", oc.gini, onchain, r => r.gini, "num3", false, "0 = supply spread perfectly evenly, 1 = all in one wallet"));
  }
  if (conc.length) sections.push({ title: "Concentration", rows: conc });

  // ---- EXCHANGE FLOW ------------------------------------------------------
  const flow = [];
  if (oc?.cexBal != null) {
    // Δ in exchange balance = net onto (‑ off) exchanges. Rising = sell-side supply building (bad).
    flow.push(row("On exchanges (balance)", oc.cexBal, onchain, r => r.cexBal, "m", false, "rising = supply onto venues"));
  } else if (h?.cexBal != null) {
    flow.push(row("On exchanges (balance)", h.cexBal, history, r => r.cexBal, "m", false, "rising = supply onto venues"));
  }
  if (oc?.lpBal != null) flow.push(row("In liquidity pools", oc.lpBal, onchain, r => r.lpBal, "m", true, "DEX depth"));
  // Organic net flow (one-time exchange-listing fills stripped) — the honest sell-side-vs-accumulation
  // read, which the raw balance delta above can't separate from a listing. cex-flow.json days[][4].
  if (Array.isArray(cexFlow?.days) && cexFlow.days.length >= 30) {
    const organic = cexFlow.days.map(d => d[4] || 0);
    const sum = n => organic.slice(-n).reduce((a, b) => a + b, 0);
    const s7 = sum(7);
    flow.push({ label: "Net flow onto exchanges (organic, 30d)", value: sum(30), fmt: "m", goodUp: false,
      note: `coins onto (+) minus off (−) exchanges over 30 days, listing fills stripped · negative = leaving (accumulation) · 7d ${s7 >= 0 ? "+" : "−"}${(Math.abs(s7) / 1e6).toFixed(2)}M`,
      d: [null, null, null] });
  }
  if (flow.length) sections.push({ title: "Exchange flow", rows: flow });

  // ---- WHALE COHORTS (net buy/sell by SIZE band) -------------------------
  // Sliced into the same four size bands as the census / city (100k–250k … 5M+), so the read is
  // WHICH size band is accumulating or distributing — not "whales" as one >100k blob.
  const WHALE_BANDS = [
    { band: "100k–250k", lo: 1e5, hi: 25e4 },
    { band: "250k–1M", lo: 25e4, hi: 1e6 },
    { band: "1M–5M", lo: 1e6, hi: 5e6 },
    { band: "5M+", lo: 5e6, hi: Infinity },
  ];
  let whaleCohorts = null;
  if (whales?.wallets?.length) {
    const dust = w => Math.max(1000, (w.bal || 0) * 0.005);
    whaleCohorts = WHALE_BANDS.map(b => {
      const inBand = whales.wallets.filter(w => (w.bal || 0) >= b.lo && (w.bal || 0) < b.hi);
      const sum = k => inBand.reduce((s, w) => s + (w[k] || 0), 0);
      let buyers = 0, sellers = 0;
      for (const w of inBand) { const f = w.d30 || 0, d = dust(w); if (f > d) buyers++; else if (f < -d) sellers++; }
      return { band: b.band, wallets: inBand.length, buyers, sellers, d1: sum("d1"), d7: sum("d7"), d30: sum("d30") };
    });
  }

  // ---- HOW HOLDERS LEFT (exit-flow) ---------------------------------------
  // Daily departures (a wallet's last day above the 5k bar), split profit vs loss, in wallets AND SPX.
  // exit-flow.json days = [date, cProfit, cLoss, supProfit, supLoss]. We surface the trailing 1/7/30-day
  // sums + the % leaving in profit, and RAISE AN ALERT when the last few days' supply-departed spikes
  // above its own trailing norm — a real "holders leaving" signal, framed by whether it's profit-taking
  // (top selling) or loss (capitulation). This is the lane the terminal was missing.
  let exits = null;
  const efDays = exitFlow?.days;
  if (Array.isArray(efDays) && efDays.length >= 8) {
    const supTot = r => (r[3] || 0) + (r[4] || 0);
    const sum = (n, i) => efDays.slice(-n).reduce((s, r) => s + (r[i] || 0), 0);
    const win = n => {
      const cP = sum(n, 1), cL = sum(n, 2), sP = sum(n, 3), sL = sum(n, 4), s = sP + sL;
      return { wallets: cP + cL, supply: s, profitPct: s > 0 ? Math.round((sP / s) * 100) : null };
    };
    exits = { d1: win(1), d7: win(7), d30: win(30) };
    // spike: last up-to-3 days' supply vs the trailing-60d daily norm
    const daily = efDays.map(supTot);
    const trail = daily.slice(-63, -3);
    if (trail.length >= 20) {
      const mean = trail.reduce((a, b) => a + b, 0) / trail.length;
      const sd = Math.sqrt(trail.reduce((a, b) => a + (b - mean) ** 2, 0) / trail.length) || 1;
      const recent = efDays.slice(-3);
      const peak = recent.reduce((best, r) => (supTot(r) > supTot(best) ? r : best), recent[0]);
      const z = (supTot(peak) - mean) / sd;
      if (z >= 2 && supTot(peak) > 0) {
        const sP = peak[3] || 0, sL = peak[4] || 0, mostly = sP >= sL ? "profit-taking" : "at a loss (capitulation)";
        alerts.push(`⚠️ Exit wave: ${((sP + sL) / 1e6).toFixed(2)}M SPX left on ${peak[0]} (${((peak[1] || 0) + (peak[2] || 0))} wallets), ${z.toFixed(1)}σ above normal — mostly ${mostly}.`);
      }
    }
  }

  // ---- SMART MONEY --------------------------------------------------------
  const sm = [];
  if (smartMoney) {
    const wk = smartMoney.weeks || [];
    const f = smartMoney.flow || {};
    const trend = (f.w4 != null) ? ` · trend 4w ${f.w4 >= 0 ? "+" : ""}${f.w4}% / 12w ${f.w12 >= 0 ? "+" : ""}${f.w12}% / 26w ${f.w26 >= 0 ? "+" : ""}${f.w26}%` : "";
    sm.push(row("Smart-money held", smartMoney.heldNow, wk, r => r[1], "m", true, `${smartMoney.cohortSize || 0} proven wallets · median ${smartMoney.medianRoi}×${trend}`));
    sm.push({ label: "New qualifiers (90d)", value: smartMoney.newQual90 ?? 0, fmt: "int", goodUp: false,
      note: "wallets newly proven by selling tops — a spike = distribution", d: [null, null, null] });
  }
  if (sm.length) sections.push({
    title: "Smart money",
    // Plain, on-surface: exactly how a wallet earns its way into this cohort — no black box.
    note: "A wallet qualifies only if it (1) put in real money — at least $25k of buys, (2) actually sold at a profit of 5× or more (proven timing, not paper gains), and (3) still holds at least 50k SPX today (still trackable). The set is recomputed every day: wallets that dump out drop off, freshly proven winners join. We publish only the total they hold and whether they're net buying or selling — never a wallet address.",
    rows: sm,
  });

  // ---- TECHNICALS (optional lane) ----------------------------------------
  const tech = [];
  if (oc) {
    if (oc.sopr != null) tech.push(row("Sellers' profit ratio (SOPR)", oc.sopr, onchain, r => r.sopr, "x", true, "coins that moved today sold for this multiple of their cost — above 1× = in profit"));
    if (oc.nrpl != null) tech.push(row("Profit vs. loss cashed in", oc.nrpl, onchain, r => r.nrpl, "usdm", true, "dollar gains (+) minus losses (−) locked in on-chain today"));
    if (oc.liveliness != null) tech.push(row("Coins waking up (liveliness)", oc.liveliness, onchain, r => r.liveliness, "num3", false, "rising = long-dormant coins starting to move (distribution); falling = holders sitting tight"));
  }
  if (tech.length) sections.push({ title: "Technicals", rows: tech });

  // ---- SPX CITY (the holder city — residents ≥5k SPX held 90 days) --------
  // City TVL + citizen count are the "adoption vs price" read: both climbed through the drawdown.
  // Source: city-history.json rows = [date, price, c0..c5 counts, v0..v5 TVL-USD] by size cohort.
  const city = [];
  const CR = cityHistory?.rows;
  if (Array.isArray(CR) && CR.length) {
    const citizens = r => r.slice(2, 8).reduce((a, b) => a + (b || 0), 0);
    const tvl = r => r.slice(8, 14).reduce((a, b) => a + (b || 0), 0);
    const cur = CR[CR.length - 1];
    city.push(row("City TVL", tvl(cur), CR, tvl, "usdm", true, "total USD value of every resident wallet (balance × price)"));
    city.push(row("Citizens", citizens(cur), CR, citizens, "int", true, "wallets that have held ≥5,000 SPX for 90 days — SPX City residency"));
    city.push(row("Big residents (≥1M SPX)", (cur[6] || 0) + (cur[7] || 0), CR, r => (r[6] || 0) + (r[7] || 0), "int", true, "residents in the 1M–5M and 5M+ size cohorts"));
    const pc = cityHistory?.perCapita;
    if (Array.isArray(pc) && pc.length) city.push(row("Median resident holding", pc[pc.length - 1][1], pc, r => r[1], "spx", true, "the middle resident's stake"));
  }
  if (city.length) sections.push({ title: "SPX City", rows: city });

  // ---- PROJECT AEON (NFT collection) -------------------------------------
  // Floor priced in BOTH ETH and SPX (the honest SPX-native denominator), plus today's sales. The
  // sales feed rides the daily Dune pull so it can lag a day or two — the freshness footer flags it.
  const aeonRows = [];
  if (aeon?.floor != null) {
    aeonRows.push(row("Floor price (ETH)", aeon.floor, aeonHistory, r => r.floor, "eth", true, "lowest ask · via Alchemy/OpenSea"));
  }
  const floorSpx = aeonMarket?.spxValue?.floorSeries;
  if (Array.isArray(floorSpx) && floorSpx.length) {
    aeonRows.push(row("Floor price (SPX)", floorSpx[floorSpx.length - 1][1], floorSpx, r => r[1], "spx", true, "the same floor priced in SPX — AEON's SPX-native value"));
  }
  // Sales ride the Dune pull, which can STALL (query timeout, or a completed-but-empty delta) —
  // when it does, the committed data freezes at the last real sale and "0 sales today" would be a
  // LIE. So compare the sales data's as-of date to today: if it hasn't advanced in >3 days, show the
  // sales value as unknown and say the feed is stalling, rather than presenting frozen data as live.
  const aeonTrades = aeonSales?.trades;
  const salesAsOf = aeonSales?.updated || (Array.isArray(aeonTrades) ? aeonTrades[aeonTrades.length - 1]?.d : null);
  if (Array.isArray(aeonTrades)) {
    const today = dateOf(aeonHistory) || new Date().toISOString().slice(0, 10);
    const salesAge = salesAsOf ? Math.round((Date.parse(today) - Date.parse(salesAsOf)) / 864e5) : null;
    const stale = salesAge != null && salesAge > 3;
    const todays = aeonTrades.filter(t => t.d === today);
    const volEth = todays.reduce((s, t) => s + (t.eth || 0), 0);
    aeonRows.push({ label: "Sales today", value: stale ? null : todays.length, fmt: "int", goodUp: true, d: [null, null, null],
      note: stale ? `⚠ sales feed stalled — no new data since ${salesAsOf} (${salesAge}d); the Dune sales pull is failing, so recent sales are NOT captured`
        : (todays.length ? `${volEth.toFixed(2)}Ξ traded today` : "no sales yet today") });
  }
  if (aeonRows.length) sections.push({ title: "Project AEON", rows: aeonRows });

  // ANOMALY RADAR — the across-the-board scan: every numeric series flagged if it jumped abnormally today.
  const radar = scanAnomalies({ onchain, history, exitFlow, cexFlow, valuation });
  // MARKET CONDITIONS — the universal gauge table (each scored 0–100 vs its own history, plain-language).
  const conditions = valuationCheck({ onchain, longshort, valuation });

  const date = dateOf(history) || dateOf(onchain) || null;
  return {
    updated: date, date,
    anomalies: radar.items, scanned: radar.scanned, conditions,
    spot: +(+spot).toFixed(6),
    sections, whaleCohorts, exits, alerts,
    freshness: {
      history: dateOf(history), onchain: dateOf(onchain), whales: dateOf(whales),
      smartMoney: smartMoney?.updated || null, valuation: valuation?.updated || null,
      city: cityHistory?.updated || null,
      // AEON floor comes from Alchemy daily (current). AEON SALES come from the Dune pull, which has
      // been STALLING — so its freshness is the last date the SALES DATA actually advanced, which the
      // footer flags when it falls behind. (Do NOT key sales freshness to the run date: the builder
      // regenerates the file daily from the frozen CSV, which is exactly what masked this stall.)
      aeon: aeon?.updated || aeonMarket?.updated || dateOf(aeonHistory),
      aeonSales: salesAsOf,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=public/daily-snapshot.json").slice(6);
  const snap = buildDailySnapshot({
    history: read("public/history.json") || [],
    onchain: read("public/onchain.json") || [],
    whales: read("public/whales.json"),
    smartMoney: read("public/smart-money.json"),
    valuation: read("public/valuation.json"),
    cexFlow: read("public/cex-flow.json"),
    exitFlow: read("public/exit-flow.json"),
    longshort: read("public/longshort.json"),
    cityHistory: read("public/city-history.json"),
    aeon: read("public/aeon.json"),
    aeonHistory: read("public/aeon-history.json") || [],
    aeonMarket: read("public/aeon-market.json"),
    aeonSales: read("public/aeon-sales.json"),
  });
  writeFileSync(out, JSON.stringify(snap));
  console.error(`daily-snapshot: ${snap.sections.length} sections · ${snap.alerts.length} alerts · ${snap.date} → ${out}`);
  for (const a of snap.alerts) console.error("  " + a);
}
