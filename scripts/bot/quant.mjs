// The "Quant" — crunches the day's already-computed stats into a RANKED list of
// candidate ANGLES (reads worth posting), each mapped to the card that expresses it.
// Cross-metric DIVERGENCES (the genuinely interesting stuff — e.g. "underwater but
// not selling") score above single-metric extremes ("price is cheap"). Feeds the
// control agent AND the "Notable today" strip so both reason FROM angles, not raw
// fields. Pure: no fetch, no render — it only reads numbers already computed by
// computeStats (honesty rule: never invents figures).
//
// LOOK-BACK: pass opts.recent = [{date,id}] of recently-fired cards and angles whose
// card (or a card in the same THEME) went out in the last ~8 days get a score penalty,
// so the strip/agent don't propose the same kind of post twice in a row.

import { SP500_HISTORY } from "../../src/sp500-history.js";
import { btcCycleProjection } from "../../src/btc-cycle.js";
import { goldenCross } from "../../src/models.js";
import { buildAltRainbow } from "../../src/alt-rainbow.js";
import { ETH_HISTORY, SOL_HISTORY } from "../../src/alt-age-history.js";
import { BTC_HISTORY } from "../../src/btc-history.js";

const pct = (x, d = 0) => (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
const round = (x, d = 2) => (x == null ? null : Number(x.toFixed(d)));
const fmt = n => (n >= 1000 ? Math.round(n).toLocaleString() : String(n));
const DAY = 86400000;

// Coarse theme per card, so "similar" (not just identical) cards are recency-aware.
const THEME = {
  breakeven: "onchain-value", mvrv: "onchain-value", diamondtrend: "onchain-value", distribution: "onchain-value", holders: "onchain-value", holderspair: "onchain-value", holdergrowth: "onchain-value", marketcap: "onchain-value",
  valuation: "valuation", riskcolor: "valuation", risklevels: "valuation", channel: "valuation", roadmap: "valuation", model: "valuation", risk: "valuation",
  underwater: "drawdown", drawdown: "drawdown",
  rally: "performance", firesalerally: "performance", runningroi: "performance", alltime: "performance",
  fngdial: "sentiment", fngtrend: "sentiment",
  longshort: "positioning",
  goldencross: "ma-cross", riskheat: "ma-cross",
  targets: "targets", milestones: "targets", hundred: "targets",
};
const themeOf = card => THEME[card] || card;

// How much to knock a card's score for having been fired recently (exact card heavier
// than same-theme; both decay to 0 over ~8 days). Reused by the strip for detector
// signals too.
export function cardRecencyPenalty(card, recent, todayStr) {
  if (!recent?.length || !card || !todayStr) return 0;
  const today = Date.parse(todayStr), theme = themeOf(card);
  let pen = 0;
  for (const r of recent) {
    const days = Math.round((today - Date.parse(r.date)) / DAY);
    if (!(days >= 0) || days > 8) continue;
    const decay = Math.max(0, 1 - days / 8);
    if (r.id === card) pen = Math.max(pen, 1.1 * decay);
    else if (themeOf(r.id) === theme) pen = Math.max(pen, 0.55 * decay);
  }
  return pen;
}

// price N days before stats.date, from the merged drawn history
function priceDaysAgo(stats, days) {
  const target = Date.parse(stats.date) - days * DAY;
  let best = null;
  for (const r of stats.drawn || []) { const t = Date.parse(r.date); if (t <= target) best = r; else break; }
  return best?.price ?? (stats.drawn?.[0]?.price ?? null);
}

// Hyperliquid funding read: current APR vs neutral baseline + a noise flag so we never
// overclaim "leaning short/long" on a whippy series.
function fundingRead(stats) {
  const ls = (stats.longshort || []).filter(x => x?.hlFunding != null);
  if (ls.length < 8) return null;
  const aprs = ls.map(x => x.hlFunding * 24 * 365 * 100);
  const neutral = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length / 2)];
  const now = aprs.at(-1), dev = now - neutral;
  const recent = aprs.slice(-14);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  return { now, neutral, dev, noisy: sd > Math.abs(dev) * 1.2 };
}

