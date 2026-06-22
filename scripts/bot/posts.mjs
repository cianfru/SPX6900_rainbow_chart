// Rotating "daily pill" posts. Each entry turns the live stats into an
// informative blurb + a chart card (line/bar/rainbow). The bot rotates through
// them by day so followers get a different, visual angle each day.
import * as M from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";
import { CRYPTO_MILESTONES } from "../../src/milestones.js";
import { btcCycleProjection } from "../../src/btc-cycle.js";
import { BTC_HISTORY } from "../../src/btc-history.js";
import { ETH_HISTORY, SOL_HISTORY } from "../../src/alt-age-history.js";

// X discovery tags appended to each post's footer: the $SPX cashtag (X resolves
// it to SPX6900) for the in-timeline price-chart card, plus the #spx6900 hashtag.
const CASHTAG = process.env.BOT_CASHTAG || "$SPX";
const HASHTAG = "#spx6900";
// Kraken affiliate referral link + code (env-overridable). The link applies the
// referral on its own; the code is an inline backup for manual / screenshot signups.
const KRAKEN_REF = process.env.BOT_KRAKEN_REF || "https://proinvite.kraken.com/9f1e/8985jw0l";
const KRAKEN_CODE = process.env.BOT_KRAKEN_CODE || "k4tg7p3p";
// Fixed cadence (in days) for the Kraken promo slot — see buildPost. ~Monthly.
const KRAKEN_EVERY = 30;
const TIGHT = ""; // a line break that stays single (not spaced out) — for tight lists

