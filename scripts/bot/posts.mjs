// Rotating "daily pill" posts. Each entry turns the live stats into an
// informative blurb + a chart card (line/bar/rainbow). The bot rotates through
// them by day so followers get a different, visual angle each day.
import * as M from "../../src/models.js";

// X discovery tags appended to each post's footer: the $SPX cashtag (X resolves
// it to SPX6900) for the in-timeline price-chart card, plus the #spx6900 hashtag.
const CASHTAG = process.env.BOT_CASHTAG || "$SPX";
const HASHTAG = "#spx6900";

const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMoney = n => (n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M" : "$" + (n / 1e3).toFixed(0) + "K");
const fNum = n => Math.round(n).toLocaleString();
const BAND_EMOJI = ["🟣", "🔵", "🟦", "🟢", "🟩", "🟡", "🟠", "🔴", "🟥"];
const BAND_SHORT = ["Fire", "BUY", "Acc", "Cheap", "HODL", "Bub", "FOMO", "SELL", "Max"];
const TIERS = [
  ["diamond", "Diamond", "#22d3ee"], ["gold", "Gold", "#f59e0b"], ["silver", "Silver", "#cbd5e1"],
  ["bronze", "Bronze", "#b45309"], ["wood", "Wood", "#78716c"],
];

const decadeTicks = (min, max) => {
  const t = [];
  for (let e = -6; e <= 7; e++) { const v = 10 ** e; if (v >= min * 0.9 && v <= max * 1.1) t.push({ v, label: v >= 1 ? "$" + v.toLocaleString() : "$" + v }); }
  return t;
};
const lastTs = s => s.series.price.at(-1)[0];

// Each builder returns { id, text, card }. card is { type, spec }.
const POSTS = [
  // 1 — valuation / rainbow
  s => ({
    id: "valuation",
    text:
`📊 Where is SPX6900 vs its long-run trend?
${BAND_EMOJI[s.bandIndex]} ${s.band.l} band — ${fPct(s.vsCenter)} vs the model's center line (${fPrice(s.center)}).
The rainbow bands show how stretched price is from its log-regression trend.
🌈 NFA`,
    card: { type: "rainbow" },
  }),

  // 2 — risk gauge (line, 0..1)
  s => ({
    id: "risk",
    text:
`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00
0 = cheapest vs trend ever seen, 1 = the most expensive. Today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
It's how far price has stretched from its log trend, normalized over all history.
NFA`,
    card: { type: "line", spec: {
      title: "Valuation risk over time", headline: s.risk.toFixed(2) + " / 1", accent: "#22d3ee",
      yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: v.toFixed(2) })),
      series: [{ pts: s.series.risk, color: "#22d3ee", width: 3, fill: 0.18 }],
      marker: { x: lastTs(s), y: s.risk, color: "#22d3ee" },
    } },
  }),

  // 3 — drawdown from ATH (area)
  s => ({
    id: "drawdown",
    text:
`📉 SPX6900 is ${fPct(s.drawdown)} from its all-time high (${fPrice(s.ath)}, ${fMon(s.athDate)}).
Drawdowns map the pain from each peak — the worst on record was ${fPct(s.maxDrawdown)}.
Zoom out before you panic (or FOMO).
NFA`,
    card: { type: "line", spec: {
      title: "Drawdown from all-time high", headline: fPct(s.drawdown), accent: "#f87171",
      yMin: s.maxDrawdown * 1.05, yMax: 0, fillBase: s.maxDrawdown * 1.05,
      yTicks: [0, -0.2, -0.4, -0.6, -0.8].filter(v => v >= s.maxDrawdown * 1.05).map(v => ({ v, label: Math.round(v * 100) + "%" })),
      series: [{ pts: s.series.drawdown, color: "#f87171", width: 3, fill: 0.18 }],
      marker: { x: lastTs(s), y: s.drawdown, color: "#f87171" },
    } },
  }),

  // 4 — rally since last fire sale (price line, log)
  s => s.lastFireSale && (() => {
    const lowTs = Date.parse(s.lastFireSale.date);
    const pts = s.series.price.filter(([t]) => t >= lowTs);
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    return {
      id: "rally",
      text:
`🚀 Since the last "Fire Sale" capitulation low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}), SPX6900 is ${fPct(s.lastFireSale.sinceGain)} — and peaked ${fPct(s.lastFireSale.peakGain)} along the way.
The rally chart tracks every recovery from the cheapest band.
NFA`,
      card: { type: "line", spec: {
        title: `Since the last Fire Sale (${fMon(s.lastFireSale.date)})`, headline: fPct(s.lastFireSale.sinceGain), accent: "#4ade80",
        yLog: true, yTicks: decadeTicks(lo, hi),
        series: [{ pts, color: "#4ade80", width: 3.5, fill: 0.14 }],
        marker: { x: lastTs(s), y: s.price, color: "#4ade80" },
      } },
    };
  })(),

  // 5 — strategy vs HODL (two-line equity curve, log)
  s => s.series.strategy && ({
    id: "strategy",
    text:
`🧪 Hindsight check: buying every cycle dip and selling its peak would've beaten HODL ~${fMult(s.edge)} in this model.
Perfect timing isn't real — but it shows how much SPX6900's cycles matter.
NFA`,
    card: { type: "line", spec: {
      title: "Timing the dips vs HODL (hindsight)", headline: fMult(s.edge) + " vs HODL", accent: "#a78bfa",
      yLog: true,
      yTicks: [1, 10, 100, 1000].map(v => ({ v, label: v + "×" })),
      series: [
        { pts: s.series.strategy.map(r => [r[0], r[2]]), color: "#64748b", width: 2.5 },
        { pts: s.series.strategy.map(r => [r[0], r[1]]), color: "#4ade80", width: 3.2 },
      ],
      legend: [{ label: "Strategy", color: "#4ade80" }, { label: "HODL", color: "#64748b" }],
    } },
  }),

  // 6 — targets (bar, log heights)
  s => {
    const t3 = s.targets.slice(0, 4);
    return {
      id: "targets",
      text:
`🎯 SPX6900 from ${fPrice(s.price)} to the targets:
${s.targets.slice(0, 3).map(t => `${t.label} → ${fMult(t.mult)}`).join("\n")}
A log-trend extrapolation, not a promise.
NFA`,
      card: { type: "bar", spec: {
        title: "How far to the targets (×)", headline: `${t3[0].label} = ${fMult(t3[0].mult)}`, accent: "#f59e0b", logBars: true,
        bars: t3.map(t => ({ label: t.label, value: t.mult, text: fMult(t.mult), color: t.c })),
      } },
    };
  },

  // 7 — time spent this cheap (band histogram)
  s => ({
    id: "timeinband",
    text:
`⏳ SPX6900 has closed in the ${s.band.l} band or cheaper on ~${Math.round(s.cheaperFrac * 100)}% of all days in its history.
Extremes are rare; most of life is spent mid-bands. Today: ${BAND_EMOJI[s.bandIndex]} ${s.band.l}.
NFA`,
    card: { type: "bar", spec: {
      title: "Days spent in each valuation band", headline: `${Math.round(s.cheaperFrac * 100)}% this cheap or below`, accent: s.band.c,
      bars: s.series.bandCounts.map((c, i) => ({ label: BAND_SHORT[i], value: c, text: String(c), color: M.BAND_LABELS[i].c, outline: i === s.bandIndex, dim: c === 0 })),
    } },
  }),

  // 8 — diamond-adjusted "real" market cap (bar)
  s => s.supply && ({
    id: "marketcap",
    text:
`💰 SPX6900's "real" market cap
Headline MC ${fMoney(s.supply.nominalMc)} (price × 939M supply). But diamond hands hold ~${Math.round(s.supply.diamondShare * 100)}% of supply and rarely sell — so the effective free-float MC is just ${fMoney(s.supply.floatMc)}.
NFA`,
    card: { type: "bar", spec: {
      title: "Market cap: headline vs real free-float", headline: fMoney(s.supply.floatMc) + " free float", accent: "#22d3ee",
      bars: [
        { label: "Headline MC", value: s.supply.nominalMc, text: fMoney(s.supply.nominalMc), color: "#64748b" },
        { label: "Diamond-locked", value: s.supply.diamondValue, text: fMoney(s.supply.diamondValue), color: "#818cf8" },
        { label: "Free float", value: s.supply.floatMc, text: fMoney(s.supply.floatMc), color: "#22d3ee" },
      ],
    } },
  }),

  // 9 — valuation vs BTC (sats line)
  s => s.btc && s.btc.series && ({
    id: "btc",
    text:
`₿ SPX6900 priced in Bitcoin: 1 SPX = ${fNum(s.btc.sats)} sats.
vs BTC: ${fPct(s.btc.rel90)} (90d), ${fPct(s.btc.rel365)} (1yr).
Memecoins live or die against BTC — this is the real benchmark.
NFA`,
    card: { type: "line", spec: {
      title: "SPX6900 priced in Bitcoin (sats)", headline: fNum(s.btc.sats) + " sats", accent: "#f7931a",
      series: [{ pts: s.btc.series, color: "#f7931a", width: 3, fill: 0.16 }],
      marker: { x: s.btc.series.at(-1)[0], y: s.btc.series.at(-1)[1], color: "#f7931a" },
    } },
  }),

  // 10 — holder distribution (supply tiers bar)
  s => s.supply && s.supply.tiers && ({
    id: "distribution",
    text:
`💎 Who holds SPX6900?
Of the age-classified supply, ~${Math.round((s.supply.tiers.diamond / s.supply.classified) * 100)}% sits in "diamond" hands (longest-held), with a Gini of ${s.supply.gini.toFixed(2)} — extreme concentration.
High conviction, thin float.
NFA`,
    card: { type: "bar", spec: {
      title: "Supply by holder conviction tier", headline: `${Math.round((s.supply.tiers.diamond / s.supply.classified) * 100)}% diamond hands`, accent: "#22d3ee",
      bars: TIERS.map(([k, label, c]) => ({ label, value: s.supply.tiers[k], text: Math.round((s.supply.tiers[k] / s.supply.classified) * 100) + "%", color: c })),
    } },
  }),

  // 11 — average holder break-even / PnL (bar)
  s => s.supply && s.supply.breakEven && ({
    id: "breakeven",
    text:
`📊 The average SPX6900 holder's entry is ~${fPrice(s.supply.breakEven)}.
At ${fPrice(s.price)} that's about ${fPct(s.supply.avgHolderPnl)} — the average holder is ${s.supply.avgHolderPnl < 0 ? "underwater" : "in profit"}.
Price vs the crowd's cost basis.
NFA`,
    card: { type: "bar", spec: {
      title: "Price vs average holder's cost basis", headline: `${fPct(s.supply.avgHolderPnl)} avg holder`, accent: s.supply.avgHolderPnl < 0 ? "#f87171" : "#4ade80",
      bars: [
        { label: "Avg entry", value: s.supply.breakEven, text: fPrice(s.supply.breakEven), color: "#64748b" },
        { label: "Price now", value: s.price, text: fPrice(s.price), color: s.supply.avgHolderPnl < 0 ? "#f87171" : "#4ade80" },
      ],
    } },
  }),

  // 12 — SPX vs majors (relative strength, 1yr)
  s => s.majors && s.majors.length && ({
    id: "majors",
    text:
`⚔️ SPX6900 vs the majors (1-yr relative):
${s.majors.map(m => `${m.name}: ${fPct(m.rel365)}`).join(" · ")}
Positive = SPX outperformed that asset over the past year.
NFA`,
    card: { type: "bar", spec: {
      title: "SPX6900 vs majors — 1-yr relative", headline: `${s.majors[0].name} ${fPct(s.majors[0].rel365)}`, accent: "#818cf8",
      bars: s.majors.map(m => ({ label: "vs " + m.name, value: m.rel365, text: fPct(m.rel365), color: m.rel365 >= 0 ? "#4ade80" : "#f87171" })),
    } },
  }),

  // 13 — all-time return (price history, log)
  s => ({
    id: "alltime",
    text:
`📈 From its first print (${fPrice(s.firstPrice)}, ${fMon(s.firstDate)}) SPX6900 is up ${fMult(1 + s.allTimeReturn)}.
Zoom out: the log-regression trend still points up at a power-law pace.
NFA`,
    card: { type: "line", spec: {
      title: "Price since launch (log scale)", headline: fMult(1 + s.allTimeReturn) + " since launch", accent: "#34d399",
      yLog: true, yTicks: decadeTicks(s.firstPrice, s.ath),
      series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
      marker: { x: lastTs(s), y: s.price, color: "#34d399" },
    } },
  }),
];

export function allIds(stats) { return POSTS.map(p => p(stats)?.id).filter(Boolean); }

// Pick the post. Override with id (env BOT_POST / --post=id) for testing,
// otherwise rotate by day so the topic changes daily. The chosen text gets the
// $SPX cashtag and #spx6900 hashtag appended to its footer.
export function buildPost(stats, now = new Date(), overrideId = null) {
  const built = POSTS.map(p => p(stats)).filter(Boolean);
  const epochDay = Math.floor(now.getTime() / 86400000);
  const chosen = (overrideId && built.find(p => p.id === overrideId)) || built[epochDay % built.length];
  const text = chosen.text.replace(/NFA\s*$/, `${CASHTAG} ${HASHTAG} · NFA`);
  return { ...chosen, text };
}
