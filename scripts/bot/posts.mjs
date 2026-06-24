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
// Ben Cowen's X handle, tagged on the dca-ladder card (env-overridable in case
// it changes). The card image keeps the readable name; the tweet does the @-tag.
const COWEN = process.env.BOT_COWEN || "@benjamincowen";
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

// Centered moving average over a [ts, value] series (window = w points), to
// de-noise a jumpy daily series on a card (e.g. the Fear & Greed line, which
// reads daily and whips around). Window shrinks at the edges so the endpoints
// stay anchored to the real latest value.
const smoothMA = (pts, w = 9) => {
  const half = Math.floor(w / 2);
  return pts.map(([ts], i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(pts.length - 1, i + half); j++) { sum += pts[j][1]; n++; }
    return [ts, sum / n];
  });
};

// Month-over-month returns → seasonality heatmap rows from a [ts, price] series.
// Shared by the USD and BTC monthly-returns cards (same definition as the site's
// Monthly grid). Returns { rows, pctGreen, months } or null if too short.
function monthlyHeatmap(priceSeries) {
  const byMonth = new Map();
  for (const [ts, p] of priceSeries) {
    if (!(p > 0)) continue;
    const d = new Date(ts);
    byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), p); // last close of the month wins
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
  return { rows, pctGreen: Math.round(all.filter(r => r >= 0).length / all.length * 100), months: all.length };
}