const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMoney = n =>
  n >= 1e12 ? "$" + (n / 1e12).toFixed(n >= 1e13 ? 0 : 1) + "T"
  : n >= 1e9 ? "$" + (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + "B"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M"
  : "$" + (n / 1e3).toFixed(0) + "K";
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

// "SPX6900 at <major>'s age" overlay factory — shared by the BTC/ETH/SOL cards.
// Plots SPX and the peer as a multiple of each one's first print, log scale,
// x = years since launch. Honest framing: the curves cross and it's baseline-
// sensitive, so the headline stays qualitative. ETH/SOL early prices are approx.
const AGE_PEERS = [
  { id: "btcage", name: "Bitcoin", color: "#f7931a", series: BTC_HISTORY, launch: "2010-07-17", emoji: "₿",
    story: "Bitcoin is the blueprint — it dragged “internet money” from a punchline to a trillion-dollar asset, and its power-law trend, 4-year cycle and rainbow chart are the three tools this whole project is built on. Its early years were a gauntlet of 80%+ crashes that each looked terminal." },
  { id: "ethage", name: "Ethereum", color: "#8b9bff", series: ETH_HISTORY, launch: "2015-08-07", emoji: "Ξ",
    story: "Ethereum nearly died in the cradle — the 2016 DAO hack drained a third of all ETH and split the chain in two — then ran from under a dollar to four figures. Proof an early asset can take an existential hit and still become a giant." },
  { id: "solage", name: "Solana", color: "#9945ff", series: SOL_HISTORY, launch: "2020-04-11", emoji: "◎",
    story: "Solana tore from under a dollar to ~$260, then almost vanished: the FTX collapse it was tied to cut it ~96% to single digits and most pronounced it dead. It came back. The early road is rarely a straight line up." },
];
const ageCard = peer => s => (() => {
  const DAY = 86400000;
  const px = s.series.price;
  const t0 = px[0][0], p0 = px[0][1];
  if (!(p0 > 0)) return null;
  const ageNow = (px.at(-1)[0] - t0) / DAY;
  const spx = px.filter(([, p]) => p > 0).map(([ts, p]) => [(ts - t0) / DAY, p / p0]);
  const base = peer.series[0][1];
  const peerPts = peer.series.filter(([a]) => a <= ageNow + 25).map(([a, p]) => [a, p / base]);
  if (peerPts.length < 8 || spx.length < 10) return null;
  const spxMult = spx.at(-1)[1], peerMult = peerPts.at(-1)[1], ahead = spxMult >= peerMult;
  const peerYear = new Date(Date.parse(peer.launch) + ageNow * DAY).getUTCFullYear(); // when the peer was THIS age
  const xTicks = [];
  for (let y = 1; y * 365 <= ageNow + 25; y++) xTicks.push({ x: y * 365, label: `Yr ${y}` });
  const allY = [...spx, ...peerPts].map(p => p[1]);
  const yMax = Math.max(...allY), yMin = Math.min(...allY, 1);
  const yTicks = [1, 10, 100, 1000, 10000].filter(v => v >= yMin * 0.6 && v <= yMax * 1.6).map(v => ({ v, label: fMult(v) }));
  return {
    id: peer.id,
    text:
`${peer.emoji} SPX6900 vs ${peer.name}, at the same age since launch.
${peer.story}
The chart lines up both by days-since-launch, each as a multiple of its first print — so it's SPX6900 today vs ${peer.name} back around ${peerYear}, not today's ${peer.name} (which is why it keeps working: it just slides through ${peer.name}'s history as SPX ages). At this age: SPX6900 ${fMult(spxMult)} vs ${peer.name} ${fMult(peerMult)} — ${ahead ? "SPX is out front" : `${peer.name} ahead, for now`}, and the curves cross more than once.
A resemblance, not a forecast. Still early in the story.
NFA`,
    card: { type: "line", spec: {
      title: `SPX6900 vs ${peer.name}, at the same age`, headline: `Same age as early ${peer.name}`, accent: peer.color,
      yLog: true, yMin: yMin * 0.7, yMax: yMax * 1.4, yTicks, xTicks,
      series: [
        { pts: peerPts, color: peer.color, width: 3, dash: true },
        { pts: spx, color: "#4ade80", width: 3.4, fill: 0.12 },
      ],
      legend: [{ label: "SPX6900", color: "#4ade80" }, { label: `${peer.name} (same age)`, color: peer.color }],
      marker: { x: spx.at(-1)[0], y: spx.at(-1)[1], color: "#4ade80" },
    } },
  };
})();

// Each builder returns { id, text, card }. card is { type, spec }.
const POSTS = [
  // 1 — valuation / rainbow
  s => ({
    id: "valuation",
    text:
`📊 SPX6900 is trading ${Math.abs(Math.round(s.vsCenter * 100))}% ${s.vsCenter < 0 ? "below" : "above"} its long-run trend — ${BAND_EMOJI[s.bandIndex]} ${s.band.l} band.
The rainbow is a power-law model fit to SPX6900's entire price history. The center line is "fair value" for its age (${fPrice(s.center)} today); the colored bands mark how far above or below that price has historically strayed — blue = cheap vs trend, red = stretched/euphoric.
It doesn't predict anything. It just shows where today sits in that long-run context — and over a volatile asset's life, mean reversion toward the trend has done a lot of the work.
🌈 NFA`,
    card: { type: "rainbow" },
  }),

  // 2 — risk gauge (line, 0..1)
  s => ({
    id: "risk",
    text:
`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00 — today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
This isn't price, it's POSITION: where SPX6900 sits inside its own historical rainbow, squeezed onto a 0–1 scale. 0 = the cheapest vs its long-run trend it has ever been (deepest blue); 1 = the most stretched it's ever been (deepest red). Same band model as the rainbow, read as a single dial.
Historically, the low readings have been the patient-accumulation zones and the high ones the euphoria. Descriptive, not advice — 0 = max fear, 1 = max greed.
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
`🚀 SPX6900 is ${fPct(s.lastFireSale.sinceGain)} since the last "Fire Sale" low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}).${ranHigher ? ` Ran as high as ${fPct(s.lastFireSale.peakGain)}.` : ""}
A "Fire Sale" is the rainbow's deepest, coldest band — the rare stretch where price sits furthest below its long-run trend. Historically those prints have been the launchpads: every major SPX6900 run so far has started from the bottom bands, not the top.
They don't ring a bell at the low, and cheap can always get cheaper — but the deepest discounts have been where the patient got paid.
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
`🧪 ~${fMult(s.edge)} vs HODL — buying every cycle dip and selling the peak (hindsight, in this model).
The rule: accumulate when SPX6900 is deep in the blue (cheap vs trend), trim when it's deep in the red (stretched), sit in cash otherwise. Run with perfect hindsight, that timing beats simply holding by ~${fMult(s.edge)}.
The catch: nobody nails tops and bottoms live, and over-trading usually underperforms. The takeaway isn't "time it" — it's how violent SPX's swings around the trend have been. Perfect timing isn't real; the cycles are.
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
`🎯 Next target ${next[0].label} = ${fMult(next[0].price / s.price)} from ${fPrice(s.price)}:
${next.map(t => `${t.label} → ${fMult(t.price / s.price)}`).join(TIGHT)}
These rungs are round-number milestones — $1, $6.90 (the cult number), $69 and up — each showing the multiple from here. It's a log-trend extrapolation of where the rainbow's center could carry price over time, not a price prediction and not a timeline.
The point is scale: on a power-law clock, the gap between here and "obvious" levels is just a handful of doublings.
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
`⏳ SPX6900 has spent ~${Math.round(s.cheaperFrac * 100)}% of its life this cheap or cheaper (${s.band.l} band today).
The bars show how much of SPX6900's history sits in each rainbow band. Today it's ${BAND_EMOJI[s.bandIndex]} ${s.band.l} — a zone it's only matched or undercut ~${Math.round(s.cheaperFrac * 100)}% of the time. Extremes (deep blue, deep red) are rare by design; most of any asset's life is spent in the middle.
So "rare" cuts both ways: cheap like this is uncommon, but so is euphoric. Descriptive, not a signal.
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
`💰 SPX6900's real free-float market cap is just ${fMoney(s.supply.floatMc)} — vs the ${fMoney(s.supply.nominalMc)} headline.
The sticker cap (price × 939M supply) assumes every coin could hit the market. But ~${Math.round(s.supply.diamondShare * 100)}% sits in "diamond" hands — wallets that have held longest and rarely sell. Strip those out and the supply actually available to trade is far smaller, so the effective free-float cap is a fraction of the headline.
Thin float + high conviction cuts both ways: it can amplify moves in either direction.
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
Dollars hide how an asset does against the thing crypto really competes with: Bitcoin. In sats (1 BTC = 100M sats), SPX6900 is ${fPct(s.btc.rel90)} vs BTC over 90 days and ${fPct(s.btc.rel365)} over a year. Up in sats = genuinely outrunning the benchmark, not just riding a market-wide tide.
"Number go up" in dollars is easy in a bull market; up in BTC terms is the harder, truer scoreboard.
NFA`,
    card: { type: "line", spec: {
      title: "SPX6900 priced in Bitcoin (sats)", headline: fNum(s.btc.sats) + " sats", accent: "#f7931a",
      series: [{ pts: s.btc.series, color: "#f7931a", width: 3, fill: 0.16 }],
      marker: { x: s.btc.series.at(-1)[0], y: s.btc.series.at(-1)[1], color: "#f7931a" },
    } },
  }),

  // 10 — holder distribution (supply tiers donut). NB: HolderScan's conviction
  // tiers (diamond…wood) only cover *classified holder* supply (~71% of total);
  // the rest is exchanges, LPs & contracts. So "84% diamond" is a share of the
  // CLASSIFIED supply, NOT of the full 939M (the marketcap card carries the
  // 60%-of-total figure). Label it clearly so the two never read as contradictory.
  s => s.supply && s.supply.tiers && (() => {
    const diamondPct = Math.round((s.supply.tiers.diamond / s.supply.classified) * 100);
    return {
    id: "distribution",
    text:
`💎 ~${diamondPct}% of SPX6900's classified holder supply sits in "diamond" hands (longest-held, never sold).
HolderScan sorts holder wallets into conviction tiers by how long they've held — diamond (longest) down to wood. "Classified" is the supply it can age this way; it leaves out exchanges, LPs and contracts (~29% of total). Of what's left, diamonds dominate, and a Gini of ${s.supply.gini.toFixed(2)} means extreme concentration.
High conviction, thin float — the market-cap card shows what that does to the effective cap.
NFA`,
    card: { type: "donut", spec: {
      title: "Conviction of classified holder supply", headline: `${diamondPct}% diamond hands`, accent: "#22d3ee",
      footer: "Classified holder supply only — excludes exchanges, LPs & contracts",
      legendUnit: "of classified",
      center: { big: `${diamondPct}%`, small: "of classified" },
      segments: TIERS.map(([k, label, c]) => ({ label, value: s.supply.tiers[k], color: c })),
    } },
    };
  })(),

  // 11 — average holder break-even / PnL (price line vs cost-basis line)
  s => s.supply && s.supply.breakEven && (() => {
    const up = s.supply.avgHolderPnl >= 0, accent = up ? "#4ade80" : "#f87171";
    const lo = Math.min(s.supply.breakEven, ...s.series.price.map(p => p[1]));
    const hi = Math.max(s.supply.breakEven, ...s.series.price.map(p => p[1]));
    return {
      id: "breakeven",
      text:
`📊 The average SPX6900 holder's entry is ~${fPrice(s.supply.breakEven)}.
At ${fPrice(s.price)} that's about ${fPct(s.supply.avgHolderPnl)} — the average holder is ${up ? "in profit" : "underwater"}. This "cost basis" is the on-chain average price the current supply last moved at (its realized price): below it the crowd is collectively red, above it green.
${up ? "Most of the float is in profit and still holding — conviction that's survived the gains." : "The crowd's underwater and still hasn't sold — historically that's looked more like accumulation than capitulation."}
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
`⚔️ SPX6900 is ${fPct(sorted[0].rel365)} vs ${sorted[0].name} over the past year — and outpacing ${wins}:
${sorted.map(m => `${m.name}: ${fPct(m.rel365)}`).join(" · ")}
Relative strength: each figure is how SPX6900 did against that asset over the year, not in dollars. Positive = SPX beat it (grew faster or fell less) — the honest way to see whether it's actually gaining ground on the majors or just moving with the market.
One year is a short window and these flip fast — a snapshot, not a trend.
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
`📈 SPX6900 is up ${fMult(1 + s.allTimeReturn)} since its first print (${fPrice(s.firstPrice)}, ${fMon(s.firstDate)}).
That's the whole journey on one log axis — and the shape is the story: relentless higher highs punctuated by brutal drawdowns, the signature of a power-law asset early in its life. The same curve Bitcoin drew in its first years.
"Up only" is a meme, not a guarantee, and the path has been violent — but the long-run direction has been one way so far. 📈
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
`🔮 If SPX6900 is tracing Bitcoin's last cycle, today lines up with BTC around ${fMon(c.btcFrom)} — just off the bottom, early in the climb.
The idea: take Bitcoin's REAL price path through its most recent 4-year cycle and lay it over SPX6900's chart, anchored to where SPX trades now and scaled to its (much larger) swings. The orange line isn't an invented curve — it's BTC's actual history used as a template.
Crypto has rhymed to this ~4-year, halving-driven rhythm for over a decade. Whether SPX keeps following it, nobody knows — so treat it as a for-fun what-if, not a forecast.
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
`🎯 If SPX6900 traces BTC's last cycle, base case = ${fMult(mult(c.peak))} (${fPx(c.peak)}) by ${fMon(c.peakTs)}, from ${fPrice(s.price)}:
${[
  `🐻 Bear  ${fPx(c.peakLo)}  →  ${fMult(mult(c.peakLo))}`,
  `🟧 Base  ${fPx(c.peak)}  →  ${fMult(mult(c.peak))}`,
  `🚀 Bull  ${fPx(c.peakHi)}  →  ${fMult(mult(c.peakHi))}`,
].join(TIGHT)}
These three aren't price targets. They're what SPX would print IF it scaled Bitcoin's real last-cycle move at low / mid / high amplitude. Bitcoin set the shape and the timing (the ~4-year halving rhythm); the multiplier is just how hard SPX has tended to swing vs BTC.
A model of a pattern, not a promise.
NFA`,
      card: { type: "bar", spec: {
        title: `If SPX traces BTC's cycle — ${fMon(c.peakTs)} top`, headline: `${fPrice(s.price)} → ${fPx(c.peak)} base · ${fMult(mult(c.peak))}`, accent: "#f7931a",
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
`⏳ If SPX6900 rides Bitcoin's last cycle, a projected top near ${fPx(c.peak)} by ${fMon(c.peakTs)} — after a dip near ${fPrice(c.low)} (${fMon(c.lowTs)}).
This plots Bitcoin's actual last-cycle path, scaled to SPX6900 and pinned to the halving clock — the same ~4-year rhythm that has driven every crypto cycle so far. Read it as "where we'd be on that clock," not a date stamp: if SPX keeps rhyming with BTC, we're nearer the launchpad than the top.
The pattern has held for a decade, but past cycles guarantee nothing.
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
`🧊 SPX6900 is ${fMult(doge.mult)} from DOGE's ATH market cap. Flipping the memecoin kings from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each cube = one of today's SPX6900 market caps; the pile is how many it would take to match each memecoin king's all-time-high cap — PEPE, SHIB, then DOGE on the throne. The bar SPX6900 is memeing to clear.
A market-cap comparison, not a price target: "what cap, and how far," not "when." Long way up. 🚀
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
`👑 DOGE-size = ${fMult(doge.mult)} for SPX6900. Flipping the memecoin kings from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each × is the move it would take for SPX6900's market cap to match that king's all-time high — PEPE, SHIB, then DOGE at the top. SPX runs the same fair-launch, community-over-VC playbook that built them, just earlier in the story.
Market-cap math, not a forecast. Coming for the throne. 👑
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
`₿ ${top.short} = ${fMult(top.mult)} for SPX6900. Climbing Bitcoin's market-cap ladder from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each rung is the SPX6900 price at which its market cap would equal the cap Bitcoin itself had at that level — $1K, $10K, $100K BTC. It reframes "how high can it go" into "which caps have already been printed," by the asset this whole project is modelled on.
Bitcoin cleared every one of these; whether SPX does is the open question.
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
`📐 How the SPX6900 rainbow is built — a power-law trend fit to price, R² ${m.r2.toFixed(2)}.
Step 1: fit a straight line to SPX6900's price on a log-log scale (price vs age). That line is "fair value" — the rainbow's center. Step 2: measure how far each day closed above or below it (the residual), then sort those distances into percentile bands — deepest blue = the cheapest SPX has ever been vs trend, deepest red = the most stretched.
So the bands aren't drawn by hand or vibes; they're literally SPX6900's own history sorted by how cheap or rich it was. Today: ${BAND_EMOJI[s.bandIndex]} ${s.band.l}, ${fPct(s.vsCenter)} vs trend. (R² ${m.r2.toFixed(2)} just means the trend captures most of the long-run move.)
Descriptive, not a prediction.
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
SPX6900 ≈ ${fMoney(cap)} vs the S&P 500's ~$50T — the gap baked into the joke. The name is the whole bit: a memecoin "flippening" the index it's named after would be a ~${fNum(mult)}× move, which is why this card is a telescope, not a target.
A sense-of-scale gag, not a prediction — but every giant was once a rounding error.
NFA`,
      card: { type: "scale", spec: {
        title: "SPX6900 vs the S&P 500", accent: "#38bdf8", mult,
        fieldColor: "#3b82f6", originColor: SPX_CUBE,
        originLabel: `SPX6900 (${fMoney(cap)})`, fieldLabel: "S&P 500", fieldSub: "~$50T",
      } },
    };
  })(),

  // 22 — what an early $100 became (price history scaled to a $100 stake, log).
  // Relatable + screenshot-able; reuses the line card.
  s => (() => {
    const grew = p => p * 100 / s.firstPrice; // value of a $100 stake at price p
    return {
      id: "hundred",
      text:
`💸 $100 in SPX6900 at its first print (${fMon(s.firstDate)}, ${fPrice(s.firstPrice)}) is worth ${fMoney(grew(s.price))} today.
Same power-law curve as the all-time chart, just rebased to a single $100 buy — the most relatable cut of "what early looked like." The earliest holders are sitting on absurd multiples because they were early to a fair-launch asset, not because they timed anything.
Returns like this aren't repeatable on command and the ride was brutal — the lesson is about being early, not a promise.
NFA`,
      card: { type: "line", spec: {
        title: "What an early $100 turned into", headline: fMoney(grew(s.price)), accent: "#34d399",
        yLog: true, yTicks: decadeTicks(100, grew(s.ath)),
        series: [{ pts: s.series.price.map(([t, p]) => [t, grew(p)]), color: "#34d399", width: 3, fill: 0.14 }],
        marker: { x: lastTs(s), y: grew(s.price), color: "#34d399" },
      } },
    };
  })(),

  // 23 — monthly returns as a seasonality heatmap (the website's Monthly grid,
  // condensed): years × months, green up / red down, plus a compounded Year
  // column. Same month-over-month definition the site uses, so they agree.
  s => (() => {
    const byMonth = new Map();
    for (const [ts, p] of s.series.price) {
      const d = new Date(ts);
      byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), p); // last close wins
    }
    const keys = [...byMonth.keys()].sort((a, b) => a - b);
    const ret = new Map();
    for (let i = 1; i < keys.length; i++) ret.set(keys[i], byMonth.get(keys[i]) / byMonth.get(keys[i - 1]) - 1);
    if (ret.size < 8) return null;
    const y0 = Math.floor(keys[0] / 12), y1 = Math.floor(keys[keys.length - 1] / 12);
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let mult = 1, any = false;
      const cells = Array.from({ length: 12 }, (_, m) => {
        const r = ret.has(y * 12 + m) ? ret.get(y * 12 + m) : null;
        if (r != null) { mult *= 1 + r; any = true; }
        return r;
      });
      rows.push({ label: String(y), cells, year: any ? mult - 1 : null });
    }
    const all = [...ret.values()];
    const pctGreen = Math.round(all.filter(r => r >= 0).length / all.length * 100);
    return {
      id: "monthlyreturns",
      text:
`📅 ${pctGreen}% of SPX6900's ${all.length} months have closed green.
The heatmap turns every month of SPX6900's life into a return — green up, red down — with a compounded column per year. "Up only" is a meme; the real path is violent, with plenty of red. But the green months, especially the fat green tail of a few monsters, have done almost all the heavy lifting.
That's how power-law assets compound: a handful of explosive months, not steady gains. Full grid on the site.
NFA`,
      card: { type: "heatmap", spec: {
        title: "SPX6900 monthly returns", headline: `${pctGreen}% of months green`, accent: "#4ade80",
        rows, yearCol: true,
      } },
    };
  })(),

  // 24b — monthly returns as a diverging column chart (a different cut of the
  // seasonality heatmap): one bar per month from a floating 0% axis, green up for
  // gains / red down for losses. Same month-over-month definition as the site.
  s => (() => {
    const byMonth = new Map();
    for (const [ts, p] of s.series.price) {
      const d = new Date(ts);
      if (p > 0) byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), p); // last close wins
    }
    const keys = [...byMonth.keys()].sort((a, b) => a - b);
    const bars = [];
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      bars.push({ ts: Date.UTC(Math.floor(k / 12), k % 12, 1), value: byMonth.get(k) / byMonth.get(keys[i - 1]) - 1, year: Math.floor(k / 12) });
    }
    if (bars.length < 8) return null;
    const greens = bars.filter(b => b.value >= 0).length;
    const pctGreen = Math.round(greens / bars.length * 100);
    const best = Math.max(...bars.map(b => b.value)), worst = Math.min(...bars.map(b => b.value));
    return {
      id: "monthlybars",
      text:
`📊 SPX6900 month by month: ${greens} of ${bars.length} months closed green (${pctGreen}%).
Each bar is one month's return from a 0% line — green up, red down. The axis floats low because the green months tower: best ${fPct(best)}, worst ${fPct(worst)}. That lopsided shape IS the up-only skew — the up months have been multiples bigger than the down ones.
Volatile, not a smooth climb, but the asymmetry has run in holders' favour so far.
NFA`,
      card: { type: "mbars", spec: {
        title: "SPX6900 monthly returns", headline: `${pctGreen}% of months green`, accent: "#4ade80",
        bars,
      } },
    };
  })(),

  // 25 — risk dial: the rainbow valuation as a needle on a colored dial. Reads
  // risk straight off the band model; the arc IS the rainbow, band by band.
  s => (() => {
    const v = s.risk, pct = Math.round(v * 100);
    const verdict = v < 0.2 ? "Deep value" : v < 0.4 ? "Cheap" : v < 0.6 ? "Fair value" : v < 0.8 ? "Heating up" : "Euphoric";
    const N = M.BAND_LABELS.length;
    return {
      id: "riskdial",
      text:
`🌡️ SPX6900 risk dial: ${s.band.l} zone — ${pct}/100 on the rainbow model.
Same idea as the valuation-risk read, as one needle: it sits straight on the rainbow bands, 0 = the cheapest vs trend SPX has ever been, 100 = the most stretched. Today reads ${pct} — it's only been this cheap or cheaper ${Math.round(s.cheaperFrac * 100)}% of its life.
Low has historically been the patient zone, high the euphoric one. A gauge of position, not a prediction.
NFA`,
      card: { type: "gauge", spec: {
        title: "SPX6900 risk dial", headline: `${s.band.l} · ${pct}/100`, accent: s.band.c,
        value: v,
        segments: M.BAND_LABELS.map((b, i) => ({ from: i / N, to: (i + 1) / N, color: b.c })),
        ticks: [{ at: 0, label: "Fire Sale", anchor: "start" }, { at: 1, label: "Max Bubble", anchor: "end" }],
        centerBig: verdict, centerSmall: `risk ${pct} / 100`,
      } },
    };
  })(),

  // 25 — "when does SPX flip the kings?" — the BTC-cycle projection climbing past
  // each memecoin king's ATH cap, each rung marked with the date it's reached. The
  // base case tops out ≈ DOGE's cap (~$91 vs $94.57), so DOGE reads as ≈ the top.
  s => (() => {
    const c = btcCycleProjection();
    const KINGS = [
      { label: "PEPE ATH MC", short: "PEPE", color: "#38bdf8" },
      { label: "SHIB ATH MC", short: "SHIB", color: "#f43f5e" },
      { label: "DOGE ATH MC", short: "DOGE", color: "#c2a633" },
    ].map(k => ({ ...CRYPTO_MILESTONES.find(m => m.label === k.label), ...k }));
    const firstCross = price => { for (const [ts, p] of c.projPts) if (p >= price) return ts; return null; };
    // Each king: the date the projection first reaches its cap, or ≈ the cycle top.
    const rungs = KINGS.map(k => {
      const cross = firstCross(k.price);
      return cross
        ? { ...k, ts: cross, y: k.price, when: fMon(cross), top: false }
        : { ...k, ts: c.peakTs, y: c.peak, when: `≈ top ${fMon(c.peakTs)}`, top: true };
    });
    const doge = rungs.find(r => r.short === "DOGE");
    return {
      id: "dogeclock",
      text:
`🐕 If SPX6900 tracks Bitcoin's 4-yr cycle, DOGE-size lands ≈ ${fMon(c.peakTs)}. When it would flip each memecoin king:
${rungs.map(r => `${r.short} (${r.mc}) → ${r.top ? `≈ the cycle top, ${fMon(c.peakTs)}` : `~${r.when}`}`).join(TIGHT)}
These dates aren't guesses — they're where SPX6900 crosses each king's all-time-high market cap as it rides Bitcoin's real last-cycle path (scaled to SPX). So they move with the halving clock, not a calendar I picked. DOGE-size lands right around the projected top.
A for-fun what-if, not a forecast.
NFA`,
      card: { type: "line", spec: {
        title: "When does SPX6900 flip the kings?", headline: `DOGE-size ≈ ${fMon(c.peakTs)}`, accent: doge.color,
        yLog: true, yTicks: decadeTicks(s.firstPrice, c.peakHi),
        series: [
          { pts: s.series.price, color: "#4ade80", width: 3, fill: 0.1 },
          { pts: c.projPts, color: "#f7931a", width: 3, dash: true },
        ],
        hlines: rungs.map(r => ({ y: r.price, label: `${r.short} · ${r.when}`, color: r.color })),
        markers: rungs.map(r => ({ x: r.ts, y: r.y, color: r.color })),
        legend: [{ label: "SPX actual", color: "#4ade80" }, { label: "BTC cycle (real)", color: "#f7931a" }],
        marker: { x: c.anchorTs, y: c.anchorPrice, color: "#4ade80" },
      } },
    };
  })(),

  // 26 — "SPX6900 at the majors' caps" — the winning target-ladder style (line +
  // dashed target lines) applied to the coins people actually hold. Each rung is
  // the SPX price at which its market cap would equal BTC/ETH/SOL's today.
  // Gated on live majors data (skips silently when CoinGecko is unreachable).
  s => s.majors && s.majors.length && (() => {
    const COLOR = { BTC: "#f7931a", ETH: "#818cf8", SOL: "#9945ff" };
    const rungs = s.majors
      .filter(m => m.spxAtCap > s.price)                       // only caps above us (upside)
      .map(m => ({ ...m, mult: m.spxAtCap / s.price, color: COLOR[m.name] || "#94a3b8" }))
      .sort((a, b) => a.spxAtCap - b.spxAtCap);
    if (rungs.length < 2) return null;
    const nearest = rungs[0], top = rungs.at(-1);
    return {
      id: "majorcaps",
      text:
`🧮 At ${nearest.name}'s market cap, SPX6900 = ${fMult(nearest.mult)} (${fPx(nearest.spxAtCap)}). At each major's cap:
${rungs.map(m => `${m.name}-size (${fMoney(m.mc)}) → ${fPx(m.spxAtCap)} · ${fMult(m.mult)}`).join(TIGHT)}
Each line is the SPX6900 price at which its market cap would equal that major's today — BTC, ETH, SOL. It turns "how high" into "which coins, at what cap," using the assets people already hold as yardsticks.
Pure market-cap math (their cap ÷ SPX's 939M supply), not a forecast or a timeline. A long way up.
NFA`,
      card: { type: "line", spec: {
        title: "SPX6900 at the majors' market caps", headline: `${nearest.name}-size = ${fMult(nearest.mult)}`, accent: nearest.color,
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.spxAtCap),
        hlines: rungs.map(m => ({ y: m.spxAtCap, label: `${m.name} · ${fMult(m.mult)}`, color: m.color })),
        series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
        marker: { x: lastTs(s), y: s.price, color: "#34d399" },
      } },
    };
  })(),

  // 27 — "$100/mo DCA since launch" — the viral dollar-cost-averaging chart.
  // Buys $100 at the first close of each month; the green band between the value
  // line and the flat "invested" staircase is the profit. Softens "I missed it".
  s => (() => {
    const M = 100; // monthly buy
    let tokens = 0, contributed = 0, lastM = null, peak = 0;
    const value = [], invested = [];
    for (const [ts, price] of s.series.price) {
      if (!(price > 0)) continue;
      const d = new Date(ts), mk = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (mk !== lastM) { tokens += M / price; contributed += M; lastM = mk; }
      const v = tokens * price;
      value.push([ts, v]); invested.push([ts, contributed]);
      if (v > peak) peak = v;
    }
    if (invested.length < 8 || contributed <= 0) return null;
    const cur = value.at(-1)[1], months = contributed / M, mult = cur / contributed;
    return {
      id: "dca",
      text:
`💵 $100/mo into SPX6900 since launch = ${fUsd0(contributed)} in → ${fUsd0(cur)} today.
The classic dollar-cost-average: buy $100 on the first of every month, no timing, straight through every crash. ${fUsd0(contributed)} in over ${months} months is now worth ${fUsd0(cur)} — a ${fMult(mult)}, and the stack even crossed ${fUsd0(peak)} at the 2025 top. The green band is profit; the flat line is what you put in.
It softens "I missed it" — you never needed the bottom, just consistency. Past results, not a promise.
NFA`,
      card: { type: "dca", spec: {
        title: "Stacking $100/mo since launch", headline: `${fUsd0(contributed)} → ${fUsd0(cur)}`, accent: "#34d399",
        invested, value,
      } },
    };
  })(),

  // 28 — SPX6900 vs the majors, year-to-date (rebased to 0% on Jan 1). An honest
  // side-by-side — shown even when SPX trails, because the comparison itself is
  // the value. Uses the live 1-yr major series (no bundled history needed).
  s => s.majors && s.majors.length && (() => {
    const YEAR = Date.UTC(new Date(Date.parse(s.date)).getUTCFullYear(), 0, 1);
    const rebase = pts => {
      const yr = pts.filter(([t]) => t >= YEAR);
      if (yr.length < 2) return null;
      const base = yr[0][1];
      return yr.map(([t, p]) => [t, (p / base - 1) * 100]);
    };
    const COLOR = { BTC: "#f7931a", ETH: "#818cf8", SOL: "#9945ff" };
    const spx = rebase(s.series.price);
    if (!spx) return null;
    const lines = s.majors.map(m => ({ name: m.name, color: COLOR[m.name] || "#94a3b8", pts: rebase(m.series) })).filter(m => m.pts);
    if (!lines.length) return null;
    const spxYtd = spx.at(-1)[1] / 100; // back to fraction for fPct
    const ranked = [{ name: "SPX6900", ret: spxYtd }, ...lines.map(m => ({ name: m.name, ret: m.pts.at(-1)[1] / 100 }))].sort((a, b) => b.ret - a.ret);
    const allY = [...spx, ...lines.flatMap(m => m.pts)].map(p => p[1]);
    const lo = Math.min(0, ...allY), hi = Math.max(0, ...allY), step = 20;
    const yTicks = [];
    for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + 1e-6; v += step) yTicks.push({ v, label: (v > 0 ? "+" : "") + v + "%" });
    const winning = ranked[0].name === "SPX6900";
    const closer = winning
      ? "SPX6900 out in front — the meme keeps outrunning the majors."
      : spxYtd >= 0
        ? "Green on the year, just not the leader yet. The rainbow says the patient zone pays."
        : "A rough start, no spin — but every prior dip on the rainbow has been a refuel stop.";
    return {
      id: "ytd",
      text:
`📊 SPX6900 is ${fPct(spxYtd)} YTD — vs the majors, no spin:
${ranked.map(r => `${r.name}: ${fPct(r.ret)}`).join(TIGHT)}
Everything's rebased to 0% on Jan 1, so it's a clean same-start race for the year against BTC, ETH and SOL — shown whether SPX is winning or losing, because the honest comparison is the point, not a cherry-picked window.
${closer}
NFA`,
      card: { type: "line", spec: {
        title: "SPX6900 vs majors — year to date", headline: `SPX6900 ${fPct(spxYtd)} YTD`, accent: spxYtd >= 0 ? "#4ade80" : "#f87171",
        yMin: Math.floor(lo / step) * step, yMax: Math.ceil(hi / step) * step, yTicks,
        hlines: [{ y: 0, label: "0%", color: "#475569" }],
        series: [
          ...lines.map(m => ({ pts: m.pts, color: m.color, width: 2.5 })),
          { pts: spx, color: "#4ade80", width: 4 },
        ],
        legend: [{ label: "SPX6900", color: "#4ade80" }, ...lines.map(m => ({ label: m.name, color: m.color }))],
        marker: { x: spx.at(-1)[0], y: spx.at(-1)[1], color: "#4ade80" },
      } },
    };
  })(),

  // 30–32 — SPX6900 at the same age as Bitcoin / Ethereum / Solana (see ageCard).
  ...AGE_PEERS.map(ageCard),

  // 29 — Kraken affiliate promo. A finished marketing graphic (public/rainbow-
  // kraken.png) posted as-is + a referral CTA. Kept OUT of the organic rotation
  // (NO_ROTATE) and surfaced on a fixed ~monthly cadence by buildPost instead, so
  // it shows up predictably without crowding the charts.
  () => ({
    id: "kraken",
    text:
`🌈 SPX6900 × 🐙 Kraken — the affiliate program is live.
Trade $SPX on one of crypto's deepest, longest-running exchanges, and back the rainbow while you do.
Sign up with our link (referral code ${KRAKEN_CODE}) 👇
${KRAKEN_REF}
NFA`,
    card: { type: "kraken" },
  }),
];

