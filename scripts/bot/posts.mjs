// Rotating "daily pill" posts. Each entry turns the live stats into an
// informative blurb + a chart card (line/bar/rainbow). The bot rotates through
// them by day so followers get a different, visual angle each day.
import { readFileSync } from "node:fs";
import * as M from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";
import { CRYPTO_MILESTONES } from "../../src/milestones.js";
import { btcCycleProjection } from "../../src/btc-cycle.js";
import { BTC_HISTORY } from "../../src/btc-history.js";
import { ETH_HISTORY, SOL_HISTORY } from "../../src/alt-age-history.js";
import { SP500_HISTORY } from "../../src/sp500-history.js";
import { rsiNow } from "./rsi-card.mjs";
import { fNum } from "./svg-util.mjs";
import { currentChainHolders } from "./stats.mjs";
import { tally as valuationTally } from "./valuation-lenses.mjs";

// --- owner-editable post copy ---------------------------------------------
// EVERY card's tweet text is owner-editable from the control panel. Cards wrap
// their text with the ct`…` tagged template (or copy(id, tpl, {named}) for a few
// with friendly names); the live interpolated values become {token} placeholders,
// so the owner can reword the copy (saved permanently to public/post-copy.json)
// WITHOUT freezing the live numbers. Empty/unknown edits fall back to the default.
const COPY_FILE = new URL("../../public/post-copy.json", import.meta.url);
let _overrides;
const loadOverrides = () => {
  if (_overrides) return _overrides;
  try { _overrides = JSON.parse(readFileSync(COPY_FILE, "utf8")) || {}; } catch { _overrides = {}; }
  return _overrides;
};
const fillTokens = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
// Records an editable card's DEFAULT template + live vars (for the editor) and
// returns the EFFECTIVE text (owner override or default) with tokens filled.
export const COPY_REGISTRY = {};
function applyCopy(id, template, vars) {
  COPY_REGISTRY[id] = { template, vars };
  const ov = loadOverrides()[id];
  return fillTokens(typeof ov === "string" && ov.trim() ? ov : template, vars);
}
// Named-token form: a few cards opt in with explicit {name} tokens (nicer to edit).
export function copy(id, template, vars) { return applyCopy(id, template, vars); }
// Tagged-template form: wrap ANY card's text — each interpolation becomes an
// auto-numbered {0},{1},… token holding its live value. Returns a marker; the id
// is bound later (buildPost), since the literal site doesn't know its own id.
export function ct(strings, ...values) {
  let template = ""; const vars = {};
  strings.forEach((s, i) => { template += s; if (i < values.length) { template += `{${i}}`; vars[i] = values[i]; } });
  return { __tpl: template, __vars: vars };
}
const isCopyMarker = t => t && typeof t === "object" && typeof t.__tpl === "string";
export function bindCopy(id, marker) { return applyCopy(id, marker.__tpl, marker.__vars); }
// Register a ct() marker without rendering (so the editor lists every card even
// when it isn't the one being posted).
export function registerCopy(id, marker) { if (isCopyMarker(marker)) COPY_REGISTRY[id] = { template: marker.__tpl, vars: marker.__vars }; }
export { isCopyMarker };
// What the editor needs: { id: { default, tokens: {name: value} } } for every
// editable card seen in the current build.
export function editableCopy() {
  const out = {};
  for (const [id, { template, vars }] of Object.entries(COPY_REGISTRY)) out[id] = { default: template, tokens: vars };
  return out;
}

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

// Tweet-text price convention. recap-thread.mjs + the card modules keep their
// own (tiered decimals for card axes) — per-surface on purpose; don't unify blindly.
const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));
const fPct = x => (x >= 0 ? "+" : "") + Math.round(x * 100).toLocaleString() + "%";
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMoney = n =>
  n >= 1e12 ? "$" + (n / 1e12).toFixed(n >= 1e13 ? 0 : 1) + "T"
  : n >= 1e9 ? "$" + (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + "B"
  : n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M"
  : "$" + (n / 1e3).toFixed(0) + "K";
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

// S&P 500 close at or before a timestamp (nearest prior trading day), from the
// bundled SP500_HISTORY. Used by the "SPX6900 vs the real S&P 500" race card.
const SP500 = SP500_HISTORY.map(([d, c]) => [Date.parse(d + "T00:00:00Z"), c]); // ascending
const spCloseAt = ts => {
  let lo = 0, hi = SP500.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (SP500[m][0] <= ts) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? SP500[ans][1] : null;
};
// Bundled SP500_HISTORY only refreshes on a re-bundle, so its last date lags. Extend it
// with the daily closes the snapshot banks (stats.spSeries) so every S&P LINE reaches today.
function spMerged(s) {
  const byTs = new Map(SP500);
  for (const [d, c] of (s?.spSeries || [])) if (c > 0) byTs.set(Date.parse(d + "T00:00:00Z"), c);
  const arr = [...byTs].sort((a, b) => a[0] - b[0]);
  const closeAt = ts => {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][0] <= ts) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? arr[ans][1] : null;
  };
  return { arr, closeAt };
}

// SPX6900 priced in S&P 500 units over its life: divide each SPX close by the
// nearest-prior S&P close. Feeds the SPX-vs-S&P monthly heatmap. Returns of the
// ratio == SPX's return relative to the index. [ts, spx/sp].
function spxInSpSeries(priceSeries, s) {
  const sp = spMerged(s);
  const lastSpTs = sp.arr.at(-1)[0];
  const out = [];
  for (const [ts, usd] of priceSeries) {
    if (!(usd > 0) || ts > lastSpTs + 7 * 86400000) continue;
    const c = sp.closeAt(ts);
    if (c > 0) out.push([ts, usd / c]);
  }
  return out;
}

// SPX6900 vs the S&P 500 over a window starting at startTs, both rebased to 0% at
// the start (linear % lines, a fresh look vs the log charts). Uses the bundled
// S&P path plus s.sp as the live current endpoint so it stays fresh. Returns
// { spxPts, spPts, spxRet, spRet } or null.
function spVsWindow(s, startTs) {
  const sp = spMerged(s); // bundled + daily snapshot closes → reaches today
  const spStart = sp.closeAt(startTs);
  if (!spStart) return null;
  const nowTs = s.series.price.at(-1)[0];
  const spPts = sp.arr.filter(([ts]) => ts >= startTs && ts <= nowTs).map(([ts, c]) => [ts, (c / spStart - 1) * 100]);
  const spxIn = s.series.price.filter(([ts, p]) => ts >= startTs && p > 0);
  if (spxIn.length < 2 || spPts.length < 2) return null;
  const spxStart = spxIn[0][1];
  const spxPts = spxIn.map(([ts, p]) => [ts, (p / spxStart - 1) * 100]);
  return { spxPts, spPts, spxRet: spxPts.at(-1)[1] / 100, spRet: spPts.at(-1)[1] / 100 };
}

// Linear %-return line spec shared by the YTD and trailing-12mo SPX-vs-S&P cards.
// `tag` ("YTD" / "12mo") rides in the [logo] vs [logo] = result header.
function spVsSpec(title, r, tag) {
  const { spxPts, spPts, spxRet } = r;
  const allY = [...spxPts, ...spPts].map(p => p[1]);
  const lo = Math.min(0, ...allY), hi = Math.max(0, ...allY), step = 20;
  const yTicks = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + 1e-6; v += step) yTicks.push({ v, label: (v > 0 ? "+" : "") + v + "%" });
  const accent = spxRet >= 0 ? "#4ade80" : "#f87171";
  return { type: "line", spec: {
    title, headline: `SPX6900 ${fPct(spxRet)} · S&P ${fPct(r.spRet)}`, accent,
    logoHeader: { left: "spx", right: "sp500", result: `${fPct(spxRet)}${tag ? " " + tag : ""}` },
    yMin: Math.floor(lo / step) * step, yMax: Math.ceil(hi / step) * step, yTicks,
    hlines: [{ y: 0, label: "0%", color: "#475569" }],
    fillBase: 0, // shade the SPX line's out/under-performance vs the 0% start
    // SPX gold coin + red 500 coin sit at each line's endpoint (logos = the legend).
    series: [{ pts: spPts, color: "#94a3b8", width: 3.8, logo: "sp500" }, { pts: spxPts, color: accent, width: 4.5, logo: "spx", fill: 0.16, glow: true }],
  } };
}

// Shared builder for the majors race cards (YTD + trailing-12mo): rebase SPX and
// each major to 0% at startTs, rank the field, and assemble the multi-line spec
// with a coin logo riding each line's right endpoint. Returns null without data.
const MAJ_COLOR = { BTC: "#f7931a", ETH: "#818cf8", SOL: "#9945ff" };
const MAJ_LOGO = { BTC: "btc", ETH: "eth", SOL: "sol" };
function majorsRace(s, startTs) {
  const rebase = pts => {
    const win = pts.filter(([t]) => t >= startTs);
    if (win.length < 2) return null;
    const base = win[0][1];
    return win.map(([t, p]) => [t, (p / base - 1) * 100]);
  };
  const spx = rebase(s.series.price);
  if (!spx) return null;
  const lines = s.majors.map(m => ({ name: m.name, color: MAJ_COLOR[m.name] || "#94a3b8", logo: MAJ_LOGO[m.name], pts: rebase(m.series) })).filter(m => m.pts);
  if (!lines.length) return null;
  const spxRet = spx.at(-1)[1] / 100;
  const ranked = [{ name: "SPX6900", ret: spxRet }, ...lines.map(m => ({ name: m.name, ret: m.pts.at(-1)[1] / 100 }))].sort((a, b) => b.ret - a.ret);
  const allY = [...spx, ...lines.flatMap(m => m.pts)].map(p => p[1]);
  const lo = Math.min(0, ...allY), hi = Math.max(0, ...allY), step = 20;
  const yTicks = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + 1e-6; v += step) yTicks.push({ v, label: (v > 0 ? "+" : "") + v + "%" });
  const order = ranked.map(r => r.name);
  const spxRank = order.indexOf("SPX6900");
  const ahead = ranked.slice(0, spxRank).map(r => r.name);   // majors beating SPX
  const behind = ranked.slice(spxRank + 1).map(r => r.name); // majors SPX is beating
  const standings = ranked.map(r => `${r.name}: ${fPct(r.ret)}`).join(TIGHT);
  return {
    spxRet, ranked, spxRank, ahead, behind, standings,
    spec: {
      accent: spxRet >= 0 ? "#4ade80" : "#f87171",
      yMin: Math.floor(lo / step) * step, yMax: Math.ceil(hi / step) * step, yTicks,
      hlines: [{ y: 0, label: "0%", color: "#475569" }],
      series: [
        ...lines.map(m => ({ pts: m.pts, color: m.color, width: 2.5, logo: m.logo })),
        { pts: spx, color: "#4ade80", width: 4, logo: "spx" },
      ],
    },
  };
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
  { id: "btcage", name: "Bitcoin", color: "#f7931a", series: BTC_HISTORY, launch: "2010-07-17", emoji: "₿", kind: "btc",
    story: "Bitcoin is the blueprint. Its power-law trend, 4-year cycle and rainbow chart underpin this whole project." },
  { id: "ethage", name: "Ethereum", color: "#8b9bff", series: ETH_HISTORY, launch: "2015-08-07", emoji: "Ξ", kind: "eth",
    story: "Ethereum nearly died in the cradle (the 2016 DAO hack), then ran from under a dollar to four figures." },
  { id: "solage", name: "Solana", color: "#9945ff", series: SOL_HISTORY, launch: "2020-04-11", emoji: "◎", kind: "sol",
    story: "Solana tore from under a dollar to ~$260, then the FTX collapse cut it ~96% and many called it dead. It came back." },
];
const ageCard = peer => s => (() => {
  const DAY = 86400000;
  const px = s.series.price;
  const t0 = px[0][0], p0 = px[0][1];
  if (!(p0 > 0)) return null;
  const ageNow = (px.at(-1)[0] - t0) / DAY;
  const spx = px.filter(([, p]) => p > 0).map(([ts, p]) => [(ts - t0) / DAY, p / p0]);
  // Prefer the DAILY peer series (stats.altHistory) over the thinned bundled one.
  const series = s.altHistory?.[peer.kind]?.series?.length >= 100 ? s.altHistory[peer.kind].series : peer.series;
  const base = series[0][1];
  const peerPts = series.filter(([a]) => a <= ageNow + 25).map(([a, p]) => [a, p / base]);
  if (peerPts.length < 8 || spx.length < 10) return null;
  const spxMult = spx.at(-1)[1], peerMult = peerPts.at(-1)[1], ahead = spxMult >= peerMult;
  const xTicks = [];
  for (let y = 1; y * 365 <= ageNow + 25; y++) xTicks.push({ x: y * 365, label: `Yr ${y}` });
  const allY = [...spx, ...peerPts].map(p => p[1]);
  const yMax = Math.max(...allY), yMin = Math.min(...allY, 1);
  const yTicks = [1, 10, 100, 1000, 10000].filter(v => v >= yMin * 0.6 && v <= yMax * 1.6).map(v => ({ v, label: fMult(v) }));
  return {
    id: peer.id,
    text: ct`${peer.emoji} SPX6900 vs ${peer.name}, at the same age since launch.
${peer.story}
At this age: SPX6900 ${fMult(spxMult)} vs ${peer.name} ${fMult(peerMult)}. ${ahead ? "SPX is out front" : `${peer.name} ahead, for now`}. A resemblance, not a forecast.`,
    card: { type: "line", spec: {
      title: `SPX6900 vs ${peer.name}, at the same age`, headline: `Same age as early ${peer.name}`, accent: peer.color,
      logoHeader: { left: "spx", right: peer.kind, result: "same age" },
      yLog: true, yMin: yMin * 0.7, yMax: yMax * 1.4, yTicks, xTicks,
      // logos ride each line's endpoint (SPX vs the peer at the same age = the legend).
      series: [
        { pts: peerPts, color: peer.color, width: 3, dash: true, logo: peer.kind },
        { pts: spx, color: "#4ade80", width: 3.4, fill: 0.12, logo: "spx" },
      ],
    } },
  };
})();

