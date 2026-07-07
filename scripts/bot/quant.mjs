// The "Quant" — crunches the day's already-computed stats into a RANKED list of
// candidate ANGLES (reads worth posting), each mapped to the card that expresses it.
// Cross-metric DIVERGENCES (the genuinely interesting stuff — e.g. "underwater but
// not selling") score above single-metric extremes ("price is cheap"). Feeds the
// control agent so a free model reasons FROM angles instead of raw fields, and can
// power the "Notable today" strip. Pure: no fetch, no render — it only reads numbers
// already computed by computeStats (honesty rule: never invents figures).

const pct = (x, d = 0) => (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
const round = (x, d = 2) => (x == null ? null : Number(x.toFixed(d)));

// price N days before stats.date, from the merged drawn history
function priceDaysAgo(stats, days) {
  const target = Date.parse(stats.date) - days * 86400000;
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

// Each builder returns an angle {key, card, score, headline, detail, framing, note} or
// null. `score` ranks interestingness (roughly 0..2.5); divergences get a boost.
export function computeAngles(stats) {
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

  // ── CROSS-METRIC DIVERGENCES (the interesting reads) ─────────────────────────
  // Underwater but holding: crowd below cost basis, yet the float isn't leaving.
  if (under != null && under > 0.1 && diamond != null && diamond > 0.5) {
    push({
      key: "underwater-holding", card: "breakeven", score: 1.2 + under * 1.6 + (diamond - 0.5),
      headline: `Holders ~${Math.round(under * 100)}% underwater — and still not selling`,
      detail: `MVRV ${round(mvrv, 2)}: price is ${Math.round(under * 100)}% below the crowd's avg on-chain cost basis ($${round(be, 3)}). Yet ${Math.round(diamond * 100)}% of supply is in the longest-held tier — the float isn't moving.`,
      framing: `Maximum financial pain, minimal capitulation — conviction being tested and, so far, holding.`,
      note: `Describe the divergence, NOT a bottom call. "Not selling", not "buy".`,
    });
  }
  // Recovery not believed: price up over 30d but sentiment still fearful.
  if (r30 > 0.08 && fng != null && fng < 35) {
    push({
      key: "recovery-disbelief", card: "fngdial", score: 0.9 + Math.min(0.6, r30) + (35 - fng) / 60,
      headline: `Up ${pct(r30)} in 30d, but Fear & Greed is still ${fng}`,
      detail: `Price has recovered ${pct(r30)} over the month while sentiment sits at ${fng} (fear). The move isn't being believed yet.`,
      framing: `Recovery running ahead of sentiment — the crowd hasn't caught up.`,
      note: `Not a prediction; just the sentiment-vs-price gap.`,
    });
  }
  // Cheap AND fearful: valuation floor lining up with fear.
  if (vsFV != null && vsFV < -0.6 && fng != null && fng < 30) {
    push({
      key: "capitulation-cluster", card: "riskcolor", score: 1.0 + (-vsFV - 0.6) * 2 + (30 - fng) / 50,
      headline: `${pct(vsFV)} below trend AND fear at ${fng}`,
      detail: `Deep in the ${band} band (${pct(vsFV)} vs the power-law fair value $${round(s.center, 3)}) with Fear & Greed at ${fng}. Valuation and sentiment bottoming together.`,
      framing: `Where value and fear overlap — historically the account's best-resonating zone.`,
      note: `Honest "cheap + fearful", never "guaranteed bounce".`,
    });
  }

  // ── SINGLE-METRIC EXTREMES / STATES ──────────────────────────────────────────
  if (vsFV != null && vsFV < -0.55) push({
    key: "deep-value", card: "valuation", score: 0.5 + Math.min(1.0, -vsFV),
    headline: `${pct(vsFV)} below its long-run trend (${band} band)`,
    detail: `Fair value for its age is $${round(s.center, 2)}; price sits ${pct(vsFV)} under it.`,
    framing: `Where today sits in the long power-law arc.`, note: `Not a prediction.`,
  });
  if (dd != null && dd < -0.6) push({
    key: "drawdown", card: "underwater", score: 0.5 + Math.min(1.0, -dd * 1.2),
    headline: `${pct(dd)} below its all-time high`,
    detail: `Deepest drawdown on record was ${pct(s.maxDrawdown)}; it has made new highs after every prior one so far.`,
    framing: `Deep drawdowns are the toll — it's paid them before (no recovery promise).`,
    note: `It's deep and unrecovered NOW; don't imply it always recovers.`,
  });
  if (fund && !fund.noisy && Math.abs(fund.dev) > 4) push({
    key: "positioning", card: "longshort", score: 0.6 + Math.min(0.8, Math.abs(fund.dev) / 15),
    headline: `Perp funding ${fund.dev > 0 ? "above" : "below"} neutral by ${Math.round(Math.abs(fund.dev))}pp`,
    detail: `Funding ${Math.round(fund.now)}% APR vs the ~${Math.round(fund.neutral)}% neutral baseline — crowd leaning ${fund.dev > 0 ? "long" : "short"}.`,
    framing: `Where the derivatives crowd is positioned right now.`, note: `Positioning, not a signal.`,
  });
  if (fund && fund.noisy && Math.abs(fund.dev) > 4) push({
    key: "positioning-noisy", card: "longshort", score: 0.3,
    headline: `Funding choppy around neutral`,
    detail: `Funding is whippy (recently spiked far from the ~${Math.round(fund.neutral)}% neutral and snapped back) — no clean positioning read today.`,
    framing: `Froth in/out, no durable lean.`, note: `Do NOT claim long/short lean — it's noise.`,
  });
  if (fng != null && (fng <= 25 || fng >= 75)) push({
    key: "fng-extreme", card: "fngdial", score: 0.5 + Math.abs(fng - 50) / 60,
    headline: `Fear & Greed at ${fng} — ${fng <= 25 ? "extreme fear" : "extreme greed"}`,
    detail: `Sentiment is at a ${fng <= 25 ? "fearful" : "greedy"} extreme (${fng}/100).`,
    framing: `Crowd emotion at an edge.`, note: `Contrarian-flavoured but never a promise.`,
  });
  if (Math.abs(r7) > 0.15) push({
    key: "momentum", card: "runningroi", score: 0.4 + Math.min(0.7, Math.abs(r7)),
    headline: `${pct(r7)} over the past 7 days`,
    detail: `A ${r7 > 0 ? "sharp move up" : "sharp pullback"} this week (${pct(r7)}).`,
    framing: `Short-term momentum.`, note: `A week is noise; frame it as such.`,
  });
  // Milestone proximity: how far to the next round meme target
  const t1 = s.targets?.find(t => t.price === 1);
  if (t1 && s.price >= 0.4) push({
    key: "dollar-proximity", card: "targets", score: 0.3 + Math.max(0, 0.6 - (t1.mult - 1)),
    headline: `${round(t1.mult, 1)}× from $1`,
    detail: `At $${round(s.price, 4)}, it's ${round(t1.mult, 1)}× away from the $1 milestone.`,
    framing: `The aspirational round number.`, note: `A target, not a forecast.`,
  });

  return out.sort((a, b) => b.score - a.score);
}

// Compact form for prompts/strips: top N, rounded scores, only the fields a consumer needs.
export function topAngles(stats, n = 6) {
  return computeAngles(stats).slice(0, n).map(a => ({
    read: a.headline, why: a.detail, card: a.card, framing: a.framing, guardrail: a.note, score: round(a.score, 2),
  }));
}