// SPX6900 priced in BTC over its whole life: align the bundled BTC_HISTORY
// ([ageDays, usd], from 2010) to each SPX timestamp (largest BTC date ≤ it) and
// divide. Lets the BTC monthly card build from bundled data alone. Skips SPX
// points more than a week past the BTC data so a stale tail can't distort the
// latest month. Returns [ts, spx/btc].
const BTC_LAUNCH = Date.parse("2010-07-17T00:00:00Z");
function spxInBtcSeries(priceSeries) {
  const btc = BTC_HISTORY.map(([age, usd]) => [BTC_LAUNCH + age * 86400000, usd]); // ascending by ts
  const lastBtcTs = btc.at(-1)[0];
  const btcAt = ts => {
    let lo = 0, hi = btc.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (btc[mid][0] <= ts) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans >= 0 ? btc[ans][1] : null;
  };
  const out = [];
  for (const [ts, usd] of priceSeries) {
    if (!(usd > 0) || ts > lastBtcTs + 7 * 86400000) continue;
    const b = btcAt(ts);
    if (b > 0) out.push([ts, usd / b]);
  }
  return out;
}

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
    story: "Bitcoin is the blueprint. Its power-law trend, 4-year cycle and rainbow chart underpin this whole project." },
  { id: "ethage", name: "Ethereum", color: "#8b9bff", series: ETH_HISTORY, launch: "2015-08-07", emoji: "Ξ",
    story: "Ethereum nearly died in the cradle (the 2016 DAO hack), then ran from under a dollar to four figures." },
  { id: "solage", name: "Solana", color: "#9945ff", series: SOL_HISTORY, launch: "2020-04-11", emoji: "◎",
    story: "Solana tore from under a dollar to ~$260, then the FTX collapse cut it ~96% and many called it dead. It came back." },
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
At this age: SPX6900 ${fMult(spxMult)} vs ${peer.name} ${fMult(peerMult)}. ${ahead ? "SPX is out front" : `${peer.name} ahead, for now`}. A resemblance, not a forecast.`,
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
`📊 SPX6900 is trading ${Math.abs(Math.round(s.vsCenter * 100))}% ${s.vsCenter < 0 ? "below" : "above"} its long-run trend. ${BAND_EMOJI[s.bandIndex]} ${s.band.l} band.
The rainbow fits a power-law trend to SPX6900's history. Fair value for its age is ${fPrice(s.center)}; blue means cheap, red means stretched.
Not a prediction. Just where today sits in the long arc.`,
    card: { type: "rainbow" },
  }),

  // 2 — risk gauge (line, 0..1). De-rotated + console-hidden (OG_ONLY): the
  // fngtrend card now plots this exact valuation-risk line alongside crypto Fear
  // & Greed, so the standalone is redundant in the feed. Kept buildable only to
  // back the website's Risk tab share image (api/og.js ?tab=risk).
  s => ({
    id: "risk",
    text:
`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00. Today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
Position, not price: where SPX sits inside its own rainbow on a 0–1 scale. 0 is the cheapest vs trend ever, 1 the most stretched.
Low has been the patient zone, high the euphoria.`,
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
Drawdowns map the pain from each peak. The worst on record was ${fPct(s.maxDrawdown)}.
Every cycle looked like the end. None were.`,
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
`🚀 SPX6900 is ${fPct(s.lastFireSale.sinceGain)} since the last Fire Sale low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}).${ranHigher ? ` Ran as high as ${fPct(s.lastFireSale.peakGain)}.` : ""}
A Fire Sale is the rainbow's deepest band. Every major SPX run so far has launched from there.
Cheap can get cheaper, but the deepest discounts paid the patient.`,
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
`🧪 ~${fMult(s.edge)} vs HODL: buying every cycle dip and selling the peak, with perfect hindsight.
Accumulate deep blue, trim deep red, cash otherwise. With flawless timing that beats holding by ~${fMult(s.edge)}.
Nobody nails it live. The lesson is the size of the swings.`,
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
Round-number rungs on a log trend, each the multiple from here. Not a timeline, just scale: a few doublings to the obvious levels.`,
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
Each bar is the share of history in a rainbow band. Extremes are rare by design; most of any life is spent in the middle.
Rare cuts both ways: cheap is uncommon, but so is euphoria.`,
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
`💰 SPX6900's real free-float cap is just ${fMoney(s.supply.floatMc)}, vs the ${fMoney(s.supply.nominalMc)} headline.
The sticker cap assumes every coin can trade. But ~${Math.round(s.supply.diamondShare * 100)}% sits in diamond hands that rarely sell, so the tradable supply is far smaller.
Thin float, high conviction: moves amplify both ways.`,
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
Dollars hide how an asset does against the benchmark crypto really competes with. In sats, SPX is ${fPct(s.btc.rel90)} vs BTC over 90 days and ${fPct(s.btc.rel365)} over a year.
Up in dollars is easy in a bull market. Up in BTC is the truer scoreboard.`,
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
`💎 ~${diamondPct}% of SPX6900's classified holder supply sits in diamond hands (longest-held, never sold).
HolderScan tiers wallets by how long they've held, excluding exchanges and LPs. Of that classified supply, diamond hands dominate.
High conviction, thin float.`,
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
At ${fPrice(s.price)} that's about ${fPct(s.supply.avgHolderPnl)}, so the average holder is ${up ? "in profit" : "underwater"}. This cost basis is the on-chain price the supply last moved at.
${up ? "Most of the float is green and still holding." : "The crowd's red and still hasn't sold. That's looked like accumulation."}`,
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
`⚔️ SPX6900 is ${fPct(sorted[0].rel365)} vs ${sorted[0].name} over the past year, outpacing ${wins}:
${sorted.map(m => `${m.name}: ${fPct(m.rel365)}`).join(" · ")}
Relative strength, not dollars: positive means SPX beat it. One year flips fast, so a snapshot, not a trend.`,
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
The whole journey on one log axis: higher highs through brutal drawdowns, the signature of a young power-law asset. The same curve Bitcoin drew.
Up only is a meme, but the direction has been one way.`,
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
`🔮 If SPX6900 traces Bitcoin's last cycle, today ≈ BTC ${fMon(c.btcFrom)}, just off the bottom.
The orange line is Bitcoin's real 4-year cycle, anchored where SPX trades now and scaled to its swings.
Crypto's rhymed to this halving rhythm for a decade. A what-if, not a forecast.`,
      // animate: history is fully drawn on frame 0 (revealFromX = now), then the
      // orange projection unfurls into the future — never a blank opening frame.
      card: { type: "line", animate: { revealFromX: lastTs(s) }, spec: {
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
Bitcoin set the shape and timing; the multiplier is how hard SPX swings vs BTC. A pattern, not a promise.`,
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
`⏳ If SPX6900 rides Bitcoin's last cycle, a projected top near ${fPx(c.peak)} by ${fMon(c.peakTs)}, after a dip near ${fPrice(c.low)} (${fMon(c.lowTs)}).
Bitcoin's real path on the halving clock. Read it as where we'd be on that clock, not a date.
If SPX keeps rhyming, nearer the launchpad than the top.`,
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
Each cube is one of today's caps; the pile is how many to match each king's ATH cap. Long way up. 🚀`,
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
Each × is the move to match that king's ATH. Same fair-launch playbook, just earlier. Coming for the throne. 👑`,
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
Each rung is the SPX price whose cap equals BTC's at $1K, $10K, $100K. Bitcoin cleared them all.`,
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
`📐 How the SPX6900 rainbow is built: a power-law trend fit to price, R² ${m.r2.toFixed(2)}.
Fit a log-log trend line (fair value), then sort each day's distance into bands: deep blue cheapest ever vs trend, deep red most stretched.
Its own history sorted, not vibes. Today ${BAND_EMOJI[s.bandIndex]} ${s.band.l}.`,
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
SPX is ≈ ${fMoney(cap)} vs the index's ~$50T, the gap baked into the joke. A memecoin flippening its namesake would be a ~${fNum(mult)}× move.
A telescope, not a target. Every giant was once a rounding error.`,
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
The all-time curve rebased to a single $100 buy. The earliest holders sit on absurd multiples because they were early, not because they timed it.
Not repeatable. The lesson is being early.`,
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
    const mh = monthlyHeatmap(s.series.price);
    if (!mh) return null;
    return {
      id: "monthlyreturns",
      text:
`📅 ${mh.pctGreen}% of SPX6900's ${mh.months} months have closed green.
Every month as a return, green up, red down. A handful of monster green months have done almost all the lifting.
That's how power-law assets compound: a few explosive months, not steady gains.`,
      card: { type: "heatmap", spec: {
        title: "SPX6900 monthly returns", headline: `${mh.pctGreen}% of months green`, accent: "#4ade80",
        rows: mh.rows, yearCol: true,
      } },
    };
  })(),

  // 23b — the same monthly heatmap, but priced in BTC: each month is SPX6900's
  // return measured against Bitcoin, not USD. Green = beat BTC that month. The
  // honest scoreboard for "are we actually outrunning crypto's benchmark?".
  s => (() => {
    const mh = monthlyHeatmap(spxInBtcSeries(s.series.price));
    if (!mh) return null;
    return {
      id: "monthlyreturnsbtc",
      text:
`₿ Priced in Bitcoin, ${mh.pctGreen}% of SPX6900's ${mh.months} months have beaten BTC.
Same heatmap, but each month is SPX6900's return measured in BTC, not USD. Green months beat Bitcoin, red months lost to it.
Up in dollars is easy in a bull market. Up in BTC is the real scoreboard.`,
      card: { type: "heatmap", spec: {
        title: "SPX6900 monthly returns vs BTC", headline: `${mh.pctGreen}% of months beat BTC`, accent: "#f7931a",
        rows: mh.rows, yearCol: true,
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
Each bar is one month's return from a 0% line. The axis floats low because the green months tower: best ${fPct(best)}, worst ${fPct(worst)}.
That lopsided shape is the up-only skew. Up months dwarf the down ones.`,
      card: { type: "mbars", spec: {
        title: "SPX6900 monthly returns", headline: `${pctGreen}% of months green`, accent: "#4ade80",
        bars,
      } },
    };
  })(),

  // 24c — crypto Fear & Greed vs SPX6900's own valuation dial (two dials). Gated
  // on the daily snapshot carrying an fng value (fetched in CI from alternative.me).
  s => s.fng != null && (() => {
    const fng = s.fng, fngV = fng / 100;
    const fngVerdict = fng < 25 ? "Extreme Fear" : fng < 45 ? "Fear" : fng < 55 ? "Neutral" : fng < 75 ? "Greed" : "Extreme Greed";
    const fngColor = fng < 25 ? "#ef4444" : fng < 45 ? "#f59e0b" : fng < 55 ? "#eab308" : fng < 75 ? "#84cc16" : "#22c55e";
    const FG_SEG = [["#ef4444", 0, .25], ["#f59e0b", .25, .45], ["#eab308", .45, .55], ["#84cc16", .55, .75], ["#22c55e", .75, 1]];
    const risk = s.risk, pct = Math.round(risk * 100), N = M.BAND_LABELS.length;
    const bothLow = fngV < 0.45 && risk < 0.45, bothHigh = fngV > 0.6 && risk > 0.6;
    const take = bothLow ? "Both at rock bottom: market fearful, SPX cheap on its own model. That alignment has rewarded patience."
      : bothHigh ? "Both hot: market euphoria meeting a stretched SPX. Manage risk, don't chase."
      : risk < fngV ? "They diverge: the crowd's mood sits above SPX's valuation. SPX looks cheaper than the market feels."
      : "They diverge: SPX is more stretched than the mood. The crowd's calmer than SPX's dial.";
    return {
      id: "fngdial",
      text:
`🌡️ Market mood vs SPX6900's own valuation dial.
Crypto Fear & Greed reads ${fng}/100 (${fngVerdict}); SPX's own rainbow risk reads ${pct}/100 (${s.band.l}).
${take}`,
      card: { type: "fngdial", spec: {
        title: "Market mood vs SPX6900's dial", headline: `${fngVerdict} · ${s.band.l}`, accent: "#22d3ee",
        left: { title: "Crypto Fear & Greed", value: fngV, big: String(fng), verdict: fngVerdict, color: fngColor, segments: FG_SEG.map(([c, a, b]) => ({ from: a, to: b, color: c })) },
        right: { title: "SPX6900 valuation", value: risk, big: String(pct), verdict: s.band.l, color: s.band.c, segments: M.BAND_LABELS.map((b, i) => ({ from: i / N, to: (i + 1) / N, color: b.c })) },
      } },
    };
  })(),

  // 24d — crypto Fear & Greed vs SPX6900's valuation risk, over SPX's whole life
  // (both 0..100). Shows where the crowd's mood and SPX's own valuation rhyme or
  // diverge. Gated on the bundled F&G history.
  s => s.series.fng && s.series.fng.length > 10 && (() => {
    const risk = s.series.risk.map(([ts, r]) => [ts, r * 100]);
    const fngNow = s.fng, riskNow = Math.round(s.risk * 100);
    return {
      id: "fngtrend",
      text:
`🌡️ Crypto Fear & Greed vs SPX6900's valuation risk, over its whole life. Both on a 0–100 scale.
One line is market mood (mostly BTC), the other SPX in its own rainbow. Below the crowd's line, SPX is cheaper than the mood.
Today: market ${fngNow} vs SPX ${riskNow}.`,
      card: { type: "line", spec: {
        title: "Market mood vs SPX6900 risk, over time", headline: `Market ${fngNow} · SPX ${riskNow}`, accent: "#22d3ee",
        yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100].map(v => ({ v, label: String(v) })),
        hlines: [{ y: 50, label: "neutral", color: "#475569" }],
        series: [
          // F&G reads daily and is jumpy; smooth it so the card shows the mood
          // trend, not the noise (the risk line is already ~weekly, so leave it).
          { pts: smoothMA(s.series.fng, 9), color: "#f59e0b", width: 2.5 },
          { pts: risk, color: "#22d3ee", width: 3, fill: 0.12 },
        ],
        legend: [{ label: "SPX6900 risk", color: "#22d3ee" }, { label: "Crypto Fear & Greed (smoothed)", color: "#f59e0b" }],
        marker: { x: risk.at(-1)[0], y: risk.at(-1)[1], color: "#22d3ee" },
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
`🐕 If SPX6900 tracks Bitcoin's 4-year cycle, DOGE-size lands ≈ ${fMon(c.peakTs)}. When it flips each king:
${rungs.map(r => `${r.short} (${r.mc}) → ${r.top ? `≈ top ${fMon(c.peakTs)}` : `~${r.when}`}`).join(TIGHT)}
Where SPX meets each king's ATH cap on Bitcoin's path. A what-if, not a forecast.`,
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
Each line is the SPX price whose cap equals that major's today. Pure cap math, a long way up.`,
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
    const value = [], invested = [], buys = [];
    for (const [ts, price] of s.series.price) {
      if (!(price > 0)) continue;
      const d = new Date(ts), mk = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const bought = mk !== lastM;
      if (bought) { tokens += M / price; contributed += M; lastM = mk; }
      const v = tokens * price;
      value.push([ts, v]); invested.push([ts, contributed]);
      if (bought) buys.push([ts, v]); // a sparkle on the value line for each buy
      if (v > peak) peak = v;
    }
    if (invested.length < 8 || contributed <= 0) return null;
    const cur = value.at(-1)[1], months = contributed / M, mult = cur / contributed;
    return {
      id: "dca",
      text:
`💵 $100/mo into SPX6900 since launch = ${fUsd0(contributed)} in → ${fUsd0(cur)} today.
Buy $100 on the 1st of every month, no timing, through every crash. ${fUsd0(contributed)} in over ${months} months is now worth ${fUsd0(cur)}, a ${fMult(mult)}.
You never needed the bottom, just consistency.`,
      card: { type: "dca", spec: {
        title: "Stacking $100/mo since launch", headline: `${fUsd0(contributed)} → ${fUsd0(cur)}`, accent: "#34d399",
        linear: true, invested, value, buys,
      } },
    };
  })(),

  // dynamic-DCA ladder: rainbow-weighted accumulation. Buy heavier the cheaper
  // SPX is (cool bands); the hot bands never say "sell", just "let it ride" — the
  // buy-only spin keeps it on-brand for a hold-forever community.
  s => (() => {
    const LADDER = [
      { mult: 5, action: "5x" }, { mult: 3, action: "3x" }, { mult: 2, action: "2x" },
      { mult: 1.5, action: "1.5x" }, { mult: 1, action: "1x" },
      { sell: 1, action: "trim" }, { sell: 2, action: "2y" }, { sell: 3, action: "3y" }, { sell: 5, action: "5y" },
    ];
    const bands = M.BAND_LABELS.map((b, i) => ({ label: b.l, color: b.c, mult: LADDER[i].mult, sell: LADDER[i].sell, action: LADDER[i].action }));
    return {
      id: "dcaladder",
      text:
`🌈 ${COWEN}'s BTC risk strategy, on SPX6900.
His risk-based DCA: buy more units of x the cheaper it gets, sell more units of y the hotter. x and y are your own base buy and sell sizes, not fixed amounts.
Ben Cowen's method, on our chart. A model, not advice.`,
      card: { type: "dcaladder", spec: {
        title: "Ben Cowen's risk DCA, applied to SPX", headline: `${s.band.l} → ${LADDER[s.bandIndex].action}`, accent: s.band.c,
        footer: "x = your base buy  ·  y = your base sell  ·  not financial advice",
        bands, current: s.bandIndex,
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
      ? "SPX6900 out front, the meme keeps outrunning the majors."
      : spxYtd >= 0
        ? "Green on the year, just not the leader yet."
        : "A rough start, no spin. Every prior dip here has been a refuel stop.";
    return {
      id: "ytd",
      text:
`📊 SPX6900 is ${fPct(spxYtd)} YTD vs the majors, no spin:
${ranked.map(r => `${r.name}: ${fPct(r.ret)}`).join(TIGHT)}
Everything rebased to 0% on Jan 1, a clean same-start race against BTC, ETH and SOL. ${closer}`,
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
`🌈 SPX6900 × 🐙 Kraken: the affiliate program is live.
Trade $SPX on one of crypto's deepest, longest-running exchanges, and back the rainbow while you do.
Sign up with our link (referral code ${KRAKEN_CODE}) 👇${TIGHT}${KRAKEN_REF}`,
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
// the monthly-returns card covers the same honesty without the gloom. The risk
// line is here because the fngtrend card now plots it next to crypto Fear &
// Greed, so the standalone is redundant in the feed.
const NO_ROTATE = new Set(["drawdown", "risk", "kraken", "dcaladder"]);

// Cards kept buildable ONLY to back website OG share images — never auto-posted
// AND hidden from the control console (so they can't be fired by hand). Drawdown
// and risk live here: the site's drawdown/risk tabs need their share images, but
// the cards themselves shouldn't surface anywhere in the bot. (Kraken is NOT here
// — it's a real promo you fire from the console.)
export const OG_ONLY = new Set(["drawdown", "risk"]);

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
