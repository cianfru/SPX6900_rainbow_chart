// ============================================================================
// SMART MONEY — the live cohort of proven top-timers, aggregated (no wallet named)
// ============================================================================
//   node scripts/build-smart-money.mjs --in=public/spx-timeline.json --prices=public/price-history.json --out=public/smart-money.json
//
// A "Live Smart Money" desk, RECOMPUTED every run so it's never a frozen list:
//   a wallet qualifies iff it (1) deployed real capital (≥ $25k of buys), (2) realized ROI ≥ 5×
//   (proved timing by actually SELLING at a profit — not paper gains), and (3) still holds a
//   meaningful bag (≥ 50k SPX). A wallet that dumps to zero drops out (a ghost tells us nothing
//   forward); one that re-accumulates with the track record joins. So the desk sheds leavers and
//   adds each cycle's proven winners on its own.
//
// We publish ONLY the AGGREGATE — total held over time + weekly net-flow — never a wallet address,
// so there is nothing to blindly follow. The forward signal is the net-flow: it flips green the week
// the proven timers start buying again. Honest limits (stated on-surface): qualification needs a
// realized profitable sell, so a wallet quietly accumulating the bottom is invisible until it sells;
// and on-chain has no identity, so a proven operator moving to a fresh wallet resets.
//
// ROI/realized use average-cost accounting over the weekly net-balance timeline (same basis as the
// rest of the on-chain suite) — an approximation, not FIFO; caveated everywhere it shows.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { balanceAt } from "./build-city-timeline.mjs";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;
const MIN_INVESTED = 25000, MIN_ROI = 5, MIN_HOLD = 50000;

export function smartMoney(tl, prices, opts = {}) {
  const minInv = opts.minInvested ?? MIN_INVESTED, minRoi = opts.minRoi ?? MIN_ROI, minHold = opts.minHold ?? MIN_HOLD;
  const week0 = Date.parse(tl.week0), N = tl.n, W = N - 1;
  const px = (Array.isArray(prices) ? prices : []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  const priceAt = (wk) => { if (!px.length) return 0; const t = week0 + wk * 7 * DAY; let b = px[0].p; for (const r of px) { if (r.t <= t) b = r.p; else break; } return b; };
  const dateOf = (wk) => new Date(week0 + wk * 7 * DAY).toISOString().slice(0, 10);

  // qualify each wallet on average-cost realized ROI + real capital + still-live
  const cohort = [];
  const rois = [];
  let realizedTotal = 0;
  for (const w of tl.wallets) {
    let pos = 0, avg = 0, realized = 0, spent = 0, prev = 0;
    for (const [wk, bal] of w.p) {
      const d = bal - prev, pr = priceAt(wk);
      if (d > 0) { avg = (avg * pos + d * pr) / (pos + d); pos += d; spent += d * pr; }
      else if (d < 0) { realized += (-d) * (pr - avg); pos += d; }
      prev = bal;
    }
    const now = balanceAt(w.p, W), roi = spent > 0 ? realized / spent : 0;
    if (spent >= minInv && roi >= minRoi && realized > 0 && now >= minHold) {
      cohort.push(w); rois.push(roi); realizedTotal += realized;
    }
  }

  // aggregate held + weekly net-flow + price
  const held = new Array(N).fill(0);
  for (const w of cohort) for (let wk = 0; wk < N; wk++) held[wk] += balanceAt(w.p, wk);
  const weeks = [];
  for (let wk = 0; wk < N; wk++) weeks.push([dateOf(wk), Math.round(held[wk]), Math.round(wk ? held[wk] - held[wk - 1] : 0), +priceAt(wk).toFixed(6)]);

  const heldNow = held[W], NOW = priceAt(W);
  const flowPct = (wks) => { const past = held[Math.max(0, W - wks)]; return past > 0 ? +(100 * (heldNow - past) / past).toFixed(1) : 0; };
  const sorted = rois.slice().sort((a, b) => a - b);
  const medianRoi = sorted.length ? +sorted[sorted.length >> 1].toFixed(1) : 0;
  // peak aggregate holdings (the "accumulated cheap" high-water mark)
  let peak = 0, peakWk = 0; for (let wk = 0; wk < N; wk++) if (held[wk] > peak) { peak = held[wk]; peakWk = wk; }

  return {
    updated: tl.updated, week0: tl.week0, n: N,
    criteria: { minInvested: minInv, minRoi, minHold },
    cohortSize: cohort.length,
    heldNow: Math.round(heldNow), heldUsd: Math.round(heldNow * NOW),
    realizedTotal: Math.round(realizedTotal), medianRoi,
    price: +NOW.toFixed(6),
    peak: Math.round(peak), peakDate: dateOf(peakWk), peakPrice: +priceAt(peakWk).toFixed(6),
    flow: { w4: flowPct(4), w12: flowPct(12), w26: flowPct(26) },
    weeks,
  };
}

function main() {
  const inp = arg("in") || "public/spx-timeline.json";
  const out = arg("out") || "public/smart-money.json";
  const pricesPath = arg("prices") || "public/price-history.json";
  const tl = JSON.parse(readFileSync(inp, "utf8"));
  if (!Array.isArray(tl.wallets) || !tl.n) { console.error("bad timeline input"); process.exit(1); }
  let prices = null;
  try { prices = JSON.parse(readFileSync(pricesPath, "utf8")); } catch { console.error("prices required for ROI"); process.exit(1); }
  const o = smartMoney(tl, prices);
  writeFileSync(out, JSON.stringify(o));
  console.log(`smart-money: ${o.cohortSize} live wallets · hold ${(o.heldNow / 1e6).toFixed(1)}M (~$${(o.heldUsd / 1e6).toFixed(1)}M) · median ${o.medianRoi}x · ` +
    `banked $${(o.realizedTotal / 1e6).toFixed(0)}M · flow 4w ${o.flow.w4}% 12w ${o.flow.w12}% 26w ${o.flow.w26}% → ${out}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main();
