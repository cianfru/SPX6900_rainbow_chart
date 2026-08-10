// ============================================================================
// CITY HISTORY — how the whale city grew: INHABITANTS + TVL over time
// ============================================================================
//   LOCAL (WEEKLY, from the committed timeline + price history — seeds a chart that renders now):
//     node scripts/build-city-history.mjs --timeline=public/spx-timeline.json \
//        --prices=public/price-history.json --out=public/city-history.json
//   CI (DAILY, from the raw archive the on-chain pipeline already downloads):
//     node scripts/build-city-history.mjs --transfers=transfers.csv \
//        --prices=public/price-history.json --out=public/city-history.json
//
// The "city" = SPX City = every wallet ≥ 5,000 SPX (its residency floor), sliced into the six size
// cohorts from src/whale-cohorts.js (CITY_COHORTS; the top four nest the whale bands exactly). On top
// of the citizen count we add TVL = Σ(balance × SPX price on that date), per cohort, so one file powers
// both the "citizens grew" and the "value grew" reads. Each row is
// [date, price, c0..c5 (counts), v0..v5 (TVL USD)].
//
// Honesty caveats (stated on the chart): a wallet is binned by its balance THAT period and migrates
// cohorts as it grows/shrinks; infra (CEX/LP/bridge/burn) is excluded; ETH-native only (Base/Solana
// have no per-wallet history yet); the live snapshot counts a touch fewer via finer per-lot ages.
// ============================================================================
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EXCLUDE } from "./build-onchain-local.mjs";
import { parseTime } from "./build-city-timeline.mjs";
import { CITY_COHORTS as COHORTS, cityCohortIndex as cohortIndex, CITY_FLOOR as FLOOR, heightUnit } from "../src/whale-cohorts.js";

// ── Building archetypes over time ─────────────────────────────────────────────────────────────────
// Reconstruct the SAME building type the 3D city assigns each wallet, so a chart matches the towers
// people see. A building's height = holding × how long it's held, RELATIVE to the biggest that period:
//   score  = (bal/maxBal) × (0.45 + 0.55 × days/maxDays)      ← mirrors SpxCity.jsx
//   height = HMIN + (HMAX-HMIN) × heightUnit(score, minScore, maxScore)  ← heightUnit ≡ city-render heightOf
//   tier by height: ≥11 glass tower · ≥6 concrete mid-rise · ≥3.5 masonry · else low-rise  ← city-render archetype()
// ⚠ Keep HMIN/HMAX (Skyline3D.jsx) + the 11/6/3.5 cut-offs (city-render.js archetype) in sync with those files.
const HMIN = 1.0, HMAX = 21;
const SKY_TIERS = [
  { key: "tower", label: "Glass tower", min: 11, colour: "#38bdf8" },
  { key: "midrise", label: "Concrete mid-rise", min: 6, colour: "#9aa0a8" },
  { key: "masonry", label: "Masonry", min: 3.5, colour: "#c2764f" },
  { key: "lowrise", label: "Low-rise", min: 0, colour: "#7c4a37" },
];
const tierIdx = h => { for (let i = 0; i < SKY_TIERS.length; i++) if (h >= SKY_TIERS[i].min) return i; return SKY_TIERS.length - 1; };
// res = [{bal, days}] residents that period → [tower, midrise, masonry, lowrise] counts
function skylineAt(res) {
  const c = [0, 0, 0, 0];
  if (!res.length) return c;
  let maxBal = 1, maxDays = 1;
  for (const r of res) { if (r.bal > maxBal) maxBal = r.bal; if (r.days > maxDays) maxDays = r.days; }
  let minS = Infinity, maxS = -Infinity;
  const scored = res.map(r => { const s = (r.bal / maxBal) * (0.45 + 0.55 * (r.days / maxDays)); if (s < minS) minS = s; if (s > maxS) maxS = s; return s; });
  for (const s of scored) c[tierIdx(HMIN + (HMAX - HMIN) * heightUnit(s, minS, maxS))]++;
  return c;
}
const skyMeta = { skylineLabels: SKY_TIERS.map(t => t.label), skylineColors: SKY_TIERS.map(t => t.colour) };

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;
const ZERO = "0x0000000000000000000000000000000000000000";
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const NC = COHORTS.length;

