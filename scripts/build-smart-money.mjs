// ============================================================================
// SMART MONEY — the live cohort of proven top-timers, aggregated (no wallet named)
// ============================================================================
//   CI (DAILY, from the raw archive — the north star: real per-transfer timestamps):
//     node scripts/build-smart-money.mjs --transfers=transfers.csv --prices=public/price-history.json --out=public/smart-money.json
//   LOCAL (WEEKLY, from the committed timeline — validation + seed):
//     node scripts/build-smart-money.mjs --in=public/spx-timeline.json --prices=public/price-history.json --out=public/smart-money.json
//
// A "Live Smart Money" desk, RECOMPUTED every run so it is never a frozen list. A wallet qualifies iff
// it (1) deployed real capital (≥ $25k of buys), (2) realized ROI ≥ 5× — proved timing by actually
// SELLING at a profit, not paper gains — and (3) still holds a meaningful bag (≥ 50k SPX). Dumps-to-
// zero drop out; new proven+live winners join on their own (the cohort grows in run-ups as people sell
// tops). ROI = realized ÷ capital deployed, so a whale that nets big $ on a mediocre % is excluded.
//
// We publish ONLY the AGGREGATE — total held over time + net-flow — never a wallet address, so there is
// nothing to follow. The net-flow flips green the week the proven timers start buying again. We also
// emit NEW QUALIFIERS per period: the count of wallets that first crossed the ROI+capital bar — a spike
// = many wallets minting themselves by selling tops = distribution starting.
//
// Honest limits (stated on every surface): qualification needs a REALIZED sell, so a wallet quietly
// accumulating the bottom is invisible until it sells; average-cost accounting (not FIFO); on-chain has
// no identity, so a proven operator moving to a fresh wallet resets.
// ============================================================================
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EXCLUDE } from "./build-onchain-local.mjs";
import { parseTime, balanceAt } from "./build-city-timeline.mjs";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5, ZERO = "0x0000000000000000000000000000000000000000";
const MIN_INVESTED = 25000, MIN_ROI = 5, MIN_HOLD = 50000;
const dayStr = (t) => new Date(t).toISOString().slice(0, 10);

