// Rotating "daily pill" posts. Each entry turns the live stats into an
// informative blurb + a chart card (line/bar/rainbow). The bot rotates through
// them by day so followers get a different, visual angle each day.
import * as M from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";
import { CRYPTO_MILESTONES } from "../../src/milestones.js";
import { btcCycleProjection } from "../../src/btc-cycle.js";

// X discovery tags appended to each post's footer: the $SPX cashtag (X resolves
// it to SPX6900) for the in-timeline price-chart card, plus the #spx6900 hashtag.
const CASHTAG = process.env.BOT_CASHTAG || "$SPX";
const HASHTAG = "#spx6900";
// Kraken affiliate referral link (single source of truth — used by the Kraken
// CTA post and reusable by the site). Override per-run with KRAKEN_REF.
export const KRAKEN_REF = process.env.KRAKEN_REF || "https://proinvite.kraken.com/9f1e/8985jw0l";
const TIGHT = ""; // a line break that stays single (not spaced out) — for tight lists

const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMoney = n => (n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M" : "$" + (n / 1e3).toFixed(0) + "K");
const fNum = n => Math.round(n).toLocaleString();
const fUsd0 = n => "$" + Math.round(n).toLocaleString();
const fPx = p => (p >= 10 ? fUsd0(p) : fPrice(p)); // whole dollars for big cycle prices, cents below $10
const BAND_EMOJI = ["🟣", "🔵", "🟦", "🟢", "🟩", "🟡", "🟠", "🔴", "🟥"];
const BAND_SHORT = ["Fire", "BUY", "Acc", "Cheap", "HODL", "Bub", "FOMO", "SELL", "Max"];
// Cube card (milestones) colors — easy to tweak. SPX is yellow ("you are here");
// DOGE gets a distinct violet so it doesn't clash with the yellow reference.
const SPX_CUBE = "#facc15";
const CUBE_COLORS = { "PEPE ATH MC": "#22c55e", "SHIB ATH MC": "#f43f5e", "DOGE ATH MC": "#a78bfa" };
// S&P 500 total market cap (drifts over time; bump as needed). Used by the sp500 card.
const SP500_CAP = 50e12;
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

// "What if SPX6900 traces Bitcoin's last cycle?" — the projection now overlays
// the REAL BTC price path (btcCycleProjection in src/btc-cycle.js), shared with
// the website BTC Cycle tab so site and cards always agree. A what-if, not a
// forecast. fMon/fPx formatters below handle the date + big-dollar labels.

// Each builder returns { id, text, card }. card is { type, spec }.
const POSTS = [
  // 1 — valuation / rainbow
  s => ({
    id: "valuation",
    text:
`📊 Where is SPX6900 vs its long-run trend?
${BAND_EMOJI[s.bandIndex]} ${s.band.l} band — ${fPct(s.vsCenter)} vs the model's center line (${fPrice(s.center)}).
Blue bands = cheap vs trend, red = stretched. This is where it sits today.
🌈 NFA`,
    card: { type: "rainbow" },
  }),

  // 2 — risk gauge (line, 0..1)
  s => ({
    id: "risk",
    text:
`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00
0 = cheapest vs trend ever seen, 1 = the most expensive. Today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
0 = max fear, 1 = max greed. Mean reversion does the rest.
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
Every cycle looked like the end. None were.
NFA`,
    card: { type: "line", spec: {
      title: "Drawdown from all-time high", headline: fPct(s.drawdown), accent: "#f87171",
      // Headroom ABOVE 0 so the at-ATH plateaus (drawdown = 0) sit just below the
      // top frame instead of being guillotined flush against it. The 0 line is
      // labeled as the ATH baseline, and the worst-ever level gets a reference line.
      yMin: s.maxDrawdown * 1.08, yMax: Math.abs(s.maxDrawdown) * 0.08, fillBase: s.maxDrawdown * 1.08,
      yTicks: [0, -0.2, -0.4, -0.6, -0.8].filter(v => v >= s.maxDrawdown * 1.08).map(v => ({ v, label: Math.round(v * 100) + "%" })),
      series: [{ pts: s.series.drawdown, color: "#f87171", width: 3, fill: 0.18 }],
      hlines: [
        { y: 0, label: "ATH (0%)", color: "#94a3b8" },
        { y: s.maxDrawdown, label: `worst ever ${fPct(s.maxDrawdown)}`, color: "#fca5a5" },
      ],
      marker: { x: lastTs(s), y: s.drawdown, color: "#f87171" },
    } },
  }),

  // 4 — rally since last fire sale (price line, log)
  s => s.lastFireSale && (() => {
    const lowTs = Date.parse(s.lastFireSale.date);
    const pts = s.series.price.filter(([t]) => t >= lowTs);
    const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
    // Only call out the peak when it ran meaningfully above where we sit now
    // (otherwise "is +37% and peaked +37%" reads as a redundant double-stat).
    const ranHigher = s.lastFireSale.peakGain - s.lastFireSale.sinceGain > 0.03;
    return {
      id: "rally",
      text:
`🚀 Since the last "Fire Sale" low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}), SPX6900 is ${fPct(s.lastFireSale.sinceGain)}.${ranHigher ? ` Ran as high as ${fPct(s.lastFireSale.peakGain)}.` : ""}
"Fire Sales" are rare — historically some of the best windows to DCA in. The deepest red is where every run has started.
NFA`,
      card: { type: "line", spec: {
        title: `Since the last Fire Sale (${fMon(s.lastFireSale.date)})`, headline: fPct(s.lastFireSale.sinceGain), accent: "#4ade80",
        yLog: true, yTicks: decadeTicks(lo, hi),
        series: [{ pts, color: "#4ade80", width: 3.5, fill: 0.14 }],
        // Frame the move: the Fire Sale low (entry) and, if it ran meaningfully
        // higher than now, the peak.
        hlines: [
          { y: s.lastFireSale.low, color: "#64748b", label: `Fire Sale low ${fPrice(s.lastFireSale.low)}` },
          ...(ranHigher ? [{ y: s.lastFireSale.low * (1 + s.lastFireSale.peakGain), color: "#86efac", label: `peak ${fPct(s.lastFireSale.peakGain)}` }] : []),
        ],
        marker: { x: lastTs(s), y: s.price, color: "#4ade80" },
      } },
    };
  })(),

  // 5 — strategy vs HODL (two-line equity curve, log)
  s => s.series.strategy && ({
    id: "strategy",
    text:
`🧪 Hindsight check: buying every cycle dip and selling its peak would've beaten HODL ~${fMult(s.edge)} in this model.
Perfect timing isn't real — the cycles are.
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

  // 6 — targets (price line climbing toward the next target levels)
  s => {
    const next = s.targets.filter(t => t.price > s.price).slice(0, 3); // the next rungs above
    const top = next.at(-1) || s.targets.at(-1);
    return {
      id: "targets",
      text:
`🎯 SPX6900 from ${fPrice(s.price)} to the targets:
${next.map(t => `${t.label} → ${fMult(t.price / s.price)}`).join(TIGHT)}
A log-trend extrapolation, not a promise.
NFA`,
      card: { type: "line", spec: {
        title: "Climbing the target ladder", headline: `${next[0].label} = ${fMult(next[0].price / s.price)}`, accent: "#f59e0b",
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.price),
        hlines: next.map(t => ({ y: t.price, label: `${t.label} · ${fMult(t.price / s.price)}`, color: t.c })),
        series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
        marker: { x: lastTs(s), y: s.price, color: "#34d399" },
      } },
    };
  },

  // 7 — time spent this cheap (band histogram). Bars are the share of history
  // in each band (the bundled series is ~weekly, so "% of history", not "days").
  s => {
    const total = s.series.bandCounts.reduce((a, b) => a + b, 0) || 1;
    return {
      id: "timeinband",
      text:
`⏳ SPX6900 has traded in the ${s.band.l} band or cheaper for ~${Math.round(s.cheaperFrac * 100)}% of its history.
Extremes are rare; most of its life sits in the middle bands. Today: ${BAND_EMOJI[s.bandIndex]} ${s.band.l}.
NFA`,
      card: { type: "bar", spec: {
        title: "Time spent in each valuation band", headline: `${Math.round(s.cheaperFrac * 100)}% this cheap or below`, accent: s.band.c,
        bars: s.series.bandCounts.map((c, i) => ({ label: BAND_SHORT[i], value: c, text: `${Math.round(c / total * 100)}%`, color: M.BAND_LABELS[i].c, outline: i === s.bandIndex, dim: c === 0 })),
      } },
    };
  },

  // 8 — diamond-adjusted "real" market cap (locked vs float, stacked)
  s => s.supply && ({
    id: "marketcap",
    text:
`💰 SPX6900's "real" market cap
Headline MC ${fMoney(s.supply.nominalMc)} (price × 939M supply). But diamond hands hold ~${Math.round(s.supply.diamondShare * 100)}% of supply and rarely sell — so the effective free-float MC is just ${fMoney(s.supply.floatMc)}.
NFA`,
    card: { type: "stack", spec: {
      title: "Headline cap vs real free float", headline: fMoney(s.supply.floatMc) + " free float", accent: "#22d3ee",
      total: s.supply.nominalMc,
      segments: [
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
Priced in BTC is the only scoreboard that counts.
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
    card: { type: "donut", spec: {
      title: "Supply by holder conviction", headline: `${Math.round((s.supply.tiers.diamond / s.supply.classified) * 100)}% diamond hands`, accent: "#22d3ee",
      center: { big: `${Math.round((s.supply.tiers.diamond / s.supply.classified) * 100)}%`, small: "Diamond" },
      segments: TIERS.map(([k, label, c]) => ({ label, value: s.supply.tiers[k], color: c })),
    } },
  }),

  // 11 — average holder break-even / PnL (price line vs cost-basis line)
  s => s.supply && s.supply.breakEven && (() => {
    const up = s.supply.avgHolderPnl >= 0, accent = up ? "#4ade80" : "#f87171";
    const lo = Math.min(s.supply.breakEven, ...s.series.price.map(p => p[1]));
    const hi = Math.max(s.supply.breakEven, ...s.series.price.map(p => p[1]));
    return {
      id: "breakeven",
      text:
`📊 The average SPX6900 holder's entry is ~${fPrice(s.supply.breakEven)}.
At ${fPrice(s.price)} that's about ${fPct(s.supply.avgHolderPnl)} — the average holder is ${up ? "in profit" : "underwater"}.
${up ? "Most of the float is green and still holding." : "The crowd's underwater — and still hasn't sold."}
NFA`,
      card: { type: "line", spec: {
        title: "Price vs the crowd's cost basis", headline: `${fPct(s.supply.avgHolderPnl)} avg holder`, accent,
        yLog: true, yTicks: decadeTicks(lo, hi),
        hlines: [{ y: s.supply.breakEven, label: `avg entry ${fPrice(s.supply.breakEven)}`, color: "#cbd5e1" }],
        series: [{ pts: s.series.price, color: accent, width: 3, fill: 0.14 }],
        marker: { x: lastTs(s), y: s.price, color: accent },
      } },
    };
  })(),

  // 12 — SPX vs majors (relative strength, 1yr). Gated: only post when SPX is
  // actually outperforming at least one major — never lead with a pure self-own.
  // Sorted best-first so the headline always shows a win.
  s => s.majors && s.majors.some(m => m.rel365 > 0) && (() => {
    const sorted = [...s.majors].sort((a, b) => b.rel365 - a.rel365);
    const wins = sorted.filter(m => m.rel365 > 0).map(m => m.name).join(" & ");
    return {
      id: "majors",
      text:
`⚔️ SPX6900 is outperforming ${wins} over the past year:
${sorted.map(m => `${m.name}: ${fPct(m.rel365)}`).join(" · ")}
Positive = SPX beat that asset (relative) over the past year.
NFA`,
      card: { type: "bar", spec: {
        title: "SPX6900 vs majors — 1-yr relative", headline: `${sorted[0].name} ${fPct(sorted[0].rel365)}`, accent: "#818cf8",
        bars: sorted.map(m => ({ label: "vs " + m.name, value: m.rel365, text: fPct(m.rel365), color: m.rel365 >= 0 ? "#4ade80" : "#f87171" })),
      } },
    };
  })(),

  // 13 — all-time return (price history, log)
  s => ({
    id: "alltime",
    text:
`📈 From its first print (${fPrice(s.firstPrice)}, ${fMon(s.firstDate)}) SPX6900 is up ${fMult(1 + s.allTimeReturn)}.
Up only, on a power-law clock. 📈
NFA`,
    card: { type: "line", spec: {
      title: "Price since launch (log scale)", headline: fMult(1 + s.allTimeReturn) + " since launch", accent: "#34d399",
      yLog: true, yTicks: decadeTicks(s.firstPrice, s.ath),
      series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
      marker: { x: lastTs(s), y: s.price, color: "#34d399" },
    } },
  }),

  // 14 — "what if SPX traces Bitcoin's last cycle" — real BTC overlay (line, log)
  s => (() => {
    const c = btcCycleProjection();
    return {
      id: "cycle",
      text:
`🔮 Where is SPX6900 on Bitcoin's cycle clock?
If it's tracing BTC's last run, today lines up with Bitcoin around ${fMon(c.btcFrom)} — just off the bottom, early in the climb.
A for-fun what-if, not a forecast.
NFA`,
      card: { type: "line", spec: {
        title: "Where are we on Bitcoin's cycle?", headline: `We're at ≈ BTC ${fMon(c.btcFrom)}`, accent: "#f7931a",
        yLog: true, yTicks: decadeTicks(s.firstPrice, c.peakHi),
        series: [
          { pts: s.series.price, color: "#4ade80", width: 3, fill: 0.1 },
          { pts: c.projPts, color: "#f7931a", width: 3, dash: true },
        ],
        legend: [{ label: "SPX actual", color: "#4ade80" }, { label: "BTC cycle (real)", color: "#f7931a" }],
        marker: { x: c.anchorTs, y: c.anchorPrice, color: "#4ade80" },
      } },
    };
  })(),

  // 15 — projected cycle top, three scenarios (cone + projection line)
  s => (() => {
    const c = btcCycleProjection();
    const mult = p => p / s.price;
    return {
      id: "cyclepeak",
      text:
`🎯 If SPX6900 traces Bitcoin's last cycle, the projected ${fMon(c.peakTs)} top from ${fPrice(s.price)}:
${[
  `🐻 Bear  ${fPx(c.peakLo)}  →  ${fMult(mult(c.peakLo))}`,
  `🟧 Base  ${fPx(c.peak)}  →  ${fMult(mult(c.peak))}`,
  `🚀 Bull  ${fPx(c.peakHi)}  →  ${fMult(mult(c.peakHi))}`,
].join(TIGHT)}
Bitcoin's real cycle, scaled to SPX's amplitude.
NFA`,
      card: { type: "bar", spec: {
        title: `If SPX traces BTC's cycle — ${fMon(c.peakTs)} top`, headline: `Base ${fPx(c.peak)} · ${fMult(mult(c.peak))}`, accent: "#f7931a",
        bars: [
          { label: `Bear ${fPx(c.peakLo)}`, value: mult(c.peakLo), text: fMult(mult(c.peakLo)), color: "#ef4444" },
          { label: `Base ${fPx(c.peak)}`, value: mult(c.peak), text: fMult(mult(c.peak)), color: "#f7931a", outline: true },
          { label: `Bull ${fPx(c.peakHi)}`, value: mult(c.peakHi), text: fMult(mult(c.peakHi)), color: "#4ade80" },
        ],
      } },
    };
  })(),

  // 16 — the BTC overlay, future-only path (line, log)
  s => (() => {
    const c = btcCycleProjection();
    return {
      id: "cycleclock",
      text:
`⏳ SPX6900 riding Bitcoin's last cycle:
A dip near ${fPrice(c.low)} (${fMon(c.lowTs)}), then BTC's real run to a projected top near ${fPx(c.peak)} (${fMon(c.peakTs)}).
If the pattern holds, we're sitting at the launchpad.
NFA`,
      card: { type: "line", spec: {
        title: "The projected cycle, by the halving clock", headline: `Top ~${fMon(c.peakTs)}`, accent: "#f7931a",
        yLog: true, yTicks: decadeTicks(c.low, c.peakHi),
        series: [{ pts: c.projPts, color: "#f7931a", width: 3.2, fill: 0.14 }],
        marker: { x: c.peakTs, y: c.peak, color: "#f7931a" },
      } },
    };
  })(),

  // 17 — milestones: how many SPX6900s to flip the memecoin kings (cube card).
  // Each cube = 1× today's market cap; pile size = how far the ATH is. BTC is
  // off-the-chart (~5,000×) so it lives on the btcgrade card, not here.
  s => {
    const order = ["PEPE ATH MC", "SHIB ATH MC", "DOGE ATH MC"];
    const ms = order.map(l => CRYPTO_MILESTONES.find(m => m.label === l))
      .filter(m => m && m.price > s.price).map(m => ({ ...m, mult: m.price / s.price }));
    if (ms.length < 2) return null;
    const doge = ms.find(m => m.label.startsWith("DOGE")) || ms.at(-1);
    return {
      id: "milestones",
      text:
`🧊 How many SPX6900s would it take to flip the memecoin kings? From ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each cube = today's market cap. Long way up. 🚀
NFA`,
      card: { type: "cube", spec: {
        title: "How many SPX6900s to flip the giants?", headline: `${doge.short} = ${fMult(doge.mult)}`, accent: SPX_CUBE,
        items: [
          { label: "SPX6900 today", sub: "you are here", count: 1, color: SPX_CUBE, highlight: true },
          ...ms.map(m => ({ label: m.short, sub: m.mc, count: Math.round(m.mult), color: CUBE_COLORS[m.label] || m.c })),
        ],
      } },
    };
  },

  // 18 — memecoin kings only (focused milestone angle)
  s => (() => {
    const ms = CRYPTO_MILESTONES.filter(m => ["PEPE ATH MC", "SHIB ATH MC", "DOGE ATH MC"].includes(m.label) && m.price > s.price)
      .map(m => ({ ...m, mult: m.price / s.price }));
    if (ms.length < 2) return null;
    const doge = ms.find(m => m.label.startsWith("DOGE")) || ms.at(-1), top = ms.at(-1);
    return {
      id: "memecoins",
      text:
`👑 Flip the memecoin kings? From ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each × is the move to match their market cap. Coming for the throne. 👑
NFA`,
      card: { type: "line", spec: {
        title: "Flip the memecoin kings", headline: `DOGE-size = ${fMult(doge.mult)}`, accent: "#c2a633",
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.price),
        hlines: ms.map(m => ({ y: m.price, label: `${m.short} · ${fMult(m.mult)}`, color: m.c })),
        series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
        marker: { x: lastTs(s), y: s.price, color: "#34d399" },
      } },
    };
  })(),

  // 19 — Bitcoin market-cap ladder (BTC ATH milestone angle)
  s => (() => {
    const ms = CRYPTO_MILESTONES.filter(m => ["BTC @ $1K MC", "BTC @ $10K MC", "BTC @ $100K MC"].includes(m.label) && m.price > s.price)
      .map(m => ({ ...m, mult: m.price / s.price }));
    if (ms.length < 2) return null;
    const top = ms.at(-1);
    return {
      id: "btcgrade",
      text:
`₿ SPX6900 on Bitcoin's market-cap ladder. From ${fPrice(s.price)} to the cap BTC had at:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
The same market cap Bitcoin printed on its way up.
NFA`,
      card: { type: "line", spec: {
        title: "SPX6900 on Bitcoin's MC ladder", headline: `BTC @ $100K = ${fMult(top.mult)}`, accent: "#f7931a",
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.price),
        hlines: ms.map(m => ({ y: m.price, label: `${m.short} · ${fMult(m.mult)}`, color: m.c })),
        series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
        marker: { x: lastTs(s), y: s.price, color: "#34d399" },
      } },
    };
  })(),

  // 20 — how the model works (residual scatter + flattened bands; trust/explainer)
  s => s.model && (() => {
    const m = s.model;
    const pts = s.series.resid;
    return {
      id: "model",
      text:
`📐 How the SPX6900 rainbow is built
A power-law trend fit to price (R² ${m.r2.toFixed(2)}), with the distance from trend colored into percentile bands — blue = cheap, red = stretched.
Today: ${BAND_EMOJI[s.bandIndex]} ${s.band.l}, ${fPct(s.vsCenter)} vs trend. Descriptive, not a prediction.
NFA`,
      card: { type: "model", spec: {
        title: "How the SPX6900 rainbow is built", headline: `R² ${m.r2.toFixed(2)} fit · ${fPct(s.vsCenter)} vs trend`, accent: "#a78bfa",
        bands: m.bands, bandColors: M.BAND_LABELS.map(b => b.c), points: pts, markerColor: s.band.c,
      } },
    };
  })(),

  // 21 — SPX6900 vs the S&P 500: zoom out from one cube to the whole index.
  s => (() => {
    const cap = s.supply?.nominalMc || s.price * 1e9; // fully-diluted-ish market cap
    const mult = SP500_CAP / cap;
    if (!(mult > 1)) return null;
    return {
      id: "sp500",
      text:
`🧊 If SPX6900 is one cube, the whole S&P 500 is ~${fNum(mult)} of them.
SPX6900 ≈ ${fMoney(cap)} vs the S&P 500 ≈ $50T — the gap it's memeing to close.
NFA`,
      card: { type: "scale", spec: {
        title: "SPX6900 vs the S&P 500", accent: "#38bdf8", mult,
        fieldColor: "#3b82f6", originColor: SPX_CUBE,
        originLabel: `SPX6900 (${fMoney(cap)})`, fieldLabel: "S&P 500", fieldSub: "~$50T",
      } },
    };
  })(),

  // 22 — Kraken CTA: "you can buy it here". A promo poster card (not a data
  // chart), always available — no data gating. Link is the affiliate referral.
  s => ({
    id: "kraken",
    text:
`🐙 SPX6900 is now trading on Kraken.
Deep liquidity, low fees, and one of the most trusted names in crypto — the easy on-ramp is finally here.
Trade SPX6900 → ${KRAKEN_REF}
NFA`,
    card: { type: "kraken", spec: { title: "Now trading on Kraken", accent: "#7c3aed", cta: "Trade SPX6900" } },
  }),
];