// Price lookup: last close at or before `date`, else the earliest close (early weeks predate the feed).
export function priceLookup(prices) {
  const pts = (Array.isArray(prices) ? prices : prices.points || prices.prices || [])
    .map(p => ({ t: Date.parse(p.date || p.d || p[0]), price: +(p.price ?? p.p ?? p[1]) }))
    .filter(p => Number.isFinite(p.t) && p.price > 0).sort((a, b) => a.t - b.t);
  return (t) => {
    if (!pts.length) return 0;
    let lo = 0, hi = pts.length - 1, ans = pts[0].price;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m].t <= t) { ans = pts[m].price; lo = m + 1; } else hi = m - 1; }
    return ans;
  };
}

const meta = (rows, res, extra = {}) => ({
  updated: new Date().toISOString().slice(0, 10), res, floor: FLOOR,
  week0: rows[0]?.[0] ?? null, n: rows.length,
  labels: COHORTS.map(c => c.label), colors: COHORTS.map(c => c.accent), rows, ...extra,
});
const round = (rows) => rows.map(r => [r[0], +r[1].toPrecision(6),
  ...r.slice(2, 2 + NC), ...r.slice(2 + NC).map(v => Math.round(v))]);

const HOLD_WK = 13;   // ~90 days — SPX City's residency rule is "≥5,000 held 90 days".

// WEEKLY — from the committed city timeline × the price feed (offline-runnable; exported for the test).
// A citizen at week wk = balance ≥ FLOOR AND the wallet hasn't gone to zero in the trailing 13 weeks
// (≈90 days), clamped to the token's age in the early weeks (you can't hold longer than it has
// existed). This approximates the live city's per-lot residency, so the count reconciles closely.
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quarterOf = ms => { const d = new Date(ms); return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };

export function cityHistory(tl, prices) {
  const n = tl.n, week0 = Date.parse(tl.week0), priceAt = priceLookup(prices);
  const counts = Array.from({ length: n }, () => new Array(NC).fill(0));
  const toks = Array.from({ length: n }, () => new Array(NC).fill(0));
  const arrivals = new Array(n).fill(0), departures = new Array(n).fill(0), foundersAlive = new Array(n).fill(0);
  const weekBals = Array.from({ length: n }, () => []); // resident balances per week (for the median)
  const weekRes = Array.from({ length: n }, () => []);  // resident {bal, days} per week (for the skyline)
  const vint = new Map();                               // arrival quarter → {arrived, stillHere}
  const dateOf = wk => dayOf(week0 + wk * 7 * DAY);
  for (const w of tl.wallets) {
    let peak = 0; for (const pt of w.p) if (pt[1] > peak) peak = pt[1];
    if (peak < FLOOR) continue;                          // never reached the residency floor
    let pi = 0, bal = 0, streak = 0, prevRes = false, founder = false, firstResWk = -1, lastRes = false;
    for (let wk = 0; wk < n; wk++) {
      while (pi < w.p.length && w.p[pi][0] <= wk) bal = w.p[pi++][1];
      streak = bal > 0 ? streak + 1 : 0;
      const res = bal >= FLOOR && streak >= Math.min(HOLD_WK, wk + 1);
      if (res) { const ci = cohortIndex(bal); if (ci >= 0) { counts[wk][ci]++; toks[wk][ci] += bal; weekBals[wk].push(bal); weekRes[wk].push({ bal, days: streak * 7 }); } if (firstResWk < 0) firstResWk = wk; }
      if (res && !prevRes) arrivals[wk]++;               // crossed into residency this week
      if (!res && prevRes) departures[wk]++;             // dropped out of residency this week
      if (wk === 0) founder = res;                       // a "founder" was a resident in the launch week
      if (founder && res) foundersAlive[wk]++;           // …still here now
      prevRes = res; lastRes = res;                      // lastRes holds residency at the final week
    }
    if (firstResWk >= 0) {                               // tally this wallet into its arrival vintage
      const q = quarterOf(week0 + firstResWk * 7 * DAY), v = vint.get(q) || { arrived: 0, stillHere: 0 };
      v.arrived++; if (lastRes) v.stillHere++; vint.set(q, v);
    }
  }
  const rows = counts.map((c, wk) => {
    const date = dateOf(wk), price = priceAt(Date.parse(date));
    return [date, price, ...c, ...toks[wk].map(t => t * price)];
  });
  const flow = arrivals.map((a, wk) => [dateOf(wk), a, departures[wk]]);
  const founders = { n0: foundersAlive[0], series: foundersAlive.map((v, wk) => [dateOf(wk), v]) };
  const perCapita = weekBals.map((a, wk) => [dateOf(wk), Math.round(median(a))]); // median resident holding (tokens)
  const skyline = weekRes.map((res, wk) => [dateOf(wk), ...skylineAt(res)]);       // building types (glass/concrete/masonry/low-rise)
  const vintages = [...vint.entries()].map(([label, v]) => ({ label, arrived: v.arrived, stillHere: v.stillHere, pct: v.arrived ? +(v.stillHere / v.arrived * 100).toFixed(1) : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return meta(round(rows), "weekly", { flow, founders, perCapita, vintages, skyline, ...skyMeta });
}

// DAILY — stream the raw transfer archive; keep a running per-wallet balance + when each wallet last
// became non-zero ("held since"), and snapshot the residents each day. A resident = balance ≥ FLOOR AND
// held (never zeroed) for ≥90 days, clamped to the token's age. Residency can change purely from time
// passing (a wallet graduates at 90 days), so each daily snapshot recomputes over the eligible set
// (wallets currently ≥ FLOOR — a few thousand, so cheap even across ~1,100 days).
const HOLD_MS = 90 * DAY;
export async function fromTransfers(src, prices) {
  const priceAt = priceLookup(prices);
  const rows = []; let head = null;
  const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!head) { head = line; continue; }
    if (!line) continue;
    const c = line.split(",");                            // sender,receiver,time,value (8-decimal raw)
    const t = parseTime(c[2]), qty = Number(c[3]) / 1e8;
    if (!Number.isFinite(t) || !(qty > 0)) continue;
    rows.push({ from: (c[0] || "").toLowerCase(), to: (c[1] || "").toLowerCase(), t, qty });
  }
  rows.sort((a, b) => a.t - b.t);
  const launchT = rows.length ? rows[0].t : 0;

  const bal = new Map(), heldSince = new Map(), eligible = new Set();
  const touch = (a, d, t) => {
    if (!a || a === ZERO || EXCLUDE.has(a)) return;
    const ob = bal.get(a) || 0, nb = Math.max(0, ob + d); bal.set(a, nb);
    if (ob <= 0 && nb > 0) heldSince.set(a, t);           // 0 → positive: (re)start the holding clock
    if (nb <= 0) heldSince.delete(a);
    if (nb >= FLOOR) eligible.add(a); else eligible.delete(a);
  };

  const out = [], flow = [], perCapita = [], skyline = [];
  let prev = new Set(), founders = null, lastCur = new Set();   // founders = the resident set on the first snapshot
  const firstRes = new Map();                             // wallet → day it first became a resident (for vintages)
  const snap = (d) => {
    const dT = Date.parse(d), price = priceAt(dT), need = Math.min(HOLD_MS, dT - launchT);
    const counts = new Array(NC).fill(0), toks = new Array(NC).fill(0), cur = new Set(), resBals = [], resArch = [];
    for (const a of eligible) {
      const hs = heldSince.get(a) ?? dT;
      if (dT - hs < need) continue;                       // not held long enough yet
      const b = bal.get(a), ci = cohortIndex(b);
      if (ci >= 0) { counts[ci]++; toks[ci] += b; cur.add(a); resBals.push(b); resArch.push({ bal: b, days: (dT - hs) / DAY }); if (!firstRes.has(a)) firstRes.set(a, dT); }
    }
    if (!founders) founders = new Set(cur);
    let arr = 0, dep = 0, fAlive = 0;
    for (const a of cur) if (!prev.has(a)) arr++;
    for (const a of prev) if (!cur.has(a)) dep++;
    for (const a of founders) if (cur.has(a)) fAlive++;
    out.push([d, price, ...counts, ...toks.map(t => t * price)]);
    flow.push([d, arr, dep, fAlive]);
    perCapita.push([d, Math.round(median(resBals))]);
    skyline.push([d, ...skylineAt(resArch)]);
    prev = cur; lastCur = cur;
  };
  let curDay = null, curT = 0;
  const flushTo = (nextDay) => { snap(curDay); for (let t = curT + DAY; dayOf(t) < nextDay; t += DAY) snap(dayOf(t)); };
  // Replay ONE BLOCK (same timestamp) at a time, applying every RECEIVE before every SEND — the SAME
  // rule the FIFO engine (build-onchain-local.mjs) uses. block_timestamp is per-block with no intra-block
  // order, so a send processed before its same-block receive hits an empty balance, the Math.max(0,…)
  // clamp drops the debit, and the wallet keeps a phantom balance — which inflated the citizen count
  // (~5.7k vs the live city's ~4.85k). Receives-first fixes it without an ordering column.
  for (let i = 0; i < rows.length;) {
    const t0 = rows[i].t, d = dayOf(t0);
    if (curDay === null) { curDay = d; curT = Date.parse(curDay); }
    else if (d !== curDay) { const nd = Date.parse(d); flushTo(d); curDay = d; curT = nd; }
    let j = i; while (j < rows.length && rows[j].t === t0) j++;
    for (let k = i; k < j; k++) touch(rows[k].to, rows[k].qty, t0);      // credits first
    for (let k = i; k < j; k++) touch(rows[k].from, -rows[k].qty, t0);   // then debits
    i = j;
  }
  if (curDay !== null) snap(curDay);
  console.error(`city-history[daily]: ${rows.length} transfers → ${out.length} days`);
  const n0 = flow[0]?.[3] ?? 0;
  const vint = new Map();                                 // arrival quarter → {arrived, stillHere}
  for (const [a, dT] of firstRes) {
    const q = quarterOf(dT), v = vint.get(q) || { arrived: 0, stillHere: 0 };
    v.arrived++; if (lastCur.has(a)) v.stillHere++; vint.set(q, v);
  }
  const vintages = [...vint.entries()].map(([label, v]) => ({ label, arrived: v.arrived, stillHere: v.stillHere, pct: v.arrived ? +(v.stillHere / v.arrived * 100).toFixed(1) : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return meta(round(out), "daily", {
    flow: flow.map(f => [f[0], f[1], f[2]]),
    founders: { n0, series: flow.map(f => [f[0], f[3]]) },
    perCapita, vintages, skyline, ...skyMeta,
  });
}

async function main() {
  const transfers = arg("transfers"), timeline = arg("timeline") || arg("in");
  const prices = JSON.parse(readFileSync(arg("prices") || "public/price-history.json", "utf8"));
  const out = arg("out") || "public/city-history.json";
  if (!transfers && !timeline) { console.error("usage: --transfers=archive.csv | --timeline=spx-timeline.json  --prices=…  --out=…"); process.exit(1); }
  const o = transfers ? await fromTransfers(transfers, prices) : cityHistory(JSON.parse(readFileSync(timeline, "utf8")), prices);
  writeFileSync(out, JSON.stringify(o));
  const tot = (r, o = 0) => r.slice(2 + o * NC, 2 + o * NC + NC).reduce((s, v) => s + v, 0);
  const first = o.rows[0], last = o.rows.at(-1);
  console.log(`city-history[${o.res}]: ${o.n} points · ${first[0]} ${tot(first)} citizens $${(tot(first, 1) / 1e6).toFixed(1)}M ` +
    `→ ${last[0]} ${tot(last)} citizens $${(tot(last, 1) / 1e6).toFixed(1)}M`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main().catch(e => { console.error(e); process.exit(1); });