export function allIds(stats) { return POSTS.map(p => p(stats)?.id).filter(Boolean); }

// Upside-forward posts get extra weight in the daily rotation so the feed skews
// bullish (they show up ~twice as often as the analytical/neutral ones).
const BULLISH = new Set([
  "milestones", "memecoins", "btcgrade", "cycle", "cyclepeak", "cycleclock",
  "targets", "rally", "alltime", "hundred", "dogeclock", "majorcaps", "dca",
]);
// Per-post rotation weight (copies per cycle). The flagship rainbow is weighted
// up so the site's main chart surfaces ~weekly (≈3×/month); bullish posts 2×.
const WEIGHT = { valuation: 3 };
const weightOf = id => WEIGHT[id] ?? (BULLISH.has(id) ? 2 : 1);

// Posts that stay BUILDABLE (so the website tabs / OG share images still render
// them on demand) but never enter the daily auto-rotation. The drawdown chart is
// here because "down X% from the high" is too much of a downer to tweet daily —
// the monthly-returns card covers the same honesty without the gloom.
const NO_ROTATE = new Set(["drawdown", "kraken"]);

// Cards kept buildable ONLY to back website OG share images — never auto-posted
// AND hidden from the control console (so they can't be fired by hand). Drawdown
// lives here: the site's drawdown tab needs its share image, but the card itself
// shouldn't surface anywhere in the bot. (Kraken is NOT here — it's a real promo
// you fire from the console.)
export const OG_ONLY = new Set(["drawdown"]);