export function allIds(stats) { return POSTS.map(p => p(stats)?.id).filter(Boolean); }

// Upside-forward posts get extra weight in the daily rotation so the feed skews
// bullish (they show up ~twice as often as the analytical/neutral ones).
const BULLISH = new Set([
  "milestones", "memecoins", "btcgrade", "cycle", "cyclepeak", "cycleclock",
  "targets", "rally", "alltime",
]);
// Per-post rotation weight (copies per cycle). The flagship rainbow is weighted
// up so the site's main chart surfaces ~weekly (≈3×/month); bullish posts 2×.
const WEIGHT = { valuation: 3 };
const weightOf = id => WEIGHT[id] ?? (BULLISH.has(id) ? 2 : 1);

// Build the weighted rotation order in round-robin passes (pass k includes posts
// whose weight > k). So higher-weight topics recur more often across the cycle
// without ever landing on consecutive days.
function rotation(built) {
  const maxW = Math.max(1, ...built.map(p => weightOf(p.id)));
  const rota = [];
  for (let pass = 0; pass < maxW; pass++) for (const p of built) if (weightOf(p.id) > pass) rota.push(p);
  return rota;
}

// Final formatting shared by every post: drop the inline NFA line (the card
// already says "not financial advice"), space the body into airy paragraphs,
// keep tight-list breaks single, then append the branded $SPX / #spx6900 footer.
export function withFooter(text) {
  const body = text
    .replace(/\n?(?:🌈 )?NFA\s*$/u, "")
    .replace(/\n/g, "\n\n")
    .replace(new RegExp(TIGHT, "g"), "\n");
  return `${body}\n\n🌈 ${CASHTAG} ${HASHTAG}`;
}

