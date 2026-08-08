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
import { CITY_COHORTS as COHORTS, cityCohortIndex as cohortIndex, CITY_FLOOR as FLOOR } from "../src/whale-cohorts.js";

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

const meta = (rows, res) => ({
  updated: new Date().toISOString().slice(0, 10), res, floor: FLOOR,
  week0: rows[0]?.[0] ?? null, n: rows.length,
  labels: COHORTS.map(c => c.label), colors: COHORTS.map(c => c.accent), rows,
});
const round = (rows) => rows.map(r => [r[0], +r[1].toPrecision(6),
  ...r.slice(2, 2 + NC), ...r.slice(2 + NC).map(v => Math.round(v))]);

const HOLD_WK = 13;   // ~90 days — SPX City's residency rule is "≥5,000 held 90 days".

// WEEKLY — from the committed city timeline × the price feed (offline-runnable; exported for the test).
// A citizen at week wk = balance ≥ FLOOR AND the wallet hasn't gone to zero in the trailing 13 weeks
// (≈90 days), clamped to the token's age in the early weeks (you can't hold longer than it has
// existed). This approximates the live city's per-lot residency, so the count reconciles closely.
export function cityHistory(tl, prices) {
  const n = tl.n, week0 = Date.parse(tl.week0), priceAt = priceLookup(prices);
  const counts = Array.from({ length: n }, () => new Array(NC).fill(0));
  const toks = Array.from({ length: n }, () => new Array(NC).fill(0));
  for (const w of tl.wallets) {
    let peak = 0; for (const pt of w.p) if (pt[1] > peak) peak = pt[1];
    if (peak < FLOOR) continue;                          // never reached the residency floor
    let pi = 0, bal = 0, streak = 0;                     // streak = consecutive non-zero weeks (since last zero)
    for (let wk = 0; wk < n; wk++) {
      while (pi < w.p.length && w.p[pi][0] <= wk) bal = w.p[pi++][1];
      streak = bal > 0 ? streak + 1 : 0;
      if (bal >= FLOOR && streak >= Math.min(HOLD_WK, wk + 1)) {
        const ci = cohortIndex(bal);
        if (ci >= 0) { counts[wk][ci]++; toks[wk][ci] += bal; }
      }
    }
  }
  const rows = counts.map((c, wk) => {
    const date = dayOf(week0 + wk * 7 * DAY), price = priceAt(Date.parse(date));
    return [date, price, ...c, ...toks[wk].map(t => t * price)];
  });
  return meta(round(rows), "weekly");
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

  const out = [];
  const snap = (d) => {
    const dT = Date.parse(d), price = priceAt(dT), need = Math.min(HOLD_MS, dT - launchT);
    const counts = new Array(NC).fill(0), toks = new Array(NC).fill(0);
    for (const a of eligible) {
      if (dT - (heldSince.get(a) ?? dT) < need) continue; // not held long enough yet
      const b = bal.get(a), ci = cohortIndex(b);
      if (ci >= 0) { counts[ci]++; toks[ci] += b; }
    }
    out.push([d, price, ...counts, ...toks.map(t => t * price)]);
  };
  let curDay = null, curT = 0;
  const flushTo = (nextDay) => { snap(curDay); for (let t = curT + DAY; dayOf(t) < nextDay; t += DAY) snap(dayOf(t)); };
  for (const r of rows) {
    const d = dayOf(r.t);
    if (curDay === null) { curDay = d; curT = Date.parse(curDay); }
    else if (d !== curDay) { const nd = Date.parse(d); flushTo(d); curDay = d; curT = nd; }
    touch(r.from, -r.qty, r.t); touch(r.to, r.qty, r.t);
  }
  if (curDay !== null) snap(curDay);
  console.error(`city-history[daily]: ${rows.length} transfers → ${out.length} days`);
  return meta(round(out), "daily");
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