// Linear interpolation of a peer's [ageDays, price] series at an arbitrary age.
const interpAt = (series, age) => {
  if (age <= series[0][0]) return series[0][1];
  if (age >= series.at(-1)[0]) return series.at(-1)[1];
  for (let i = 1; i < series.length; i++) {
    if (series[i][0] >= age) {
      const [a0, p0] = series[i - 1], [a1, p1] = series[i];
      return p0 + ((age - a0) / ((a1 - a0) || 1)) * (p1 - p0);
    }
  }
  return series.at(-1)[1];
};

// "What came next" — FORWARD-ONLY composite. Each legend's recovery forward from its
// own FIRST BEAR-CYCLE BOTTOM (cycle-phase alignment, NOT age), rebased to 1× there,
// forward ~3 years — the RECOVERY from the first bear. SPX sits at that same point NOW
// (near its own first bottom), so it overlays at the origin: cycle-phase sync, not age.
// The first cycle bottom is detected robustly: the first all-time-high that HOLDS ≥365d
// (a genuine cycle top, not launch noise) and drops ≥55%, then the trough before recovery.
const FUTURE_DAYS = 1460; // ~4 years forward — long enough to reach the next cycle TOP
function firstCycleBottom(series) {
  for (let i = 0; i < series.length; i++) {
    let isATH = true;
    for (let k = 0; k < i; k++) if (series[k][1] >= series[i][1]) { isATH = false; break; }
    if (!isATH) continue;
    const P = series[i][1], A = series[i][0];
    let j = series.length;
    for (let k = i + 1; k < series.length; k++) if (series[k][1] >= P) { j = k; break; }
    const held = (j < series.length ? series[j][0] : series.at(-1)[0]) - A;
    if (held < 365) continue;                              // recovered too fast = launch noise, not a cycle top
    let botIdx = i, botP = P;
    for (let k = i + 1; k < j; k++) if (series[k][1] < botP) { botP = series[k][1]; botIdx = k; }
    if (botP > P * 0.45) continue;                         // require ≥55% drawdown
    return { botAge: series[botIdx][0], botP };
  }
  return null;
}
const whatNextCard = s => (() => {
  const DAY = 86400000;
  const px = s.series?.price;
  if (!px || !px.length) return null;
  // "Today" = SPX's latest data point (month/day). P0 for each peer is the SAME month/day
  // in ITS cycle-bottom YEAR — i.e. where SPX sits now, seasonally, in the peer's cycle. So
  // the card shows the FINAL capitulation (a further leg down into the Nov/Dec low) that
  // still lay ahead from this point, THEN the climb — not "the bottom is already in".
  const today = new Date(px.at(-1)[0]), tMon = today.getUTCMonth(), tDay = today.getUTCDate();
  const monLbl = today.toLocaleString("en-US", { month: "short" });
  const peers = AGE_PEERS.map(peer => {
    // Prefer the DAILY series (banked by build-alt-history → stats.altHistory) so peaks are
    // exact; fall back to the thinned bundled series until the daily data is present.
    const series = s.altHistory?.[peer.kind]?.series?.length >= 100 ? s.altHistory[peer.kind].series : peer.series;
    const fb = firstCycleBottom(series);
    if (!fb) return null;
    const launchTs = Date.parse(peer.launch + "T00:00:00Z");
    const botYear = new Date(launchTs + fb.botAge * DAY).getUTCFullYear();
    const anchorAge = (Date.UTC(botYear, tMon, tDay) - launchTs) / DAY; // "today" in the bottom year
    if (anchorAge <= 0 || anchorAge >= fb.botAge) return null;          // must sit BEFORE the bottom
    const anchorP = interpAt(series, anchorAge);
    if (!(anchorP > 0)) return null;
    const end = Math.min(anchorAge + FUTURE_DAYS, series.at(-1)[0]);
    const fwdRows = series.filter(([a]) => a > anchorAge && a <= end);
    const fwd = fwdRows.map(([a, p]) => [(a - anchorAge) / 365, p / anchorP]);
    const atEnd = interpAt(peer.series, end) / anchorP;
    const pts = [[0, 1], ...fwd, [(end - anchorAge) / 365, atEnd]];
    if (pts.length < 5) return null;
    // The PEAK of the recovery (the next cycle top) — the honest "how high it got".
    // The +Ny ENDPOINT undersells badly when the coin peaked then fell back (SOL, ETH).
    let peakMult = 1, peakX = 0;
    for (const [a, p] of fwdRows) { const m = p / anchorP; if (m > peakMult) { peakMult = m; peakX = (a - anchorAge) / 365; } }
    return {
      peer, pts, mult: peakMult, peakX, peakY: peakMult, year: botYear,
      capX: (fb.botAge - anchorAge) / 365, capY: fb.botP / anchorP, // the final-capitulation trough
    };
  }).filter(Boolean);
  if (peers.length < 2) return null;
  const yrs = Math.round(Math.max(...peers.map(p => p.pts.at(-1)[0])));
  const allY = peers.flatMap(x => x.pts.map(p => p[1]));
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  const yTicks = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100].filter(v => v >= yMin * 0.85 && v <= yMax * 1.15).map(v => ({ v, label: fMult(v) }));
  const xTicks = [];
  for (let y = 1; y <= yrs; y++) xTicks.push({ x: y, label: `+${y}y` });
  const fm = m => String(+m.toFixed(m >= 10 ? 0 : 1)) + "×";
  const moveStr = peers.map(x => `${x.peer.name} +${fm(x.mult)}`).join(", ");
  const dips = peers.map(x => Math.round((1 - x.capY) * 100));
  return {
    id: "whatnext",
    text: ct`🔮 Each legend aligned to the month SPX sits at now (${monLbl}), in its own first bear-cycle year (1× = today).
From there, after a dip into a year-end low, they ran to their next-cycle tops: ${moveStr}.
History rhymes — it's not a forecast.`,
    card: { type: "line", spec: {
      title: "",
      headline: `The legends at SPX6900's point in the first bear cycle`,
      accent: "#4ade80",
      yLog: true, yMin: yMin * 0.8, yMax: yMax * 1.2, yTicks, xTicks,
      hlines: [{ y: 1, color: "#94a3b8", label: `SPX is here — today (${monLbl}, 1×)`, dash: true }],
      logoMarks: [{ x: 0, y: 1, kind: "spx", size: 58 }],                 // SPX coin at P0 (today) — on brand
      markers: [
        ...peers.map(x => ({ x: x.capX, y: x.capY, color: x.peer.color })),   // final-capitulation troughs
        ...peers.map(x => ({ x: x.peakX, y: x.peakY, color: x.peer.color })),  // next-cycle-top peaks
      ],
      legend: peers.map(x => ({ color: x.peer.color, label: `${x.peer.name} · ${x.year}` })),
      series: peers.map(x => ({ pts: x.pts, color: x.peer.color, width: 3.6, logo: x.peer.kind })),
    } },
  };
})();

// NOTE: memecoin same-age peer config (dogePeer etc.) removed 2026-07-13 — DOGE was a
// POOR same-age match (flat its first ~3y; SPX ~500× vs DOGE ~1× = a gap, not a rhyme).
// The resemblance study (scripts/find-resemblance.mjs) picks the true best-matching peer;
// its same-age card gets built from stats.altHistory via the ageCard factory, and it can
// also be folded into whatNextCard's peer list once its series is banked.