// Build the weighted rotation order in round-robin passes (pass k includes posts
// whose weight > k). So higher-weight topics recur more often across the cycle
// without ever landing on consecutive days.
function rotation(built) {
  const pool = built.filter(p => !NO_ROTATE.has(p.id));
  const maxW = Math.max(1, ...pool.map(p => weightOf(p.id)));
  const rota = [];
  for (let pass = 0; pass < maxW; pass++) for (const p of pool) if (weightOf(p.id) > pass) rota.push(p);
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
  const epochDay = Math.floor(now.getTime() / 86400000);
  // An explicit override (env BOT_POST / --post= / the OG endpoint) wins. Else a
  // fixed-cadence promo (Kraken) claims its day; otherwise the organic rotation.
  const promo = built.find(p => p.id === "kraken");
  const rota = rotation(built);
  const chosen = (overrideId && built.find(p => p.id === overrideId))
    || (promo && epochDay % KRAKEN_EVERY === 0 && promo)
    || rota[epochDay % rota.length];
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

// Event post for crossing a market-cap GIANT (fired by milestone-watch.mjs when
// SPX6900's cap first passes a CRYPTO_MILESTONES landmark — flipping PEPE, SHIB,
// DOGE, a BTC market-cap level, …). `crossedIdx` indexes CRYPTO_MILESTONES.
export function buildMilestonePost(s, crossedIdx) {
  const m = CRYPTO_MILESTONES[crossedIdx];
  const next = CRYPTO_MILESTONES[crossedIdx + 1];
  const nextLine = next
    ? `Next rung: ${next.short} (${next.mc}) → ${fMult(next.price / s.price)}.`
    : `That was the top rung on the board — uncharted from here. 🚀`;
  const top = next || m;
  const text =
`🏆 Milestone: SPX6900 just passed ${m.label} (${m.mc}).
At ${fPrice(s.price)}, its market cap is now bigger than that landmark ever printed. ${nextLine}
NFA`;
  return { id: "milestonecross", text: withFooter(text), card: { type: "line", spec: {
    title: `Milestone flipped: ${m.short}`, headline: `SPX6900 > ${m.label}`, accent: m.c,
    yLog: true, yTicks: decadeTicks(s.firstPrice, top.price * 1.1),
    hlines: [
      { y: m.price, label: `${m.short} · FLIPPED`, color: m.c },
      ...(next ? [{ y: next.price, label: `${next.short} · ${fMult(next.price / s.price)}`, color: next.c }] : []),
    ],
    series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
    marker: { x: lastTs(s), y: s.price, color: "#34d399" },
  } } };
}