// Each builder returns an angle {key, emoji, card, score, headline, detail, framing,
// note} or null. `score` ranks interestingness (~0..2.5); divergences get a boost.
export function computeAngles(stats, opts = {}) {
  const s = stats, out = [];
  const be = s.supply?.breakEven ?? null;
  const mvrv = (be && s.price) ? s.price / be : null;
  const under = mvrv != null ? 1 - mvrv : null;            // >0 = avg holder underwater
  const diamond = s.supply?.diamondShare ?? null;          // 0..1 of supply
  const vsFV = s.vsCenter;                                 // price vs power-law center
  const dd = s.drawdown, fng = s.fng, band = s.band?.l ?? null;
  const r7 = s.price / (priceDaysAgo(s, 7) || s.price) - 1;
  const r30 = s.price / (priceDaysAgo(s, 30) || s.price) - 1;
  const fund = fundingRead(s);
  const push = a => a && out.push(a);

  // ── RECENT BEHAVIOUR: trends over the on-chain history (opts.onchain), if given.
  // Lets the reads see the DIRECTION of travel, not just today's snapshot. Degrades
  // to nothing when history is absent/flat.
  const oc = opts.onchain || [];
  const span = oc.length ? Math.round((Date.parse(s.date) - Date.parse(oc[0].d)) / DAY) : 0;
  const win = Math.min(30, Math.max(14, span));                 // trend window, capped by data
  const past = oc.length ? [...oc].reverse().find(r => Date.parse(r.d) <= Date.parse(s.date) - win * DAY) : null;
  const holderGrowth = (past?.holders && s.supply?.holders) ? s.supply.holders / past.holders - 1 : null;
  const mvrvPast = (past?.be && past?.p) ? past.p / past.be : null;
  const mvrvTrend = (mvrv != null && mvrvPast != null) ? mvrv - mvrvPast : null;
  const dser = s.supply?.diamondSeries || [];                   // [ts, percent]
  const dPast = dser.length ? [...dser].reverse().find(p => p[0] <= Date.parse(s.date) - win * DAY) : null;
  const diamondNow = dser.length ? dser.at(-1)[1] : (diamond != null ? diamond * 100 : null);
  const diamondTrend = (diamondNow != null && dPast) ? diamondNow - dPast[1] : null;

  // ── CROSS-METRIC DIVERGENCES (the interesting reads) ─────────────────────────
  if (under != null && under > 0.1 && diamond != null && diamond > 0.5) {
    const dir = mvrvTrend != null && Math.abs(mvrvTrend) >= 0.03
      ? ` MVRV has ${mvrvTrend > 0 ? "risen" : "slipped"} ${round(mvrvPast, 2)}→${round(mvrv, 2)} over ~${win}d.` : "";
    push({
      key: "underwater-holding", emoji: "💎", card: "breakeven", score: 1.2 + under * 1.6 + (diamond - 0.5),
      headline: `Holders ~${Math.round(under * 100)}% underwater — and still not selling`,
      detail: `MVRV ${round(mvrv, 2)}: price is ${Math.round(under * 100)}% below the crowd's avg on-chain cost basis ($${round(be, 3)}). Yet ${Math.round(diamond * 100)}% of supply is in the longest-held tier — the float isn't moving.${dir}`,
      framing: `Maximum financial pain, minimal capitulation — conviction being tested and, so far, holding.`,
      note: `Describe the divergence, NOT a bottom call. "Not selling", not "buy".`,
    });
  }
  // Accumulation: holder COUNT rising = genuinely new wallets (safe to call accumulation)
  if (holderGrowth != null && holderGrowth > 0.02) push({
    key: "accumulation", emoji: "🧲", card: "holdergrowth",
    score: 0.9 + Math.min(0.8, holderGrowth * 8) + (r30 < 0.05 ? 0.4 : 0),
    headline: `Holders +${(holderGrowth * 100).toFixed(1)}% in ~${win}d${r30 < 0.05 ? " — while price went nowhere" : ""}`,
    detail: `Wallet count grew ${(holderGrowth * 100).toFixed(1)}% over ~${win} days (${fmt(past.holders)}→${fmt(s.supply.holders)}) — genuinely new holders${r30 < 0.05 ? `, even with price ${pct(r30)} on the month` : ""}.`,
    framing: `New wallets = real accumulation (not a reclassification). Buying while it's quiet.`,
    note: `Holder COUNT growth IS safe to call accumulation (unlike diamond-tier aging).`,
  });
  // MVRV direction: are holders clawing back toward break-even, or sinking further?
  if (mvrvTrend != null && Math.abs(mvrvTrend) >= 0.05) push({
    key: "mvrv-trend", emoji: mvrvTrend > 0 ? "↗️" : "↘️", card: "breakeven",
    score: 0.8 + Math.min(0.7, Math.abs(mvrvTrend) * 2),
    headline: `Holders ${mvrvTrend > 0 ? "clawing back toward" : "sinking further from"} break-even`,
    detail: `MVRV has ${mvrvTrend > 0 ? "risen" : "fallen"} ${round(mvrvPast, 2)}→${round(mvrv, 2)} over ~${win}d — the average holder is ${mvrvTrend > 0 ? "less" : "more"} underwater than ~${win}d ago.`,
    framing: `Direction of the crowd's PnL, not just today's level.`, note: `Trend read; don't imply it continues.`,
  });
  // Diamond tier growing over time (a cohort aging into the longest-held bucket)
  if (diamondTrend != null && diamondTrend >= 0.4) push({
    key: "diamond-trend", emoji: "💠", card: "diamondtrend",
    score: 0.7 + Math.min(0.7, diamondTrend / 3),
    headline: `Diamond tier grew ${diamondTrend.toFixed(1)}pp in ~${win}d → ${diamondNow.toFixed(1)}% of supply`,
    detail: `Supply in the longest-held tier rose ${(diamondNow - diamondTrend).toFixed(1)}%→${diamondNow.toFixed(1)}% over ~${win} days — a cohort maturing into diamond.`,
    framing: `Float tightening as coins age into the strongest-held tier.`,
    note: `HELD, not BOUGHT — diamond grows by aging; frame it as maturing/held.`,
  });
  if (r30 > 0.08 && fng != null && fng < 35) {
    push({
      key: "recovery-disbelief", emoji: "📈", card: "fngdial", score: 0.9 + Math.min(0.6, r30) + (35 - fng) / 60,
      headline: `Up ${pct(r30)} in 30d, but Fear & Greed is still ${fng}`,
      detail: `Price has recovered ${pct(r30)} over the month while sentiment sits at ${fng} (fear). The move isn't being believed yet.`,
      framing: `Recovery running ahead of sentiment — the crowd hasn't caught up.`,
      note: `Not a prediction; just the sentiment-vs-price gap.`,
    });
  }
  if (vsFV != null && vsFV < -0.6 && fng != null && fng < 30) {
    push({
      key: "capitulation-cluster", emoji: "🧊", card: "riskcolor", score: 1.0 + (-vsFV - 0.6) * 2 + (30 - fng) / 50,
      headline: `${pct(vsFV)} below trend AND fear at ${fng}`,
      detail: `Deep in the ${band} band (${pct(vsFV)} vs the power-law fair value $${round(s.center, 3)}) with Fear & Greed at ${fng}. Valuation and sentiment bottoming together.`,
      framing: `Where value and fear overlap — historically the account's best-resonating zone.`,
      note: `Honest "cheap + fearful", never "guaranteed bounce".`,
    });
  }

  // ── SINGLE-METRIC EXTREMES / STATES ──────────────────────────────────────────
  if (vsFV != null && vsFV < -0.55) push({
    key: "deep-value", emoji: "🟣", card: "valuation", score: 0.5 + Math.min(1.0, -vsFV),
    headline: `${pct(vsFV)} below its long-run trend (${band} band)`,
    detail: `Fair value for its age is $${round(s.center, 2)}; price sits ${pct(vsFV)} under it.`,
    framing: `Where today sits in the long power-law arc.`, note: `Not a prediction.`,
  });
  if (dd != null && dd < -0.6) push({
    key: "drawdown", emoji: "📉", card: "underwater", score: 0.5 + Math.min(1.0, -dd * 1.2),
    headline: `${pct(dd)} below its all-time high`,
    detail: `Deepest drawdown on record was ${pct(s.maxDrawdown)}; it has made new highs after every prior one so far.`,
    framing: `Deep drawdowns are the toll — it's paid them before (no recovery promise).`,
    note: `It's deep and unrecovered NOW; don't imply it always recovers.`,
  });
  if (fund && !fund.noisy && Math.abs(fund.dev) > 4) push({
    key: "positioning", emoji: "⚖️", card: "longshort", score: 0.6 + Math.min(0.8, Math.abs(fund.dev) / 15),
    headline: `Perp funding ${fund.dev > 0 ? "above" : "below"} neutral by ${Math.round(Math.abs(fund.dev))}pp`,
    detail: `Funding ${Math.round(fund.now)}% APR vs the ~${Math.round(fund.neutral)}% neutral baseline — crowd leaning ${fund.dev > 0 ? "long" : "short"}.`,
    framing: `Where the derivatives crowd is positioned right now.`, note: `Positioning, not a signal.`,
  });
  if (fund && fund.noisy && Math.abs(fund.dev) > 4) push({
    key: "positioning-noisy", emoji: "〰️", card: "longshort", score: 0.3,
    headline: `Funding choppy around neutral`,
    detail: `Funding is whippy (recently spiked far from the ~${Math.round(fund.neutral)}% neutral and snapped back) — no clean positioning read today.`,
    framing: `Froth in/out, no durable lean.`, note: `Do NOT claim long/short lean — it's noise.`,
  });
  if (fng != null && (fng <= 25 || fng >= 75)) push({
    key: "fng-extreme", emoji: fng <= 25 ? "🧊" : "🔥", card: "fngdial", score: 0.5 + Math.abs(fng - 50) / 60,
    headline: `Fear & Greed at ${fng} — ${fng <= 25 ? "extreme fear" : "extreme greed"}`,
    detail: `Sentiment is at a ${fng <= 25 ? "fearful" : "greedy"} extreme (${fng}/100).`,
    framing: `Crowd emotion at an edge.`, note: `Contrarian-flavoured but never a promise.`,
  });
  if (Math.abs(r7) > 0.15) push({
    key: "momentum", emoji: "⚡", card: "runningroi", score: 0.4 + Math.min(0.7, Math.abs(r7)),
    headline: `${pct(r7)} over the past 7 days`,
    detail: `A ${r7 > 0 ? "sharp move up" : "sharp pullback"} this week (${pct(r7)}).`,
    framing: `Short-term momentum.`, note: `A week is noise; frame it as such.`,
  });
  const t1 = s.targets?.find(t => t.price === 1);
  if (t1 && s.price >= 0.4) push({
    key: "dollar-proximity", emoji: "🎯", card: "targets", score: 0.3 + Math.max(0, 0.6 - (t1.mult - 1)),
    headline: `${round(t1.mult, 1)}× from $1`,
    detail: `At $${round(s.price, 4)}, it's ${round(t1.mult, 1)}× away from the $1 milestone.`,
    framing: `The aspirational round number.`, note: `A target, not a forecast.`,
  });

  // ── BREADTH: the rest of the data — BTC/peers, performance flex, heat, cycle. Mostly
  // lower-scoring "evergreen" reads that only rise to the top on a quiet day, so the
  // Quant always has a card to reach for across the full catalog. ──
  if (s.btc?.rel365 != null && Math.abs(s.btc.rel365 - 1) > 0.15) {
    const beat = s.btc.rel365 > 1;
    push({
      key: "vs-btc", emoji: "₿", card: "spxbtc", score: 0.55 + Math.min(0.6, Math.abs(s.btc.rel365 - 1)),
      headline: `${beat ? "Outrunning" : "Lagging"} Bitcoin over the past year`,
      detail: `365-day relative strength vs BTC is ${round(s.btc.rel365, 2)}× — SPX6900 has ${beat ? "beaten" : "trailed"} Bitcoin over the year.`,
      framing: `The honest scoreboard vs crypto's benchmark.`, note: `Relative strength, not a call.`,
    });
  }
  const spLaunch = SP500_HISTORY.find(([d]) => d >= s.firstDate)?.[1] ?? SP500_HISTORY[0]?.[1];
  const spNow = s.sp ?? SP500_HISTORY.at(-1)?.[1];
  if (spLaunch && spNow && s.allTimeReturn != null) {
    push({
      key: "vs-sp", emoji: "🏦", card: "spxvssp", score: 0.35,
      headline: `${round(1 + s.allTimeReturn, 0)}× vs the S&P's ${round(spNow / spLaunch, 2)}× since launch`,
      detail: `Since ${s.firstDate}, SPX6900 is ${round(1 + s.allTimeReturn, 0)}× while the S&P 500 is ${round(spNow / spLaunch, 2)}× — the index it's named after.`,
      framing: `Two honest returns from day one.`, note: `A flex, not a forecast.`,
    });
  }
  // ── NEWER on-chain reads (charts shipped after the first quant pass — keep the scan current) ──
  const ocL = Array.isArray(s.onchain) ? s.onchain.at(-1) : null;
  // NUPL — net unrealised P/L, a pure transform of MVRV (1 − 1/MVRV). Below zero = crowd underwater.
  const mv = (Array.isArray(s.mvrvSeries) && s.mvrvSeries.length) ? s.mvrvSeries.at(-1).mvrv : (ocL?.mvrv ?? null);
  if (mv > 0) {
    const nupl = 1 - 1 / mv;
    const zone = nupl < 0 ? "capitulation" : nupl < 0.25 ? "hope / fear" : nupl < 0.5 ? "optimism" : nupl < 0.75 ? "belief" : "euphoria";
    push({
      key: "nupl", emoji: nupl < 0 ? "🩸" : "🟢", card: "nupl", score: 0.5 + Math.min(1.0, Math.abs(nupl) * 1.5) + (nupl < 0 ? 0.3 : 0),
      headline: `NUPL ${round(nupl, 2)} — ${zone}`,
      detail: `Net unrealised profit/loss is ${round(nupl, 2)} (from MVRV ${round(mv, 2)}) — the market sits in the ${zone} zone.`,
      framing: `Aggregate holder profitability. ${nupl < 0 ? "Below zero = the crowd is underwater, historically an accumulation zone." : "Above zero = net in profit."}`,
      note: `A position read, not a signal.`,
    });
  }
  // Supply in profit — % of held coins above their cost basis.
  if (ocL?.sip != null) {
    const sip = ocL.sip, extreme = sip <= 45 || sip >= 90;
    push({
      key: "supply-in-profit", emoji: "💰", card: "supplyprofit", score: 0.4 + (extreme ? 0.6 : 0) + Math.abs(sip - 60) / 90,
      headline: `${round(sip, 0)}% of supply is in profit`,
      detail: `${round(sip, 0)}% of tracked supply is held above its on-chain cost basis — low is a capitulation zone, high is euphoria risk.`,
      framing: `${sip <= 45 ? "Deep value — most of the market is underwater." : sip >= 90 ? "Stretched — almost everyone is green." : "Mid-range holder profitability."}`,
      note: `A position read, not a signal.`,
    });
  }
  // Conviction — % of supply held 1y+ (the diamond base).
  if (Array.isArray(ocL?.age) && ocL.age.length >= 5 && ocL.age[4] != null) {
    const y1 = ocL.age[4];
    push({
      key: "conviction-1y", emoji: "💎", card: "hodlwaves", score: 0.35 + Math.max(0, (y1 - 50) / 60),
      headline: `${round(y1, 0)}% of supply held over a year`,
      detail: `${round(y1, 0)}% of tracked supply hasn't moved in 12 months — the deep-conviction base, comparable to Bitcoin at the same age.`,
      framing: `A ${round(y1, 0)}% one-year-plus base — the cohort that held through everything.`,
      note: `Coin age from the FIFO reconstruction.`,
    });
  }

  // Survivorship — all-time churn vs today's-holders conviction (the "who's still here" story).
  const cov = s.cohorts?.overall;
  if (cov && cov.everHeld && cov.holdNow != null) {
    push({
      key: "survivorship", emoji: "🪦", card: "survivorship", score: 0.5 + Math.min(0.5, (cov.gonePct || 0) / 130) + (cov.diamondPct >= 88 ? 0.3 : 0),
      headline: `${cov.gonePct}% of all-time holders are gone — ${cov.diamondPct}% of today's never sold to zero`,
      detail: `Of ${fmt(cov.everHeld)} wallets that ever held ≥5k SPX, ${fmt(cov.holdNow)} remain (${cov.gonePct}% churned). Yet ${cov.diamondPct}% of CURRENT holders have never once sold to zero — survivorship.`,
      framing: `Enormous all-time churn, but the survivors are diamond-handed. The honest "who's still here" read.`,
      note: `Right-censoring: recent cohorts read high. "Gone" = fell below the 5k bar.`,
    });
  }
  // Multichain holder base — ETH + Base + Solana headcount (reach vs value split).
  if (Array.isArray(s.chainWallets) && s.chainWallets.length) {
    const cw = s.chainWallets.at(-1), total = (cw.eth || 0) + (cw.base || 0) + (cw.sol || 0);
    const cw30 = s.chainWallets.at(-31) || s.chainWallets[0], t30 = (cw30.eth || 0) + (cw30.base || 0) + (cw30.sol || 0);
    const g = t30 ? total / t30 - 1 : 0;
    if (total > 0) push({
      key: "multichain", emoji: "🌐", card: "walletgrowth", score: 0.45 + Math.min(0.5, Math.abs(g) * 6),
      headline: `${fmt(total)} holders across 3 chains`,
      detail: `ETH ${fmt(cw.eth)} · Base ${fmt(cw.base)} · Solana ${fmt(cw.sol)} = ${fmt(total)} wallets${g > 0.005 ? `, +${(g * 100).toFixed(1)}% in ~30d` : ""}. Base leads on headcount, ETH on value.`,
      framing: `The real reach: ${fmt(total)} wallets across three chains — most people on Base/Solana, most value on ETH.`,
      note: `Wallets, not people; Base/Solana are bridged.`,
    });
  }
  // SOPR — spent-output profit ratio (>1 = coins moving at a profit, <1 = at a loss).
  const sopr = s.onchain?.at(-1)?.sopr;
  if (sopr > 0) {
    const inProfit = sopr >= 1;
    push({
      key: "sopr", emoji: inProfit ? "💵" : "🔻", card: "sopr", score: 0.4 + Math.min(0.5, Math.abs(sopr - 1) * 4),
      headline: `SOPR ${round(sopr, 3)} — coins moving at a ${inProfit ? "profit" : "loss"}`,
      detail: `Spent-output profit ratio is ${round(sopr, 3)}: coins that moved on-chain realised ${inProfit ? "a gain" : "a loss"} on average. Sustained <1 = capitulation, >1 = profit-taking.`,
      framing: `On-chain realised behaviour — ${inProfit ? "profit-taking" : "loss-realisation"} (SOPR ${round(sopr, 3)}).`,
      note: `Only coins that MOVED; a behaviour read, not a signal.`,
    });
  }
  // MVRV vs Bitcoin — SPX's (unitless) MVRV positioned on BTC's decade of MVRV history.
  const spxMvrv = s.onchain?.at(-1)?.mvrv ?? mvrv;
  if (spxMvrv > 0 && Array.isArray(s.btcMvrv) && s.btcMvrv.length > 50) {
    const vals = s.btcMvrv.map(r => r[1]).filter(x => x > 0);
    const pctile = Math.round(vals.filter(v => v < spxMvrv).length / vals.length * 100);
    push({
      key: "mvrv-vs-btc", emoji: "₿", card: "mvrvbtc", score: 0.5 + (pctile <= 10 || pctile >= 90 ? 0.5 : 0) + Math.abs(pctile - 50) / 120,
      headline: `SPX's MVRV ${round(spxMvrv, 2)} = ${pctile}th percentile of Bitcoin's history`,
      detail: `SPX's MVRV of ${round(spxMvrv, 2)} sits at the ${pctile}th percentile of Bitcoin's entire MVRV history — ${pctile <= 15 ? "as cheap as BTC's generational bottoms" : pctile >= 85 ? "as rich as BTC's tops" : "mid-range for BTC"}.`,
      framing: `MVRV is unitless, so it's comparable: SPX today is at BTC's ${pctile}th percentile.${pctile <= 15 ? " BTC was only this cheap at major bottoms." : ""}`,
      note: `A position on BTC's map, not a date-match forecast.`,
    });
  }
  // Alt-market — SPX vs the alt sector (ex-BTC/ETH/stables), detrended z from its own trend.
  try {
    const z = buildAltRainbow(s.history || [])?.cur?.z;
    if (z != null && Math.abs(z) >= 0.5) {
      const cheap = z < 0;
      push({
        key: "alt-market", emoji: cheap ? "🟢" : "🔴", card: "altmarket", score: 0.45 + Math.min(0.6, Math.abs(z) / 2.5),
        headline: `${round(z, 1)}σ ${cheap ? "below" : "above"} its trend vs the alt market`,
        detail: `SPX ÷ the alt sector (ex-BTC/ETH/stables), detrended, sits ${round(Math.abs(z), 1)}σ ${cheap ? "below" : "above"} its own trend — ${cheap ? "cheap vs alts" : "stretched vs alts"}.`,
        framing: `Relative value vs the whole alt sector — ${round(z, 1)}σ ${cheap ? "cheap" : "rich"}. SPX structurally outperforms alts, so this is deviation from ITS trend, not parity.`,
        note: `A relative-value position, not a signal.`,
      });
    }
  } catch { /* alt data optional */ }
  // Same-age vs the legends — SPX's multiple-since-launch vs a major at the SAME age.
  try {
    const spxMult = 1 + (s.allTimeReturn ?? 0);
    const ageDays = Math.round((Date.parse(s.date) - Date.parse(s.firstDate)) / DAY);
    const peerMult = hist => { if (!Array.isArray(hist) || !hist.length) return null; const p0 = hist[0][1]; const row = hist.find(r => r[0] >= ageDays) || hist.at(-1); return p0 > 0 ? row[1] / p0 : null; };
    const peers = [["Bitcoin", BTC_HISTORY, "btcage"], ["Ethereum", ETH_HISTORY, "ethage"], ["Solana", SOL_HISTORY, "solage"]]
      .map(([name, hist, card]) => ({ name, card, m: peerMult(hist) })).filter(p => p.m > 0);
    if (spxMult > 1 && peers.length) {
      const best = peers.sort((a, b) => Math.abs(Math.log(a.m / spxMult)) - Math.abs(Math.log(b.m / spxMult)))[0]; // closest = the real rhyme
      push({
        key: "same-age", emoji: "🏁", card: best.card, score: 0.4 + Math.min(0.4, Math.abs(Math.log10(spxMult)) / 5),
        headline: `${round(spxMult, 0)}× at this age — vs ${best.name}'s ${round(best.m, 0)}×`,
        detail: `At the same age since launch (~${Math.round(ageDays / 365)}yr), SPX6900 is ${round(spxMult, 0)}× vs ${best.name}'s ${round(best.m, 0)}× at the same point in its life.`,
        framing: `History rhymes: at this age SPX is ${round(spxMult, 0)}×, ${best.name} was ${round(best.m, 0)}×. A same-age comparison, not a forecast.`,
        note: `Both indexed to their own launch; close-based.`,
      });
    }
  } catch { /* peer histories optional */ }

  if (s.lastFireSale?.sinceGain != null) {
    const g = s.lastFireSale.sinceGain, ranHigher = s.lastFireSale.peakGain > g + 0.03;
    push({
      key: "firesale-rally", emoji: "🔥", card: "firesalerally", score: 0.45 + Math.min(0.5, Math.abs(g)),
      headline: `${pct(g)} since the last Fire Sale low (${s.lastFireSale.date})`,
      detail: `Off the ${s.lastFireSale.date} capitulation low ($${round(s.lastFireSale.low, 3)}), price is ${pct(g)}${ranHigher ? `, having peaked ${pct(s.lastFireSale.peakGain)}` : ""}.`,
      framing: `Every capitulation-band low has rallied off it.`, note: `Pattern, not a promise; the chart shows the first 90 days.`,
    });
  }
  const pts = (s.drawn || []).map(r => ({ t: Date.parse(r.date), p: r.price }));
  if (pts.length > 20) {
    const T = pts.at(-1).t, WK = 140 * DAY; let sum = 0, n = 0;
    for (const q of pts) if (q.t > T - WK && q.t <= T) { sum += q.p; n++; }
    const ext = s.price / (n ? sum / n : pts[0].p) - 1;
    if (Math.abs(ext) > 0.25) push({
      key: "heat", emoji: ext > 0 ? "🌡️" : "❄️", card: "riskheat", score: 0.5 + Math.min(0.5, Math.abs(ext)),
      headline: `${pct(ext)} ${ext > 0 ? "above" : "below"} its 20-week average`,
      detail: `Price is ${pct(ext)} ${ext > 0 ? "stretched above" : "discounted below"} its 20-week moving average — the short-term line it reverts toward.`,
      framing: `Short-term heat vs the 20W line.`, note: `Mean-reversion read, not a signal.`,
    });
  }
  // Golden/death cross: score high when a cross is FRESH (last ~14d) or imminent
  // (within ~4% and converging) — a genuine event; otherwise a quiet evergreen.
  const gc = goldenCross(s.drawn || []);
  if (gc.gap != null) {
    const last = gc.crosses.at(-1);
    const fresh = last && (Date.parse(s.date) - last.ts) / DAY <= 14;
    const near = gc.gap < 0 && gc.gap > -0.06;   // matches crossState's "watch" band
    if (fresh) push({
      key: "cross-fresh", emoji: last.type === "golden" ? "✨" : "☠️", card: "goldencross", score: 1.3,
      headline: `SPX6900 just printed a ${last.type} cross`,
      detail: `The 50-day moving average ${last.type === "golden" ? "crossed UP through" : "crossed DOWN through"} the 200-day — the classic ${last.type} cross, ${Math.round((Date.parse(s.date) - last.ts) / DAY)}d ago.`,
      framing: `The most-watched trend line in markets just flipped.`, note: `A widely-watched line, NOT a signal.`,
    });
    else if (near) push({
      key: "cross-watch", emoji: "⏳", card: "goldencross", score: 0.9,
      headline: `${Math.round(Math.abs(gc.gap) * 100)}% from a golden cross`,
      detail: `The 50-day average is just ${Math.round(Math.abs(gc.gap) * 100)}% below the 200-day and converging — the closest to a golden cross in a while.`,
      framing: `A recognisable trend event brewing.`, note: `Watch, not a call; crosses can whipsaw.`,
    });
  }

  try {
    const c = btcCycleProjection();
    if (c?.btcFrom) { const m = new Date(c.btcFrom).toLocaleString("en-US", { month: "short", year: "2-digit" });
      push({
        key: "cycle-rhyme", emoji: "🔮", card: "cycle", score: 0.3,
        headline: `Today rhymes with Bitcoin's ${m}`,
        detail: `Aligning SPX's launch to Bitcoin's last cycle puts today near BTC's ${m} — just off the post-top low.`,
        framing: `A timing rhyme (amplitude differs), not a forecast.`, note: `Rhyme, not a prediction.`,
      });
    }
  } catch { /* projection optional */ }

  // Recency look-back: penalise angles whose card (or theme) was fired recently.
  for (const a of out) {
    const pen = cardRecencyPenalty(a.card, opts.recent, s.date);
    if (pen > 0) { a.score -= pen; a.firedRecently = true; }
  }
  return out.sort((a, b) => b.score - a.score);
}

// Compact form for prompts/strips: top N, rounded scores, only the fields a consumer needs.
export function topAngles(stats, n = 6, opts = {}) {
  return computeAngles(stats, opts).slice(0, n).map(a => ({
    read: a.headline, why: a.detail, card: a.card, framing: a.framing, guardrail: a.note,
    score: round(a.score, 2), ...(a.firedRecently ? { firedRecently: true } : {}),
  }));
}