function mkPriceAt(prices) {
  const px = (Array.isArray(prices) ? prices : []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  return (t) => { if (!px.length) return 0; let b = px[0].p; for (const r of px) { if (r.t <= t) b = r.p; else break; } return b; };
}

// assemble the output object from an already-built series + cohort facts
function assemble({ res, criteria, rois, realizedTotal, series, newQ, priceNow, updated }) {
  const N = series.length, held = series.map(s => s[1]);
  const heldNow = held.length ? held[N - 1] : 0;
  const back = (kWeeks) => { const rb = res === "daily" ? kWeeks * 7 : kWeeks; const past = held[Math.max(0, N - 1 - rb)]; return past > 0 ? +(100 * (heldNow - past) / past).toFixed(1) : 0; };
  const sorted = rois.slice().sort((a, b) => a - b);
  let peak = 0, pi = 0; held.forEach((h, i) => { if (h > peak) { peak = h; pi = i; } });
  // new qualifiers in the trailing 90 days
  const lastT = series.length ? Date.parse(series[N - 1][0]) : 0;
  const newQ90 = newQ.filter(([d]) => Date.parse(d) >= lastT - 90 * DAY).reduce((s, x) => s + x[1], 0);
  return {
    updated, res, criteria,
    cohortSize: rois.length,
    heldNow: Math.round(heldNow), heldUsd: Math.round(heldNow * priceNow),
    realizedTotal: Math.round(realizedTotal), medianRoi: rois.length ? +sorted[sorted.length >> 1].toFixed(1) : 0,
    price: +priceNow.toFixed(6),
    peak: Math.round(peak), peakDate: series.length ? series[pi][0] : null, peakPrice: series.length ? series[pi][3] : 0,
    flow: { w4: back(4), w12: back(12), w26: back(26) },
    newQual90: newQ90,
    weeks: series.map(s => [s[0], Math.round(s[1]), Math.round(s[2]), s[3]]),
    newQualifiers: newQ,
  };
}

// ---- WEEKLY, from the committed city timeline (validation + seed) ----
export function smartMoney(tl, prices, opts = {}) {
  const minInv = opts.minInvested ?? MIN_INVESTED, minRoi = opts.minRoi ?? MIN_ROI, minHold = opts.minHold ?? MIN_HOLD;
  const week0 = Date.parse(tl.week0), N = tl.n, W = N - 1;
  const priceAt = mkPriceAt(prices), wkT = (wk) => week0 + wk * 7 * DAY, pAtWk = (wk) => priceAt(wkT(wk));

  const cohort = [], rois = []; let realizedTotal = 0;
  const qualByWk = new Array(N).fill(0);
  for (const w of tl.wallets) {
    let pos = 0, avg = 0, realized = 0, spent = 0, prev = 0, qWk = -1;
    for (const [wk, bal] of w.p) {
      const d = bal - prev, pr = pAtWk(wk);
      if (d > 0) { avg = (avg * pos + d * pr) / (pos + d); pos += d; spent += d * pr; }
      else if (d < 0) { realized += (-d) * (pr - avg); pos += d; }
      if (qWk < 0 && spent >= minInv && realized > 0 && realized / spent >= minRoi) qWk = wk;
      prev = bal;
    }
    if (qWk >= 0 && qWk < N) qualByWk[qWk]++;      // "minted" (crossed the bar) — counts even if it later left
    const now = balanceAt(w.p, W), roi = spent > 0 ? realized / spent : 0;
    if (spent >= minInv && roi >= minRoi && realized > 0 && now >= minHold) { cohort.push(w); rois.push(roi); realizedTotal += realized; }
  }
  const held = new Array(N).fill(0);
  for (const w of cohort) for (let wk = 0; wk < N; wk++) held[wk] += balanceAt(w.p, wk);
  const series = [];
  for (let wk = 0; wk < N; wk++) series.push([dayStr(wkT(wk)), held[wk], wk ? held[wk] - held[wk - 1] : 0, +pAtWk(wk).toFixed(6)]);
  const newQ = qualByWk.map((c, wk) => [dayStr(wkT(wk)), c]).filter(([, c]) => c > 0);
  return assemble({ res: "weekly", criteria: { minInvested: minInv, minRoi, minHold }, rois, realizedTotal, series, newQ, priceNow: pAtWk(W), updated: tl.updated });
}

// ---- DAILY, from the raw transfer archive (the north star) ----
export function smartMoneyDaily(rows, prices, opts = {}) {
  const minInv = opts.minInvested ?? MIN_INVESTED, minRoi = opts.minRoi ?? MIN_ROI, minHold = opts.minHold ?? MIN_HOLD;
  const priceAt = mkPriceAt(prices);
  rows.sort((a, b) => a.t - b.t);

  // pass 1: average-cost accounting per wallet + first-qualified timestamp
  const A = new Map();
  const qualByDay = new Map();
  const touch = (addr, d, t) => {
    if (!addr || addr === ZERO || EXCLUDE.has(addr)) return;
    let a = A.get(addr); if (!a) { a = { pos: 0, avg: 0, realized: 0, spent: 0, q: false }; A.set(addr, a); }
    const pr = priceAt(t);
    if (d > 0) { a.avg = (a.avg * a.pos + d * pr) / (a.pos + d); a.pos += d; a.spent += d * pr; }
    else { const q = Math.min(-d, a.pos); a.realized += q * (pr - a.avg); a.pos = Math.max(0, a.pos + d); }
    if (!a.q && a.spent >= minInv && a.realized > 0 && a.realized / a.spent >= minRoi) { a.q = true; const k = dayStr(t); qualByDay.set(k, (qualByDay.get(k) || 0) + 1); }
  };
  for (const r of rows) { touch(r.from, -r.qty, r.t); touch(r.to, r.qty, r.t); }

  // qualify the LIVE cohort
  const cohort = new Set(), rois = []; let realizedTotal = 0;
  for (const [addr, a] of A) { const roi = a.spent > 0 ? a.realized / a.spent : 0; if (a.spent >= minInv && roi >= minRoi && a.realized > 0 && a.pos >= minHold) { cohort.add(addr); rois.push(roi); realizedTotal += a.realized; } }

  // pass 2: cohort aggregate balance forward through time → end-of-day snapshots
  const bal = new Map([...cohort].map(a => [a, 0]));
  let agg = 0; const byDay = new Map();
  const move = (addr, d) => { if (!cohort.has(addr)) return; const b = bal.get(addr), nb = Math.max(0, b + d); agg += nb - b; bal.set(addr, nb); };
  for (const r of rows) { move(r.from, -r.qty); move(r.to, r.qty); byDay.set(dayStr(r.t), agg); }

  // daily grid, forward-filled, launch → today
  const t0 = Date.parse(dayStr(rows.length ? rows[0].t : Date.now()));
  const tEnd = Date.parse(dayStr(Math.max(rows.length ? rows.at(-1).t : 0, Date.now())));
  const series = []; let lastHeld = 0, prevHeld = 0;
  for (let t = t0; t <= tEnd; t += DAY) { const k = dayStr(t); if (byDay.has(k)) lastHeld = byDay.get(k); series.push([k, lastHeld, lastHeld - prevHeld, +priceAt(t).toFixed(6)]); prevHeld = lastHeld; }
  const newQ = [...qualByDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([d, c]) => [d, c]);
  return assemble({ res: "daily", criteria: { minInvested: minInv, minRoi, minHold }, rois, realizedTotal, series, newQ, priceNow: priceAt(tEnd), updated: dayStr(tEnd) });
}

async function loadTransfers(src) {
  const rows = []; let head = null;
  const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!head) { head = line; continue; }
    if (!line) continue;
    const c = line.split(",");                 // sender,receiver,time,value (8-decimal raw)
    const t = parseTime(c[2]), qty = Number(c[3]) / 1e8;
    if (!Number.isFinite(t) || !(qty > 0)) continue;
    rows.push({ from: (c[0] || "").toLowerCase(), to: (c[1] || "").toLowerCase(), t, qty });
  }
  return rows;
}

async function main() {
  const transfers = arg("transfers"), timeline = arg("in"), out = arg("out") || "public/smart-money.json";
  let prices = null;
  try { prices = JSON.parse(readFileSync(arg("prices") || "public/price-history.json", "utf8")); } catch { console.error("prices required for ROI"); process.exit(1); }
  let o;
  if (transfers) {
    const rows = await loadTransfers(transfers);
    console.error(`smart-money[daily]: ${rows.length} transfers`);
    o = smartMoneyDaily(rows, prices);
  } else {
    const tl = JSON.parse(readFileSync(timeline || "public/spx-timeline.json", "utf8"));
    if (!Array.isArray(tl.wallets) || !tl.n) { console.error("bad timeline input"); process.exit(1); }
    o = smartMoney(tl, prices);
  }
  writeFileSync(out, JSON.stringify(o));
  console.log(`smart-money[${o.res}]: ${o.cohortSize} live · hold ${(o.heldNow / 1e6).toFixed(1)}M (~$${(o.heldUsd / 1e6).toFixed(1)}M) · median ${o.medianRoi}x · ` +
    `banked $${(o.realizedTotal / 1e6).toFixed(0)}M · flow 4w ${o.flow.w4}% 12w ${o.flow.w12}% · new(90d) ${o.newQual90} → ${out}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main();