// Each builder returns { id, text, card }. card is { type, spec }.
const POSTS = [
  // 1 — valuation / rainbow
  s => ({
    id: "valuation",
    text: copy("valuation",
`📊 SPX6900 is trading {pct}% {dir} its long-run trend. {emoji} {band} band.
The rainbow fits a power-law trend to SPX6900's history. Fair value for its age is {fair}; blue means cheap, red means stretched.
Not a prediction. Just where today sits in the long arc.`,
      { pct: Math.abs(Math.round(s.vsCenter * 100)), dir: s.vsCenter < 0 ? "below" : "above", emoji: BAND_EMOJI[s.bandIndex], band: s.band.l, fair: fPrice(s.center) }),
    card: { type: "rainbow" },
  }),

  // 1b — power-law channel: the same model on LOG–LOG axes, where the fair-value
  // power law is a straight diagonal and the limits are parallel rails.
  s => ({
    id: "channel",
    text: copy("channel",
`📐 The rainbow, straightened. On log price vs log age, SPX6900's power-law fair value is a straight diagonal, the limits parallel rails.
Price sits {pct}% {dir} fair value — {band} zone.
A cleaner read on how far price is from the middle.`,
      { pct: Math.abs(Math.round(s.vsCenter * 100)), dir: s.vsCenter < 0 ? "below" : "above", band: s.band.l }),
    card: { type: "channel" },
  }),

  // 1b2 — valuation z-score: weekly closes drawn as DOTS, each coloured by how many σ
  // it sits from the power-law fair value (blue = cheap, red = stretched).
  s => (() => {
    // log-residual z-score vs the model's fair value, same model as the card so the
    // headline number matches. Population mean/std over the full history.
    const m = s.model, zs = DEFAULT_RAW.map(r => Math.log(r.price) - m.predict(M.dayN(r.date)));
    const mean = zs.reduce((a, z) => a + z, 0) / zs.length;
    const std = Math.sqrt(zs.reduce((a, z) => a + (z - mean) ** 2, 0) / zs.length) || 1;
    const z = (Math.log(s.price) - m.predict(s.day) - mean) / std;
    const label = z < -1.5 ? "deep value" : z < -0.5 ? "cheap" : z < 0.5 ? "around fair value" : z < 1.5 ? "stretched" : "frothy";
    return {
      id: "riskcolor",
      text: ct`🌈 SPX6900 is ${(z >= 0 ? "+" : "") + z.toFixed(1)}σ from fair value — ${label}.
Each dot is a weekly close, coloured by its z-score from fair value: blue = below trend, red = stretched above.
A statistical read on cheap vs heated.`,
      card: { type: "riskcolor" },
    };
  })(),

  // 1b3 — current risk levels projected onto price: "what price = what risk, today".
  s => ({
    id: "risklevels",
    text: ct`🎯 At ${fPrice(s.price)}, SPX6900 sits at risk ${s.risk.toFixed(2)} / 1.00.
Each dashed line is a rainbow risk level priced for today — cheap at the bottom, stretched at the top.
What price = what risk, right now.`,
    card: { type: "risklevels" },
  }),

  // 1b4 — price + risk HEAT oscillator: risk drawn hot/cold around a neutral line
  // under the price. Same data as the rainbow, a different read.
  s => (() => {
    // short-term extension vs the 20-week MA (trailing 140d avg), computed inline so
    // this stays out of the renderer's dependency graph. Uses the MERGED history ending
    // TODAY (not the frozen bundle) so the MA is current and matches the riskheat card.
    const src = (s.drawn && s.drawn.length) ? s.drawn : DEFAULT_RAW;
    const pts = src.map(r => ({ t: new Date(r.date).getTime(), p: r.price })).sort((a, b) => a.t - b.t);
    const last = pts.at(-1).t, WK = 140 * 86400000;
    let sum = 0, n = 0;
    for (const r of pts) { if (r.t > last - WK && r.t <= last) { sum += r.p; n++; } }
    const ext = Math.round((s.price / (n ? sum / n : pts[0].p) - 1) * 100);
    return {
      id: "riskheat",
      text: ct`🌡️ SPX6900 is ${ext >= 0 ? "+" : ""}${ext}% from its 20-week moving average.
How stretched price is from the line it reverts to — red = hot/extended, blue = cold/discounted.
A faster, short-term read than the rainbow.`,
      card: { type: "riskheat" },
    };
  })(),

  // 1b5 — 365D running ROI: price ÷ price 365 days ago, over time. A rolling
  // one-year holder's return; above the 1× line = a profitable year, below = under.
  s => (() => {
    const last = new Date(s.date).getTime(), YEAR = 365 * 86400000, target = last - YEAR; // same "now" as the card
    let best = null, bd = Infinity;
    for (const r of DEFAULT_RAW) { const t = new Date(r.date).getTime(), d = Math.abs(t - target); if (d < bd) { bd = d; best = r; } }
    if (!best || bd > 18 * 86400000) return null; // not enough history yet
    const roi = s.price / best.price, pct = Math.round((roi - 1) * 100);
    return {
      id: "runningroi",
      text: ct`📈 Bought SPX6900 a year ago? You'd be ${roi.toFixed(2)}× — ${pct >= 0 ? "+" : ""}${pct}%.
Rolling 1-year ROI at each date: above the green 1× line = a profitable year, below = underwater.
The holder's rolling return, not since-launch.`,
      card: { type: "runningroi" },
    };
  })(),

  // 1b6 — PlanB-style RSI dots: monthly price coloured by RSI over a geometric MA —
  // an homage to @100trillionUSD's Bitcoin "Realized Price & MA" chart.
  s => (() => {
    // monthly RSI(6) from the shared card helper, so the headline matches the card.
    const r = Math.round(rsiNow(s.price, s.date, s.drawn));
    const tag = r < 40 ? "cold / oversold" : r < 55 ? "neutral" : r < 70 ? "warming up" : "hot / overbought";
    return {
      id: "rsidots",
      text: ct`📊 SPX6900 RSI today: ${r} — ${tag}.
Price as dots coloured by RSI — blue cold/oversold, red hot/overbought — over its geometric MA.
A homage to the Bitcoin RSI chart by @100trillionUSD.`,
      card: { type: "rsidots" },
    };
  })(),

  // 1c — SPX6900 vs the REAL S&P 500, total return since launch: a growth-multiple
  // race on a log axis. The on-brand flex — the memecoin vs the index it's named
  // after — two honest returns from day one. S&P closes are bundled (SP500_HISTORY).
  s => (() => {
    const spBy = new Map(SP500_HISTORY.map(([d, c]) => [d, c]));
    for (const [d, c] of (s.spSeries || [])) if (c > 0) spBy.set(d, c); // extend past the bundle with daily snapshot closes
    const spNear = d => { let t = new Date(d); for (let k = 0; k < 8; k++) { const ds = t.toISOString().slice(0, 10); if (spBy.has(ds)) return spBy.get(ds); t = new Date(t - 86400000); } return null; };
    const spFirst = spNear(s.firstDate);
    if (!spFirst) return null;
    const spNow = s.sp ?? SP500_HISTORY.at(-1)[1];
    const spxMult = s.price / s.firstPrice, spMult = spNow / spFirst;
    const spxPts = s.series.price.map(([ts, p]) => [ts, p / s.firstPrice]);
    const spPts = s.series.price.map(([ts]) => { const c = spNear(new Date(ts).toISOString().slice(0, 10)); return c ? [ts, c / spFirst] : null; }).filter(Boolean);
    return {
      id: "spxvssp",
      text: ct`🏆 Since launch: SPX6900 ${fMult(spxMult)} vs the S&P 500's ${fPct(spMult - 1)}.
The memecoin vs the index it's literally named after — two honest returns from day one.
How far it has run, not a call on the next leg.`,
      card: { type: "line", spec: {
        title: "SPX6900 vs the S&P 500 — since launch", headline: `${fMult(spxMult)} vs ${fPct(spMult - 1)}`, accent: "#4ade80",
        yLog: true, yFmt: v => `${v >= 1 ? Math.round(v) : v}×`,
        series: [
          { pts: spPts, color: "#3b82f6", width: 4.2, logo: "sp500", fill: 0.14, glow: true },
          { pts: spxPts, color: "#4ade80", width: 4.5, logo: "spx", fill: 0.18, glow: true },
        ],
      } },
    };
  })(),

  // 1d — power-law roadmap: run the fitted fair-value (center) line forward and
  // stamp the dates it crosses the meme targets. Forward-looking but grounded in
  // the trend, not a vibes target.
  s => (() => {
    const m = s.model;
    const dayForPrice = T => Math.exp((Math.log(T) - m.b) / m.a) - m.t0; // inverse of predict()
    const fairAt = d => Math.exp(m.predict(d));
    const t = M.TARGETS.map(x => ({ ...x, day: dayForPrice(x.price) })).filter(x => x.day > s.day).slice(0, 3);
    if (t.length < 2) return null;
    const fMonY = day => fMon(M.ds(Math.round(day)));
    const fairPts = [];
    for (let d = M.dayN(s.firstDate); d <= t.at(-1).day; d = Math.max(d + 1, Math.round(d * 1.02))) fairPts.push([Date.parse(M.ds(Math.round(d))), fairAt(d)]);
    return {
      id: "roadmap",
      text: ct`📈 Where the trend points next: ${t[0].label} by ${fMonY(t[0].day)}.
Hold the power-law fair value and the center line reaches ${t[1].label} by ${fMonY(t[1].day)}${t[2] ? `, ${t[2].label} by ${fMonY(t[2].day)}` : ""}.
The fit run forward, not a vibes target.`,
      card: { type: "line", spec: {
        title: "Power-law roadmap — the trend, extrapolated", headline: `next: ${t[0].label} by ${fMonY(t[0].day)}`, accent: "#a78bfa",
        yLog: true, yTicks: decadeTicks(s.firstPrice, t.at(-1).price * 1.2),
        series: [
          { pts: s.series.price, color: "#ffffff", width: 2.4 },
          { pts: fairPts, color: "#84cc16", width: 3, dash: true },
        ],
        hlines: t.map(x => ({ y: x.price, label: `${x.label} · ${fMonY(x.day)}`, color: x.c })),
        markers: t.map(x => ({ x: Date.parse(M.ds(Math.round(x.day))), y: x.price, color: x.c })),
        marker: { x: lastTs(s), y: s.price, color: "#ffffff" },
      } },
    };
  })(),

  // 2 — risk gauge (line, 0..1). De-rotated + console-hidden (OG_ONLY): the
  // fngtrend card now plots this exact valuation-risk line alongside crypto Fear
  // & Greed, so the standalone is redundant in the feed. Kept buildable only to
  // back the website's Risk tab share image (api/og.js ?tab=risk).
  s => ({
    id: "risk",
    text: ct`🌡️ SPX6900 valuation risk: ${s.risk.toFixed(2)} / 1.00. Today reads ${s.risk < 0.34 ? "historically cheap" : s.risk < 0.66 ? "fair" : "rich"}.
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
    text: ct`📉 SPX6900 is ${fPct(s.drawdown)} from its all-time high (${fPrice(s.ath)}, ${fMon(s.athDate)}).
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
      text: ct`🚀 SPX6900 is ${fPct(s.lastFireSale.sinceGain)} since the last Fire Sale low (${fMon(s.lastFireSale.date)}, ${fPrice(s.lastFireSale.low)}).${ranHigher ? ` Ran as high as ${fPct(s.lastFireSale.peakGain)}.` : ""}
A Fire Sale is the rainbow's deepest band. Every major SPX run so far has launched from there.
Cheap can get cheaper, but the deepest discounts paid the patient.`,
      card: { type: "line", spec: {
        title: `Since the last Fire Sale (${fMon(s.lastFireSale.date)})`, headline: fPct(s.lastFireSale.sinceGain), accent: "#4ade80",
        yLog: true, yTicks: decadeTicks(lo, hi),
        // The rainbow valuation bands the rally climbed through (Fire Sale → up),
        // as horizontal strips behind the price line.
        bands: s.lastFireSale.bands,
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

  // 4b — Fire Sale rallies overlay: EVERY capitulation-band low and how it ran (×
  // from the low, log). The current episode runs to today (peak may be behind it).
  // Honest framing: lead with the LIVE gain, headline the PATTERN not the launch
  // mega-run (that came off a sub-cent base and can't repeat). A rally ends only when
  // price re-enters the Fire Sale band, not on a % pullback.
  s => s.lastFireSale && (() => {
    const R = M.buildFireSaleRalliesLive(s.drawn, s.model, { minGain: 0.3 });
    const cur = R.at(-1);
    if (!cur || !cur.live) return null;
    const desc = cur.offPeak >= -0.1 ? "near its high" : cur.offPeak > -0.35 ? "pulled back" : "faded";
    const win = Math.max(90, cur.daysSince); // chart's x-window (mirrors the card)
    return {
      id: "firesalerally",
      text: ct`🔥 SPX6900 is ${fPct(cur.nowGain)} since the ${fMon(cur.startDate)} Fire Sale low — ${desc}, ${cur.daysSince}d in (peaked ${fPct(cur.peakGain)}).
Every low in the rainbow's deepest band rallied off it (chart: first ${win} days). The launch run went further, from a sub-cent base.
A pattern, not a promise.`,
      card: { type: "firesalerally" },
    };
  })(),

  // 4c — Underwater: drawdown from the ATH over time + price, with the recovery track
  // record (fresh-ATH count, deepest valley). The honest pain-side counterpart to the
  // aspirational cards. Leads with the current depth; NO recovery promise (it's deep
  // and unrecovered now). A rhyme of survived drawdowns, not a bottom call.
  s => (() => {
    const { athCount, deepest } = M.drawdownSummary(s.drawn);
    return {
      id: "underwater",
      text: ct`📉 SPX6900 is ${fPct(s.drawdown)} below its all-time high (${fPrice(s.ath)}, ${fMon(s.athDate)}).
Every red valley is a drawdown from a peak; back to 0% is a fresh high. It's made ${athCount}, and once fell ${fPct(deepest)} before climbing back.
Deep drawdowns are the toll. It's paid them before.`,
      card: { type: "underwater" },
    };
  })(),

  // 4d — Golden / Death Cross: the classic 50-day vs 200-day MA cross. The most
  // recognisable trend line in markets — mainstream, meme-able, and event-driven (a
  // cross is a genuine "notable today"). A widely-watched line, framed as such (NFA).
  s => (() => {
    const gc = M.goldenCross(s.drawn);
    if (!gc.rows.length || gc.gap == null) return null;
    const st = M.crossState(gc.gap), gp = Math.round(Math.abs(gc.gap) * 100);
    return {
      id: "goldencross",
      text: ct`📊 SPX6900's 50-day average is ${gp}% ${gc.gap >= 0 ? "above" : "below"} its 200-day — ${st.watch || st.label.toLowerCase()}.
The classic 50/200 cross: golden = the 50 crossing up through the 200, death = crossing down. It's crossed ${gc.crosses.length} times since launch.
A widely-watched line, not a signal.`,
      card: { type: "goldencross" },
    };
  })(),

  // 4e — Holder growth: the holder COUNT over time vs price. Data-gated (needs a couple
  // weeks of daily snapshots). Holder-count growth = genuinely new wallets, the one
  // on-chain metric safe to read as accumulation. A foundation card — grows over time.
  s => (s.supply?.holderSeries?.length >= 8) && (() => {
    const hs = s.supply.holderSeries, first = hs[0], cur = hs.at(-1);
    const grew = cur.holders - first.holders, ndays = Math.round((cur.ts - first.ts) / 86400000);
    return {
      id: "holdergrowth",
      text: ct`🧲 SPX6900's holder base has grown to ${cur.holders.toLocaleString()} wallets — ${grew >= 0 ? "+" : ""}${grew.toLocaleString()} in ~${ndays} days.
New wallets are genuinely new holders (not a tier reclassification), so a rising count is real accumulation — even through the price swings.
The base keeps building.`,
      card: { type: "holdergrowth" },
    };
  })(),

  // Holders vs price — HISTORICAL (from launch), off the Dune ETH holder series
  // (stats.onchain, auto-refreshed). The conviction story: the holder count climbed
  // steadily while price round-tripped — accumulation decoupled from price. Reuses the
  // holderspair dual-axis render. Distinct from holdergrowth (count only, forward-only).
  s => (s.onchain?.length >= 50) && (() => {
    const o = s.onchain, first = o[0], cur = o.at(-1);
    const peak = Math.max(...o.map(r => r.spot));
    const dd = Math.round((1 - cur.spot / peak) * 100);
    const mult = cur.holders / first.holders;
    return {
      id: "holdersprice",
      text: ct`📈 SPX6900's on-chain holder base grew from ${first.holders.toLocaleString()} to ${cur.holders.toLocaleString()} — through the whole cycle, including an ~${dd}% drawdown from the top.
Price round-tripped; the holder count only went up. Accumulation decoupled from price.
Conviction, on-chain.`,
      card: { type: "holderspair", spec: {
        title: "Holders vs price — since launch",
        headline: `${cur.holders.toLocaleString()} holders · +${mult.toFixed(0)}× since launch`,
        accent: "#4ade80",
        holders: o.map(r => [Date.parse(r.d), r.holders]),
        price: o.map(r => [Date.parse(r.d), r.spot]),
      } },
    };
  })(),

  // Holders across chains — the REACH story. SPX is on ETH (native) + Base + Solana
  // (bridged). By supply the bridged chains are ~6%, but by HEADCOUNT they dwarf ETH,
  // so the real community is several× the ~50k we usually post. Data-gated on the
  // multi-chain snapshot columns (Base banks free on the first cron; Solana once its
  // key is set). Honesty rail baked in: wallets across chains, not people.
  s => {
    const { eth, base, sol } = currentChainHolders(s); // corrected (Base over-count rebased)
    if (!(eth > 0) || !(base > 0 || sol > 0)) return null;
    const totalH = eth + (base || 0) + (sol || 0);
    const total = s.supply?.totalSupply || 939e6;
    const haveValue = s.supply?.supplyBase > 0 || s.supply?.supplySol > 0;
    // With per-chain supplies banked, lead with the honest contrast: headcount vs value.
    if (haveValue) {
      const bridgedH = Math.round(((base || 0) + (sol || 0)) / totalH * 100);
      const bridgedV = Math.round(((s.supply.supplyBase || 0) + (s.supply.supplySol || 0)) / total * 100);
      return {
        id: "multichain",
        text: ct`🌐 Two views of SPX6900 across chains — ~${(totalH / 1000).toFixed(0)}k wallets, but where's the value?
${bridgedH}% of holders sit on Base & Solana, yet those bridged chains hold just ~${bridgedV}% of the supply — ${100 - bridgedV}% of the value stays on Ethereum.
Wallets, not people. Base & Solana are bridged.`,
        card: { type: "multichain" },
      };
    }
    const mult = totalH / eth;
    const chains = ["Ethereum", base > 0 ? "Base" : null, sol > 0 ? "Solana" : null].filter(Boolean);
    const list = chains.length === 3 ? "Ethereum, Base & Solana" : chains.join(" & ");
    return {
      id: "multichain",
      text: ct`🌐 SPX6900 has ~${(totalH / 1000).toFixed(0)}k holders across ${list} — ${mult.toFixed(1)}× the ~${(eth / 1000).toFixed(0)}k on Ethereum alone.
Supply concentrates on Ethereum, but most of the crowd lives on the bridged chains — these are wallets across chains, not people.
One coin, one community, three chains.`,
      card: { type: "multichain" },
    };
  },

  // Holder growth by chain — the three-line race (ETH/Base/Solana), each rebased to
  // its own start so it reads as % change in holders per chain over time. The TREND
  // companion to the multichain donut snapshot. Data-gated on the multi-chain era
  // accumulating (~a week+ of banked columns); a foundation card — fills in over time.
  s => {
    const cs = s.supply?.chainSeries || [];
    if (cs.length < 6) return null;
    // Rebase each chain to its first non-null value and read the current % change.
    const pctOf = key => {
      const pts = cs.map(r => r[key]).filter(v => v != null && v > 0);
      return pts.length >= 2 ? pts.at(-1) / pts[0] - 1 : null;
    };
    const parts = [["Ethereum", pctOf("eth")], ["Base", pctOf("base")], ["Solana", pctOf("sol")]]
      .filter(([, v]) => v != null);
    if (parts.length < 2) return null;
    const fp = v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v) * 100) + "%";
    const lead = parts.slice().sort((a, b) => b[1] - a[1])[0];
    const list = parts.map(([n, v]) => `${n} ${fp(v)}`).join(", ");
    return {
      id: "chainrace",
      text: ct`📈 Holders by chain since we started tracking all three: ${list}.
${lead[0]} is growing its wallet base fastest — Base and Solana are bridged, and these are wallets, not people.
The whole community, chain by chain.`,
      card: { type: "chainrace" },
    };
  },

  // MVRV vs Bitcoin — SPX6900's on-chain valuation on BTC's decade of MVRV. Data-gated on
  // the BTC MVRV bundle (public/btc-mvrv.json, banked monthly) + the holder break-even. The
  // hook is a valuation POSITION (percentile on BTC's own map), true right now — framed as
  // "as cheap as BTC's bottoms were," NOT "SPX will follow BTC's path" (that's the guardrail).
  s => (s.btcMvrv?.length >= 100 && s.supply?.breakEven > 0) && (() => {
    const mvrv = s.price / s.supply.breakEven;
    const sorted = s.btcMvrv.map(p => p[1]).filter(v => v > 0).sort((a, b) => a - b);
    const cheaperThan = 100 - Math.round(sorted.filter(v => v <= mvrv).length / sorted.length * 100);
    return {
      id: "mvrvbtc",
      text: ct`🔵 SPX6900's MVRV is ${mvrv.toFixed(2)}× — the average holder is ${mvrv >= 1 ? "in profit" : "underwater"}.
On-chain, that's cheaper than ${cheaperThan}% of Bitcoin's entire history — a level BTC only reached at its cycle bottoms.
As cheap as it's been, measured against Bitcoin.`,
      card: { type: "mvrvbtc" },
    };
  })(),

  // MVRV over time — SPX6900's own on-chain valuation across its FULL history (price ÷ the
  // crowd's realized cost basis), now buildable from the Dune realized-cost backfill. Sibling
  // of mvrvbtc but vs ITS OWN history (own-quantile zones + percentile), not Bitcoin's. Hook:
  // a valuation POSITION true right now — cheaper than most of its own history — plainly worded
  // ("underwater"), NOT a buy signal (the guardrail: a lagging value read, not timing).
  s => (s.mvrvSeries?.length >= 100) && (() => {
    const raw = s.mvrvSeries, mvrv = raw.at(-1).mvrv, up = mvrv >= 1;
    const sorted = raw.map(r => r.mvrv).sort((a, b) => a - b);
    const cheaperThan = 100 - Math.round(sorted.filter(v => v <= mvrv).length / sorted.length * 100);
    return {
      id: "mvrvtrend",
      text: ct`🟣 SPX6900's MVRV is ${mvrv.toFixed(2)}× — the average holder is ${up ? "in profit" : "underwater"}.
Price sits ${up ? "above" : "below"} the crowd's on-chain cost basis — cheaper than ${cheaperThan}% of SPX6900's entire history.
${up ? "Rich on its own chart." : "It's only been this cheap near its lows."}`,
      card: { type: "mvrvtrend" },
    };
  })(),

  // Supply in Profit % — the flagship on-chain metric, from the Dune per-wallet
  // cost-basis reconstruction (previously impossible via HolderScan). Share of
  // ETH-native supply whose holder is above their cost basis. Plain-word valuation
  // POSITION (high near tops, low near bottoms), not a buy signal (the guardrail).
  s => (s.onchain?.length >= 50) && (() => {
    const sip = s.onchain.at(-1).sip, under = sip < 50;
    return {
      id: "supplyprofit",
      text: ct`🟢 ${sip.toFixed(0)}% of SPX6900's supply is in profit — the rest is underwater.
Reconstructed on-chain: the share of supply whose wallet sits above its cost basis. It topped ~100% at every price peak and bottomed near 2%.
${under ? "Most holders are red — and still holding." : "Most of the float is green."}`,
      card: { type: "supplyprofit" },
    };
  })(),

  // Holder concentration — the largest wallets' share of ETH-native supply over time
  // (Dune, contracts/CEX excluded). The honest story: SPX has DECENTRALISED as the
  // holder base grew (top 100 ~68%→~58%). A distribution-of-ownership statement, NOT
  // a signal. Sits in the "how healthy is the holder base" lane, not valuation.
  s => (s.onchain?.length >= 50) && (() => {
    const o = s.onchain, cur = o.at(-1), first = o[0];
    return {
      id: "concentration",
      text: ct`🐋 SPX6900's top 100 wallets hold ${cur.top100.toFixed(0)}% of supply — down from ${first.top100.toFixed(0)}% at launch.
As the holder base grew, the whales' grip loosened: the top 10 slipped from ${first.top10.toFixed(0)}% to ${cur.top10.toFixed(0)}%. The float keeps spreading into more hands.
Decentralising, on-chain.`,
      card: { type: "concentration" },
    };
  })(),

  // HODL waves — supply by holding age over time (Dune). The classic maturation
  // story: 100% fresh at launch → a third now in the longest-held (1y+) tier. A
  // holding-behaviour / conviction read, NOT a signal.
  s => (s.onchain?.length >= 50 && Array.isArray(s.onchain.at(-1).age)) && (() => {
    const old = s.onchain.at(-1).age[4];
    return {
      id: "hodlwaves",
      text: ct`💎 ${old.toFixed(0)}% of SPX6900's supply hasn't moved in over a year.
At launch every coin was fresh; now more than a third sits in the longest-held tier — the cohort that held through the entire cycle so far.
Supply maturing, on-chain.`,
      card: { type: "hodlwaves" },
    };
  })(),

  // "Am I Cheap?" convergence — how many independent valuation lenses (rainbow band,
  // MVRV, supply-in-profit, Pi Cycle, F&G) agree on where SPX sits. The corroboration
  // is the point; a valuation POSITION, never a timing call. Verdict adapts to state.
  s => (() => {
    const t = valuationTally(s);
    if (t.total < 4) return null;
    const head = t.verdict === "cheap" ? `${t.cheap} of ${t.total} independent valuation lenses say SPX6900 is cheap right now`
      : t.verdict === "rich" ? `${t.rich} of ${t.total} independent valuation lenses say SPX6900 is rich right now`
      : `SPX6900's valuation lenses are mixed right now — ${t.cheap} cheap, ${t.rich} rich of ${t.total}`;
    return {
      id: "amicheap",
      text: ct`🌈 ${head}.
Rainbow band, on-chain cost basis, supply-in-profit, Pi Cycle trend and Fear & Greed — one metric can mislead, several agreeing is the honest read.
Where it sits across the data — not a timing call.`,
      card: { type: "amicheap" },
    };
  })(),

  // Multi-chain wallet growth — total holder headcount across ETH+Base+Solana from
  // launch. Adoption compounded through the whole cycle. Honest rails: headcount is
  // multi-chain (holders ≠ value); "wallets, not people".
  s => (s.chainWallets?.length >= 50 && s.chainWallets.at(-1).base != null) && (() => {
    const cur = s.chainWallets.at(-1), first = s.chainWallets[0];
    const total = cur.eth + (cur.base || 0) + (cur.sol || 0);
    const start = first.eth + (first.base || 0) + (first.sol || 0);
    return {
      id: "walletgrowth",
      text: ct`🌐 ${total.toLocaleString("en-US")} wallets hold SPX6900 across Ethereum, Base and Solana — up from ${start.toLocaleString("en-US")} at launch.
The holder base compounded through the whole cycle. Base & Solana lead headcount; Ethereum holds the value.
Wallets, not people — adoption is adoption.`,
      card: { type: "walletgrowth" },
    };
  })(),

  // Pi Cycle ratio — the continuous 111/(350×2) MA gauge from Bitcoin's Pi Cycle indicator,
  // applied to SPX for context. The ratio (not the borrowed binary cross) as an accumulation
  // gauge: >1 top zone, <0.5 accumulation. Honest angle: it ran hot at SPX's 2025 top and is
  // now deep in accumulation — a rhyme with the MVRV read. Data-gated on a 350-DMA existing.
  s => (() => {
    const pc = M.piCycleRatio(s.drawn);
    if (pc.rows.length < 60) return null;
    const r = pc.cur.ratio, peak = pc.peak.ratio, st = M.piCycleState(r, pc.zones);
    return {
      id: "picycle",
      text: ct`🟣 SPX6900's Pi Cycle ratio sits at ${r.toFixed(2)} — ${st.label}.
This 111-day vs 350-day MA gauge (from Bitcoin's Pi Cycle) peaked at ${peak.toFixed(2)} at SPX's 2025 top; today it's near the bottom of its range.
A Bitcoin indicator, applied to SPX for context.`,
      card: { type: "picycle" },
    };
  })(),

  // (removed 2026-06-28) two cards pulled as not landing with the audience:
  //   • "strategy vs HODL (perfect hindsight)" — dry + buy-the-top-hype framing.
  //   • "volatility / how wild is it" (3-bar SPX vs BTC vs S&P) — owner: a bar of
  //     "120% annualized vol" is too abstract; the average user doesn't decode it.
  // Lesson (owner, 2026-06-28): the WINNERS are price-TARGET / "how many X it's run"
  // cards (targets, milestones, memecoins, btcgrade, dogeclock, roadmap, alltime, the
  // S&P flexes). "Techy" stats (vol, correlation, RSI, z-score) land weakly. Favour
  // aspirational X-multiple framing for any new card; don't add more techy ones.

  // 6 — targets (price line climbing toward the next target levels)
  s => {
    const next = s.targets.filter(t => t.price > s.price).slice(0, 3); // the next rungs above
    const top = next.at(-1) || s.targets.at(-1);
    return {
      id: "targets",
      text: ct`🎯 Next target ${next[0].label} = ${fMult(next[0].price / s.price)} from ${fPrice(s.price)}:
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
      text: ct`⏳ SPX6900 has spent ~${Math.round(s.cheaperFrac * 100)}% of its life this cheap or cheaper (${s.band.l} band today).
Each bar is the share of history in a rainbow band. Extremes are rare by design; most of any life is spent in the middle.
Rare cuts both ways: cheap is uncommon, but so is euphoria.`,
      card: { type: "bar", spec: {
        title: "Time spent in each valuation band", headline: `${Math.round(s.cheaperFrac * 100)}% this cheap or below`, accent: s.band.c,
        bars: s.series.bandCounts.map((c, i) => ({ label: BAND_SHORT[i], value: c, text: `${Math.round(c / total * 100)}%`, color: M.BAND_LABELS[i].c, outline: i === s.bandIndex, dim: c === 0 })),
      } },
    };
  },

  // 8 — diamond-adjusted "real" market cap (locked vs float, stacked)
  s => s.supply && (() => {
    const ofAll = Math.round(s.supply.diamondShare * 100); // diamond ÷ TOTAL supply
    const ofClassified = s.supply.classified ? Math.round(s.supply.tiers.diamond / s.supply.classified * 100) : null; // ÷ identified holders only
    return {
    id: "marketcap",
    text: ct`💰 Real free-float cap is just ${fMoney(s.supply.floatMc)}, vs the ${fMoney(s.supply.nominalMc)} headline.
The sticker cap assumes every coin trades. But ~${ofAll}% of all SPX sits in diamond hands that rarely sell${ofClassified ? ` (≈${ofClassified}% of identified holders)` : ""}, so tradable float is far smaller.
Thin float amplifies moves both ways.`,
    card: { type: "stack", spec: {
      title: "Headline cap vs real free float", headline: fMoney(s.supply.floatMc) + " free float", accent: "#22d3ee",
      total: s.supply.nominalMc,
      segments: [
        { label: "Diamond-locked", value: s.supply.diamondValue, text: fMoney(s.supply.diamondValue), color: "#818cf8" },
        { label: "Free float", value: s.supply.floatMc, text: fMoney(s.supply.floatMc), color: "#22d3ee" },
      ],
    } },
    };
  })(),

  // 9 — valuation vs BTC (sats line)
  s => s.btc && s.btc.series && ({
    id: "btc",
    text: ct`₿ SPX6900 priced in Bitcoin: 1 SPX = ${fNum(s.btc.sats)} sats.
Dollars hide how an asset does against the benchmark crypto really competes with. In sats, SPX is ${fPct(s.btc.rel90)} vs BTC over 90 days and ${fPct(s.btc.rel365)} over a year.
Up in dollars is easy in a bull market. Up in BTC is the truer scoreboard.`,
    card: { type: "line", spec: {
      title: "SPX6900 priced in Bitcoin (sats)", headline: fNum(s.btc.sats) + " sats", accent: "#f7931a",
      logoHeader: { left: "spx", right: "btc", result: `${fNum(s.btc.sats)} sats` },
      yFmt: v => fNum(v), // sats, not dollars
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
    const ofAll = Math.round(s.supply.diamondShare * 100); // same diamond tokens, but ÷ TOTAL supply
    return {
    id: "distribution",
    text: ct`💎 ~${diamondPct}% of SPX6900's classified holder supply is diamond hands — about ~${ofAll}% of all coins in circulation.
Same coins, two denominators: HolderScan only tiers identified wallets, so exchanges, LPs and contracts sit outside this slice.
High conviction, thin float.`,
    card: { type: "donut", spec: {
      title: "Conviction of classified holder supply", headline: `${diamondPct}% diamond hands`, accent: "#22d3ee",
      footer: `${diamondPct}% of classified ≈ ${ofAll}% of all supply · excludes exchanges, LPs & contracts`,
      legendUnit: "of classified",
      center: { big: `${diamondPct}%`, small: "of classified" },
      segments: TIERS.map(([k, label, c]) => ({ label, value: s.supply.tiers[k], color: c })),
    } },
    };
  })(),

  // 11 — average holder break-even / PnL (price line vs cost-basis line). Zoomed to
  // the last 365d so the launch run-up doesn't flatten the recent price-vs-entry read.
  s => s.supply && s.supply.breakEven && (() => {
    const up = s.supply.avgHolderPnl >= 0, accent = up ? "#4ade80" : "#f87171";
    const cutoff = lastTs(s) - 365 * 86400000;
    const recent = s.series.price.filter(p => p[0] >= cutoff);
    const pts = recent.length >= 2 ? recent : s.series.price;
    const lo = Math.min(s.supply.breakEven, ...pts.map(p => p[1]));
    const hi = Math.max(s.supply.breakEven, ...pts.map(p => p[1]));
    return {
      id: "breakeven",
      text: ct`📊 The average SPX6900 holder bought in at ~${fPrice(s.supply.breakEven)}.
At ${fPrice(s.price)} that's ${fPct(s.supply.avgHolderPnl)} — the crowd is ${up ? "in profit" : "underwater"}. It's the on-chain cost basis of the supply.
${up ? "Most of the float is green and still holding." : "Red and still not selling. That's looked like accumulation."}`,
      card: { type: "line", spec: {
        title: "Price vs the crowd's cost basis — last 12 months", headline: `${fPct(s.supply.avgHolderPnl)} avg holder`, accent,
        yLog: true, yTicks: decadeTicks(lo, hi),
        hlines: [{ y: s.supply.breakEven, label: `avg entry ${fPrice(s.supply.breakEven)}`, color: "#cbd5e1" }],
        series: [{ pts, color: accent, width: 4, fill: 0.2, glow: true }],
        marker: { x: pts.at(-1)[0], y: s.price, color: accent },
      } },
    };
  })(),

  // 11b — diamond-supply trend: share of TOTAL supply held by the longest-held
  // "diamond" tier, over time (grows as daily snapshots accumulate). The bot
  // companion to the website's "Diamond supply over time" chart.
  s => s.supply && s.supply.diamondSeries && s.supply.diamondSeries.length >= 2 && (() => {
    const ds = s.supply.diamondSeries;
    const nowPct = ds.at(-1)[1], startPct = ds[0][1], delta = nowPct - startPct;
    const dv = ds.map(p => p[1]);
    const lo = Math.min(...dv), hi = Math.max(...dv);
    const range = hi - lo, pad = Math.max(range * 0.3, 0.3);
    const decimals = (range + 2 * pad) >= 8 ? 0 : 1;
    const trend = Math.abs(delta) < 0.2
      ? `Rock steady near ${nowPct.toFixed(decimals)}% across every snapshot we've taken`
      : `${delta > 0 ? "Up" : "Down"} from ${startPct.toFixed(decimals)}% to ${nowPct.toFixed(decimals)}% since we started tracking`;
    // Bridge the two diamond numbers that confuse people: this trend is diamond as a
    // share of TOTAL supply (~61%); HolderScan headlines diamond as a share of
    // CLASSIFIED holders (~86%, excludes exchanges/LPs/contracts). Same coins, two
    // denominators — say both so 61 vs 86 never reads as a drop.
    const cpct = s.supply.classified ? Math.round((s.supply.diamondTokens / s.supply.classified) * 100) : null;
    return {
      id: "diamondtrend",
      text: copy("diamondtrend",
`💎 Diamond hands hold ~{pct}% of all SPX6900 supply ({value}) — the float that rarely moves.
That's {cpct}% of classified holders (HolderScan's number); the gap is coins on exchanges & in LPs.
{trend}.`,
        { pct: Math.round(nowPct), cpct, value: fMoney(s.supply.diamondValue), trend }),
      card: { type: "line", spec: {
        title: "Diamond hands — share of total supply over time", headline: cpct ? `${Math.round(nowPct)}% of supply · ${cpct}% of classified` : `${Math.round(nowPct)}% diamond supply`, accent: "#22d3ee",
        yMin: lo - pad, yMax: hi + pad, yFmt: v => v.toFixed(decimals) + "%",
        series: [{ pts: ds, color: "#22d3ee", width: 3.5, fill: 0.18 }],
        marker: { x: ds.at(-1)[0], y: ds.at(-1)[1], color: "#22d3ee" },
      } },
    };
  })(),

  // 11c — on-chain positioning: Hyperliquid perp funding, normalised to its neutral
  // baseline (so the structural ~+10% APR reads as neutral, not "long"). Data-gated.
  s => s.longshort && s.longshort.filter(r => r.hlFunding != null).length >= 8 && (() => {
    const fund = s.longshort.filter(r => r.hlFunding != null);
    const aprs = fund.map(r => r.hlFunding * 24 * 365 * 100);
    const neutral = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length / 2)];
    const dev = aprs.at(-1) - neutral;
    const lean = dev > 8 ? "leaning long" : dev < -8 ? "leaning short" : "sitting neutral";
    const devTxt = `${dev >= 0 ? "+" : ""}${Math.round(dev)}%`;
    return {
      id: "longshort",
      text: ct`⚖️ SPX6900 perp funding is ${lean} — ${devTxt} vs its neutral baseline (Hyperliquid).
It runs ~${Math.round(neutral)}% APR even when balanced; normalised to that, this is the real skew.
On-chain, unmanipulable — extremes are a contrarian tell, not a signal.`,
      card: { type: "longshort" },
    };
  })(),

  // 12 — SPX vs the majors over the trailing 12 months (rebased to 0% a year back).
  // Four overlaying price-action lines, each ending in its coin logo — the rolling
  // sibling of the YTD race. Shown even when SPX trails; the closer reflects rank.
  s => s.majors && s.majors.length && (() => {
    const r = majorsRace(s, s.series.price.at(-1)[0] - 365 * 86400000);
    if (!r) return null;
    const closer = r.spxRank === 0
      ? "SPX6900 out front — leading the majors over the year."
      : r.behind.length === 0
        ? (r.spxRet >= 0 ? "Green over the year, just not the leader yet." : "A year in the cold — exactly where the rainbow says the next run is built.")
        : `${r.spxRet >= 0 ? "Green over the year and" : "Red over the year but"} already ahead of ${r.behind.join(" & ")} — only ${r.ahead.join(" & ")} in front.`;
    return {
      id: "majors",
      text: ct`📊 Last 12 months: SPX6900 ${fPct(r.spxRet)} vs the majors, no spin:
${r.standings}
All rebased to 0% a year back, a clean same-start race vs BTC, ETH and SOL. ${closer}`,
      card: { type: "line", spec: {
        ...r.spec,
        title: "The 12-month race: SPX6900 vs the majors", headline: `SPX6900 ${fPct(r.spxRet)} · 12mo`,
      } },
    };
  })(),

  // 13 — all-time return (price history, log)
  s => ({
    id: "alltime",
    text: ct`📈 SPX6900 is up ${fMult(1 + s.allTimeReturn)} since its first print (${fPrice(s.firstPrice)}, ${fMon(s.firstDate)}).
The whole journey on one log axis: higher highs through brutal drawdowns, the signature of a young power-law asset. The same curve Bitcoin drew.
Up only is a meme, but the direction has been one way.`,
    card: { type: "line", spec: {
      title: "Price since launch (log scale)", headline: fMult(1 + s.allTimeReturn) + " since launch", accent: "#34d399",
      yLog: true, yTicks: decadeTicks(s.firstPrice, s.ath),
      series: [{ pts: s.series.price, color: "#34d399", width: 3, fill: 0.12 }],
      marker: { x: lastTs(s), y: s.price, color: "#34d399" },
    } },
  }),

  // 14 — the RHYME: WHY we say "≈ BTC Aug '22". A dual-axis, time-aligned overlay
  // of SPX vs Bitcoin's REAL last cycle (each on its own scale) — SPX retraced
  // BTC's 2021 double top → 2022 bottom, the peaks landing weeks apart aligned.
  s => (() => {
    const c = btcCycleProjection();
    return {
      id: "cycle",
      text: ct`🔮 Today ≈ Bitcoin's ${fMon(c.btcFrom)} — just off the bottom.
Line the charts up: SPX retraced BTC's 2021 double top (Apr & Nov) → 2022 low, peaking weeks apart.
A rhyme, not a forecast. BTC ran from here.`,
      card: { type: "cyclesync" },
    };
  })(),

  // 16 — the BTC overlay, future-only path (line, log)
  s => (() => {
    // Live-anchored (matches the cycleclock card) so the copy's top/date track today.
    const c = btcCycleProjection({ anchorDate: s.date, anchorPrice: s.price });
    return {
      id: "cycleclock",
      text: ct`⏳ On Bitcoin's halving clock, SPX6900 sits just off the cycle bottom — today ≈ BTC ${fMon(c.btcFrom)}.
If it rhymes BTC's post-halving run, the path points toward ~${fPx(c.peak)} by ${fMon(c.peakTs)} (~${fMult(c.peak / s.price)} from here) — a wide cone, not a date.
A rhyme, not a forecast.`,
      card: { type: "cycleclock" },
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
      text: ct`🧊 SPX6900 is ${fMult(doge.mult)} from DOGE's ATH market cap. Flipping the memecoin kings from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each cube is one of today's caps; the pile is how many to match each king's ATH cap. Long way up. 🚀`,
      card: { type: "cube", spec: {
        title: "How many SPX6900s to flip the giants?", headline: `${doge.short} = ${fMult(doge.mult)}`, accent: SPX_CUBE,
        items: [
          { label: "SPX6900 today", logo: "spx", sub: "you are here", count: 1, color: SPX_CUBE, highlight: true },
          ...ms.map(m => ({ label: m.short, logo: m.label.split(" ")[0].toLowerCase(), sub: m.mc, count: Math.round(m.mult), color: CUBE_COLORS[m.label] || m.c })),
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
      text: ct`👑 DOGE-size = ${fMult(doge.mult)} for SPX6900. Flipping the memecoin kings from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each × is the move to match that king's ATH. Same fair-launch playbook, just earlier. Coming for the throne. 👑`,
      card: { type: "line", spec: {
        title: "Flip the memecoin kings", headline: `DOGE-size = ${fMult(doge.mult)}`, accent: "#c2a633",
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.price),
        hlines: ms.map(m => ({ y: m.price, label: fMult(m.mult), logo: m.label.split(" ")[0].toLowerCase(), color: m.c })),
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
      text: ct`₿ ${top.short} = ${fMult(top.mult)} for SPX6900. Climbing Bitcoin's market-cap ladder from ${fPrice(s.price)}:
${ms.map(m => `${m.short} (${m.mc}) → ${fMult(m.mult)}`).join(TIGHT)}
Each rung is the SPX price whose cap equals BTC's at $1K, $10K, $100K. Bitcoin cleared them all.`,
      card: { type: "line", spec: {
        title: "SPX6900 on Bitcoin's MC ladder", headline: `BTC @ $100K = ${fMult(top.mult)}`, accent: "#f7931a",
        yLog: true, yMax: top.price * 2.4, yTicks: decadeTicks(s.firstPrice, top.price),
        hlines: ms.map(m => ({ y: m.price, label: `${m.short.replace(/^BTC @ ?/, "")} · ${fMult(m.mult)}`, color: m.c })),
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
      text: ct`📐 How the SPX6900 rainbow is built: a power-law trend fit to price, R² ${m.r2.toFixed(2)}.
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
      text: ct`🧊 If SPX6900 is one cube, the whole S&P 500 is ~${fNum(mult)} of them.
SPX is ≈ ${fMoney(cap)} vs the index's ~$50T, the gap baked into the joke. A memecoin flippening its namesake would be a ~${fNum(mult)}× move.
A telescope, not a target. Every giant was once a rounding error.`,
      card: { type: "scale", spec: {
        title: "SPX6900 vs the S&P 500", accent: "#38bdf8", mult,
        fieldColor: "#3b82f6", originColor: SPX_CUBE,
        originLabel: `SPX6900 (${fMoney(cap)})`, fieldLabel: "S&P 500", fieldSub: "~$50T",
      } },
    };
  })(),

  // 21b — SPX6900 monthly returns vs the REAL S&P 500: the seasonality heatmap
  // (the design people love) but priced in S&P units. Green = SPX beat the index
  // it's named after that month, red = the S&P won. Shows 2024's domination AND
  // the recent give-back honestly, with no single damning headline — and a fresh
  // rendering vs another log line chart.
  s => (() => {
    const mh = monthlyHeatmap(spxInSpSeries(s.series.price, s));
    if (!mh) return null;
    return {
      id: "monthlyreturnssp",
      text: ct`🏆 Priced in the S&P 500, ${mh.pctGreen}% of SPX6900's ${mh.months} months have beaten the index it's named after.
Each cell is SPX6900's monthly return in S&P units, not dollars. Green = SPX beat the S&P that month, red = the S&P won.
The benchmark it parodies, month by month.`,
      card: { type: "heatmap", spec: {
        title: "SPX6900 monthly returns vs the S&P 500", headline: `${mh.pctGreen}% of months beat the S&P`, accent: "#38bdf8",
        logoHeader: { left: "spx", right: "sp500", result: `${mh.pctGreen}% of months` },
        rows: mh.rows, yearCol: true,
      } },
    };
  })(),

  // 21c — SPX6900 vs the S&P 500, year to date (rebased to 0% on Jan 1). Linear %,
  // a fresh rendering vs the log charts. Honest: SPX often trails YTD when it's in
  // a drawdown — framed through the rainbow's "cold zones launch the next run".
  s => (() => {
    const yr = new Date(Date.parse(s.date)).getUTCFullYear();
    const r = spVsWindow(s, Date.UTC(yr, 0, 1));
    if (!r) return null;
    const win = r.spxRet >= r.spRet;
    return {
      id: "sp500ytd",
      text: ct`📊 SPX6900 is ${fPct(r.spxRet)} YTD vs the S&P 500's ${fPct(r.spRet)}.
Both rebased to 0% on Jan 1, a clean same-start race against the index it's named after. ${win ? "Out in front this year." : "Behind for now, but every cold stretch on the rainbow has launched the next run."}
A snapshot of one year, not the whole war.`,
      card: spVsSpec("SPX6900 vs the S&P 500, year to date", r, "YTD"),
    };
  })(),

  // 21d — SPX6900 vs the S&P 500 over the trailing 12 months (rebased to 0%).
  s => (() => {
    const r = spVsWindow(s, s.series.price.at(-1)[0] - 365 * 86400000);
    if (!r) return null;
    const win = r.spxRet >= r.spRet;
    return {
      id: "sp500roll12",
      text: ct`📊 Last 12 months: SPX6900 ${fPct(r.spxRet)} vs the S&P 500's ${fPct(r.spRet)}.
A rolling one-year race against its namesake, both rebased to 0%. ${win ? "The meme is winning the year." : "A year in the cold, but that is exactly where the rainbow says the next run is built."}
One year is a blink for a power-law asset.`,
      card: spVsSpec("SPX6900 vs the S&P 500, last 12 months", r, "12mo"),
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
      text: ct`📅 ${mh.pctGreen}% of SPX6900's ${mh.months} months have closed green.
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
      text: ct`₿ Priced in Bitcoin, ${mh.pctGreen}% of SPX6900's ${mh.months} months have beaten BTC.
Same heatmap, but each month is SPX6900's return measured in BTC, not USD. Green months beat Bitcoin, red months lost to it.
Up in dollars is easy in a bull market. Up in BTC is the real scoreboard.`,
      card: { type: "heatmap", spec: {
        title: "SPX6900 monthly returns vs BTC", headline: `${mh.pctGreen}% of months beat BTC`, accent: "#f7931a",
        logoHeader: { left: "spx", right: "btc", result: `${mh.pctGreen}% of months` },
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
      text: ct`📊 SPX6900 month by month: ${greens} of ${bars.length} months closed green (${pctGreen}%).
Each bar is one month's return from a 0% line. The axis floats low because the green months tower: best ${fPct(best)}, worst ${fPct(worst)}.
That lopsided shape is the up-only skew. Up months dwarf the down ones.`,
      card: { type: "mbars", spec: {
        title: "SPX6900 monthly returns", headline: `${pctGreen}% of months green`, accent: "#4ade80",
        bars,
      } },
    };
  })(),

  // 24b2 — monthly returns, two most recent years grouped by calendar month
  // (Jan '25 next to Jan '26, etc.) — a year-vs-year seasonality comparison.
  s => (() => {
    const byMonth = new Map();
    for (const [ts, p] of s.series.price) { const d = new Date(ts); if (p > 0) byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), p); }
    { const d = new Date(s.date); byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), s.price); } // live current month
    const keys = [...byMonth.keys()].sort((a, b) => a - b);
    const ret = new Map();
    for (let i = 1; i < keys.length; i++) ret.set(keys[i], byMonth.get(keys[i]) / byMonth.get(keys[i - 1]) - 1);
    const years = [...new Set([...ret.keys()].map(k => Math.floor(k / 12)))].sort((a, b) => a - b);
    if (years.length < 2) return null;
    const yOld = years.at(-2), yNew = years.at(-1);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const both = [];
    for (let m = 0; m < 12; m++) { const a = ret.get(yOld * 12 + m), b = ret.get(yNew * 12 + m); if (a != null && b != null) both.push({ m, a, b }); }
    const ahead = both.filter(o => o.b >= o.a).length;
    return {
      id: "monthcompare",
      text: ct`📊 SPX6900 month by month: ${yNew} vs ${yOld}.
The same calendar month side by side — this year against last. Through ${both.length ? MON[both.at(-1).m] : "now"}, ${yNew} leads in ${ahead} of ${both.length}.
Seasonality, not a forecast.`,
      card: { type: "monthcompare" },
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
      text: ct`🌡️ Market mood vs SPX6900's own valuation dial.
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
      text: ct`🌡️ Crypto Fear & Greed vs SPX6900's valuation risk, over its whole life. Both on a 0–100 scale.
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
      text: ct`🐕 If SPX6900 tracks Bitcoin's 4-year cycle, DOGE-size lands ≈ ${fMon(c.peakTs)}. When it flips each king:
${rungs.map(r => `${r.short} (${r.mc}) → ${r.top ? `≈ top ${fMon(c.peakTs)}` : `~${r.when}`}`).join(TIGHT)}
Where SPX meets each king's ATH cap on Bitcoin's path. A what-if, not a forecast.`,
      card: { type: "line", spec: {
        title: "When does SPX6900 flip the kings?", headline: `DOGE-size ≈ ${fMon(c.peakTs)}`, accent: doge.color,
        yLog: true, yMax: Math.max(c.peakHi, doge.price) * 2.4, yTicks: decadeTicks(s.firstPrice, c.peakHi),
        series: [
          { pts: s.series.price, color: "#4ade80", width: 3, fill: 0.1 },
          { pts: c.projPts, color: "#f7931a", width: 3, dash: true },
        ],
        hlines: rungs.map(r => ({ y: r.price, label: r.when, logo: r.short.toLowerCase(), color: r.color })),
        markers: rungs.map(r => ({ x: r.ts, y: r.y, color: r.color })),
        // no legend: green solid = SPX actual, orange dashed = BTC-cycle projection
        // reads clearly, and the legend just got crossed by the top king line.
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
      text: ct`🧮 At ${nearest.name}'s market cap, SPX6900 = ${fMult(nearest.mult)} (${fPx(nearest.spxAtCap)}). At each major's cap:
${rungs.map(m => `${m.name}-size (${fMoney(m.mc)}) → ${fPx(m.spxAtCap)} · ${fMult(m.mult)}`).join(TIGHT)}
Each line is the SPX price whose cap equals that major's today. Pure cap math, a long way up.`,
      card: { type: "line", spec: {
        title: "SPX6900 at the majors' market caps", headline: `${nearest.name}-size = ${fMult(nearest.mult)}`, accent: nearest.color,
        yLog: true, yTicks: decadeTicks(s.firstPrice, top.spxAtCap),
        // each cap-line is tagged with its coin logo at the right end (label = the multiple)
        hlines: rungs.map(m => ({ y: m.spxAtCap, label: fMult(m.mult), logo: m.name.toLowerCase(), color: m.color })),
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
      text: ct`💵 $100/mo into SPX6900 since launch = ${fUsd0(contributed)} in → ${fUsd0(cur)} today.
Buy $100 on the 1st of every month, no timing, through every crash. ${fUsd0(contributed)} in over ${months} months is now worth ${fUsd0(cur)}, a ${fMult(mult)}.
You never needed the bottom, just consistency.`,
      card: { type: "dca", spec: {
        title: "Stacking $100/mo since launch", headline: `${fUsd0(contributed)} → ${fUsd0(cur)}`, accent: "#34d399",
        // Log scale: on linear the flat "$X invested" staircase and the early years
        // compress to an unreadable sliver — log keeps the monthly adds distinct.
        invested, value, buys,
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
      text: ct`🌈 ${COWEN} BTC risk strategy, on SPX6900.
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
    const r = majorsRace(s, YEAR);
    if (!r) return null;
    // Closer reflects SPX's RANK among the majors, not just green/red — being down
    // on the year while still beating most of the field is a different story than
    // dead last, and the copy should say so.
    const closer = r.spxRank === 0
      ? "SPX6900 out front, the meme keeps outrunning the majors."
      : r.behind.length === 0
        ? (r.spxRet >= 0 ? "Green on the year, just not the leader yet." : "A rough start, no spin. Every prior dip here has been a refuel stop.")
        : `${r.spxRet >= 0 ? "Green on the year and" : "Red on the year but"} already ahead of ${r.behind.join(" & ")} — only ${r.ahead.join(" & ")} in front.`;
    return {
      id: "ytd",
      text: ct`📊 SPX6900 is ${fPct(r.spxRet)} YTD vs the majors, no spin:
${r.standings}
Everything rebased to 0% on Jan 1, a clean same-start race against BTC, ETH and SOL. ${closer}`,
      card: { type: "line", spec: {
        ...r.spec,
        title: "The YTD race: SPX6900 vs the majors", headline: `SPX6900 ${fPct(r.spxRet)} YTD`,
      } },
    };
  })(),

  // 30–32 — SPX6900 at the same age as Bitcoin / Ethereum / Solana (see ageCard).
  ...AGE_PEERS.map(ageCard),

  // 32c — "What came next": each legend aligned to the month SPX sits at now, in its own
  // first bear-cycle year (1× = today) → the year-end capitulation dip, then the next-cycle
  // top. Copy kept NEUTRAL/descriptive (owner writes the actual post text per the daily);
  // no bottom-call. Prefers DAILY peer data (stats.altHistory) so peaks are exact once the
  // CryptoCompare key is set; falls back to the bundled series until then.
  whatNextCard,

  // 29 — Kraken affiliate promo. A finished marketing graphic (public/rainbow-
  // kraken.png) posted as-is + a referral CTA. Kept OUT of the organic rotation
  // (NO_ROTATE) and surfaced on a fixed ~monthly cadence by buildPost instead, so
  // it shows up predictably without crowding the charts.
  () => ({
    id: "kraken",
    text: ct`🌈 SPX6900 × 🐙 Kraken: the affiliate program is live.
Trade $SPX on one of crypto's deepest, longest-running exchanges, and back the rainbow while you do.
Sign up with our link (referral code ${KRAKEN_CODE}) 👇${TIGHT}${KRAKEN_REF}`,
    card: { type: "kraken" },
  }),
];

export function allIds(stats) { return POSTS.map(p => p(stats)?.id).filter(Boolean); }
// Every buildable post today in ONE pass — {id, text, card}. For the control agent
// (id + hero line = a live card catalog) without 40 separate buildPost calls.
export function buildAll(stats) { return POSTS.map(p => p(stats)).filter(Boolean); }

// Upside-forward posts get extra weight in the daily rotation so the feed skews
// bullish (they show up ~twice as often as the analytical/neutral ones).
const BULLISH = new Set([
  "milestones", "memecoins", "btcgrade", "cycle", "cycleclock",
  "targets", "rally", "alltime", "dogeclock", "majorcaps", "dca",
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

// Visual "look" of each card, so the daily feed can ALTERNATE looks instead of
// spamming the same green log-scale line day after day (owner, 2026-06-29). Two
// tiers: TIER A = the line-on-log "chart" looks (rainbow/channel/target-ladder/
// rebased-race/plain-trend — they all read alike); TIER B = the visually distinct
// "flavour" cards (heatmaps, bars, dial, donut, cube, scatter, colour/dual-axis
// charts). The rotation interleaves A and B (chart → flavour → chart …) and, within
// each tier, spreads families so consecutive same-tier days still differ in look.
const LOOK = {
  // — Tier A: the green log-line family (visually similar; spread them out) —
  valuation: "rainbow", channel: "channel",
  targets: "ladder", memecoins: "ladder", btcgrade: "ladder", dogeclock: "ladder", majorcaps: "ladder",
  spxvssp: "race", majors: "race", ytd: "race", sp500ytd: "race", sp500roll12: "race", btc: "race", chainrace: "race",
  roadmap: "trend", rally: "trend", alltime: "trend", breakeven: "trend", diamondtrend: "trend",
  cycleclock: "trend", fngtrend: "trend", btcage: "trend", ethage: "trend", solage: "trend",
  whatnext: "race",
  // — Tier B: flavourful / distinct looks (used to break up the green lines) —
  riskcolor: "colorline", risklevels: "colorline", rsidots: "colorline",
  riskheat: "dual", runningroi: "dual", cycle: "dual", longshort: "dual", underwater: "dual", goldencross: "dual", holdergrowth: "dual", holdersprice: "dual", mvrvbtc: "dual", mvrvtrend: "dual", supplyprofit: "dual", concentration: "dual", picycle: "dual",
  firesalerally: "fanlines",
  model: "scatter",
  monthlyreturns: "heatmap", monthlyreturnssp: "heatmap", monthlyreturnsbtc: "heatmap",
  hodlwaves: "stack", walletgrowth: "stack", amicheap: "gauges",
  timeinband: "bars", monthlybars: "bars", monthcompare: "bars", multichain: "bars",
  fngdial: "round", distribution: "round",
  marketcap: "blocks", milestones: "blocks", sp500: "blocks",
  dca: "dca",
};
const A_FAMILIES = new Set(["rainbow", "channel", "ladder", "race", "trend"]);
const lookOf = id => LOOK[id] || "trend"; // unknown line cards default to the green bucket

// Order a set of posts (expanded by weight) so each visual family is spread EVENLY
// across the sequence — deficit round-robin: every family gets a stride =
// total/copies and a running "due" position; each slot takes the most-overdue
// eligible family (smallest due) that isn't the previous one, then advances its due
// by a stride. This spaces low-count high-value cards (e.g. the flagship rainbow)
// just as evenly as the big families, while never repeating a family back-to-back
// when avoidable. Within a family, round-robin the distinct cards. Deterministic.
function spreadByFamily(posts) {
  const fams = new Map(); const order = [];
  for (const p of posts) {
    const f = lookOf(p.id);
    if (!fams.has(f)) { fams.set(f, { cards: [], count: 0 }); order.push(f); }
    const g = fams.get(f); const w = weightOf(p.id);
    g.cards.push({ post: p, count: w }); g.count += w;
  }
  const total = [...fams.values()].reduce((s, g) => s + g.count, 0);
  const st = new Map([...fams].map(([f, g]) => [f, { remaining: g.count, stride: total / g.count, due: (total / g.count) / 2, ptr: 0 }]));
  const out = []; let last = null;
  for (let n = 0; n < total; n++) {
    let elig = order.filter(f => st.get(f).remaining > 0 && f !== last);
    if (!elig.length) elig = order.filter(f => st.get(f).remaining > 0);
    let best = elig[0];
    for (const f of elig) if (st.get(f).due < st.get(best).due) best = f;
    const s = st.get(best), arr = fams.get(best).cards;
    let idx = s.ptr, guard = 0;
    while (arr[idx % arr.length].count === 0 && guard < arr.length) { idx++; guard++; }
    idx %= arr.length;
    arr[idx].count--; s.remaining--; s.ptr = idx + 1; s.due += s.stride;
    out.push(arr[idx].post); last = best;
  }
  return out;
}

// Merge two ordered lists so the shorter (B) is spread EVENLY through the longer
// (A) — Bresenham-style, starting on A — so a flavour card breaks up the green
// charts as often as the counts allow (runs of A stay short).
function interleave(A, B) {
  const out = []; let i = 0, j = 0; const a = A.length, b = B.length;
  while (i < a || j < b) {
    if (j >= b) out.push(A[i++]);
    else if (i >= a) out.push(B[j++]);
    else if ((j + 1) * a <= (i + 1) * b) out.push(B[j++]);
    else out.push(A[i++]);
  }
  return out;
}

// Build the rotation: split the pool into the two look-tiers, spread each tier so
// its own families don't clump, then interleave so the feed alternates chart →
// flavour → chart. Length = sum of weights (unchanged), so the per-day index still
// cycles through everything; higher-weight topics still recur more often.
function rotation(built) {
  const pool = built.filter(p => !NO_ROTATE.has(p.id));
  const A = spreadByFamily(pool.filter(p => A_FAMILIES.has(lookOf(p.id))));
  const B = spreadByFamily(pool.filter(p => !A_FAMILIES.has(lookOf(p.id))));
  return interleave(A, B);
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
  // Register every editable (ct``) card so the control panel lists them all, even
  // the ones not posting today. (copy() cards self-register when their fn runs.)
  for (const b of built) if (isCopyMarker(b.text)) registerCopy(b.id, b.text);
  const epochDay = Math.floor(now.getTime() / 86400000);
  // An explicit override (env BOT_POST / --post= / the OG endpoint) wins. Else a
  // fixed-cadence promo (Kraken) claims its day; otherwise the organic rotation.
  const promo = built.find(p => p.id === "kraken");
  const rota = rotation(built);
  const chosen = (overrideId && built.find(p => p.id === overrideId))
    || (promo && epochDay % KRAKEN_EVERY === 0 && promo)
    || rota[epochDay % rota.length];
  // Resolve a ct`` marker (apply owner override) just for the chosen post.
  const text = isCopyMarker(chosen.text) ? bindCopy(chosen.id, chosen.text) : chosen.text;
  return { ...chosen, text: withFooter(text) };
}

// The marquee bands worth interrupting the feed for, split into two tiers by how
// they're delivered:
//   • EXTREME (Fire Sale / Max Bubble): historic, once-in-a-cycle prints — fired
//     promptly by the hourly watcher (with anti-spike confirmation) so a genuine
//     extreme isn't delayed a day.
//   • DAILY (BUY / SELL): meaningful but less urgent — announced from the next
//     DAILY post slot when the daily CLOSE settles in the band (close-confirmed,
//     no intraday-wick fires, no extra post → no rainbow fatigue).
// MARQUEE_BANDS (the union) is the calm/re-arm boundary for both tiers: price
// must return to the calm middle (a non-marquee band) to re-arm either tier.
export const EXTREME_BANDS = new Set([0, 8]);       // Fire Sale, Max Bubble
export const DAILY_BANDS = new Set([1, 7]);         // BUY, SELL
export const MARQUEE_BANDS = new Set([0, 1, 7, 8]); // union — the calm boundary

export const BAND_COOLDOWN_MS = 6 * 3600 * 1000; // min gap between band-change posts

// Anti-spike confirmation: a band different from the last CONFIRMED one must be
// observed this many hourly checks IN A ROW before it counts as a real crossing.
// A transient wick that spikes across a boundary for one check then reverts never
// reaches the count, so it can't fire. Trade-off: a genuine crossing posts a few
// hours late, which is fine for these rare events.
export const BAND_CONFIRM_READINGS = 3;

// Pure confirmation step for the band watcher (testable). Given the current band
// `bi` and the persisted `state` (with the last confirmed `band` + a running
// `pendingBand`/`pendingCount`), returns the updated pending counters and whether
// the crossing is now confirmed. Parking back on the confirmed band clears the
// excursion. Used by band-watch.mjs ahead of bandPostDecision.
export function confirmBandCrossing({ bi, state, readings = BAND_CONFIRM_READINGS }) {
  if (!state || bi === state.band) return { pendingBand: null, pendingCount: 0, confirmed: false };
  const pendingCount = (state.pendingBand === bi ? (state.pendingCount || 0) : 0) + 1;
  return { pendingBand: bi, pendingCount, confirmed: pendingCount >= readings };
}

// Pure decision for the hourly EXTREME watcher (Fire Sale / Max Bubble only),
// factored out so the guardrails are testable. Gates on top of "confirmed
// crossing into an extreme band":
//   • hysteresis (`armed`): fire only once per EXCURSION out of the calm middle —
//     price must return to a calm (non-marquee) band to re-arm, so oscillating
//     between marquee bands can't keep firing;
//   • cooldown: a minimum gap since the last real post;
//   • daily suppression: if anything already posted today, stay quiet.
// Returns the derived flags plus the `armed` value to carry into the next state.
export function bandPostDecision({ bi, state, dailyPostedToday = false, now = Date.now(), cooldownMs = BAND_COOLDOWN_MS }) {
  const calm = !MARQUEE_BANDS.has(bi);                    // calm middle re-arms both tiers
  const armed = calm ? true : (state?.armed ?? true);     // default armed for legacy state
  const extreme = EXTREME_BANDS.has(bi);                  // hourly only fires the extremes
  const changed = !state || bi !== state.band;
  const cooled = !state?.lastPostTs || now - Date.parse(state.lastPostTs) >= cooldownMs;
  const shouldPost = changed && extreme && armed && cooled && !dailyPostedToday;
  return { calm, armed, extreme, changed, cooled, shouldPost };
}

// Pure decision for the DAILY-slot band announcement (BUY / SELL). Confirmation
// is a settled daily CLOSE in the band (`closeBand`), AND the live price still
// sitting there at post time (`liveBand`) — so a wick that closed in the band but
// has since reverted doesn't fire. Same calm-middle re-arm hysteresis as the
// extreme tier. `state` = { band, armed } from daily-band-state.json.
export function dailyBandEvent({ closeBand, liveBand, state }) {
  const calm = !MARQUEE_BANDS.has(closeBand);
  const armed = calm ? true : (state?.armed ?? true);
  const changed = !state || closeBand !== state.band;
  const announce = changed && DAILY_BANDS.has(closeBand) && armed && liveBand === closeBand;
  return { announce, calm, changed, armed };
}

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