// Pick the post. Override with id (env BOT_POST / --post=id) for testing,
// otherwise rotate by day so the topic changes daily.
export function buildPost(stats, now = new Date(), overrideId = null) {
  const built = POSTS.map(p => p(stats)).filter(Boolean);
  const rota = rotation(built);
  const epochDay = Math.floor(now.getTime() / 86400000);
  const chosen = (overrideId && built.find(p => p.id === overrideId)) || rota[epochDay % rota.length];
  return { ...chosen, text: withFooter(chosen.text) };
}

// Marquee bands worth interrupting the feed for (the rare extremes). Used by the
// hourly band watcher — it only posts when price crosses INTO one of these.
export const MARQUEE_BANDS = new Set([0, 1, 7, 8]); // Fire Sale, BUY, SELL, Max Bubble

// Event post for a band crossing (fired by band-watch.mjs, not the rotation).
export function buildBandChangePost(s, fromIdx) {
  const to = s.bandIndex, down = to < fromIdx;
  const punch = {
    0: "The cheapest zone in the entire model — a rare, deep-discount print. 🟣",
    1: down ? "Back in accumulation territory — cheaper than most of its history." : "Reclaimed accumulation territory, climbing out of the lows. 🟦",
    7: "The hottest zone before the top — stretched well above trend. 🔥",
    8: "Top zone of the model — peak euphoria. Enjoy the ride, manage risk. 🎢",
  }[to] || "The model just reclassified where price sits.";
  const text =
`${BAND_EMOJI[to]} SPX6900 just ${down ? "dropped into" : "climbed into"} the ${s.band.l} band.
${punch}
Now ${fPct(s.vsCenter)} vs the model's center line (${fPrice(s.center)}).
NFA`;
  return { id: "bandchange", text: withFooter(text), card: { type: "rainbow" } };
}
