// ============================================================================
// COHORT SURVIVAL — who is still holding SPX6900, by when they arrived
// ============================================================================
//   node scripts/build-cohort-survival.mjs --in=public/spx-timeline.json --out=public/cohort-survival.json
//
// A re-slice of the city time-machine (per-wallet weekly balances) into a COMPACT summary the cards
// and the site chart read — a few KB, so nothing has to fetch the 3MB timeline just to draw a bar.
// Every figure is a plain count/sum over net balances; the honesty caveats (survivorship, right-
// censoring, "gone" = balance fell below the bar) live on the surfaces that show it.
//
// Emits:
//   cohorts[]     — arrival quarter: { label, startWk, arrived, holdNow, supplyNow, survivalPct, medPrice }
//   overall       — { everHeld, holdNow, gonePct, diamondPct }   (diamond = still holds AND never
//                    returned to zero since arrival)
//   topPeak[]     — of the biggest-EVER wallets by peak balance, how many have since gone
//   launch        — the first-12-weeks cohort, called out on its own
//   weekly[]      — per week, the living holder count split by arrival cohort (the stacked "city by
//                   vintage" series — old cohorts stay thin, new ones pile on top)
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { balanceAt } from "./build-city-timeline.mjs";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;

// arrival half-year label + a stable ordering key
// arrival period label — QUARTERLY (the sweet spot: ~2× the resolution of half-years while the
// bubble/vintage views stay readable and each cohort keeps enough wallets for a stable survival %).
const halfOf = (t) => `${t.getUTCFullYear()} Q${Math.floor(t.getUTCMonth() / 3) + 1}`;

export function cohortSurvival(tl, prices = null) {
  const W = tl.n - 1, BAR = tl.threshold;
  const week0 = Date.parse(tl.week0);
  const dateOf = (wk) => new Date(week0 + wk * 7 * DAY);
  // median SPX price during a [wk, wkEnd) window — the era's typical entry price, so the "where the
  // float came from" surfaces can say a cohort arrived cheap or near the top without re-fetching.
  const px = Array.isArray(prices) ? prices.map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0) : [];
  const medPrice = (wk0, wk1) => {
    if (!px.length) return null;
    const t0 = week0 + wk0 * 7 * DAY, t1 = week0 + wk1 * 7 * DAY;
    const v = px.filter(r => r.t >= t0 && r.t < t1).map(r => r.p).sort((a, b) => a - b);
    return v.length ? +v[v.length >> 1].toFixed(4) : null;
  };

  // fixed cohort spine (every half-year present in the grid), so empty ones still render as zero
  const labels = [];
  for (let wk = 0; wk < tl.n; wk++) { const l = halfOf(dateOf(wk)); if (!labels.includes(l)) labels.push(l); }
  const idxOf = new Map(labels.map((l, i) => [l, i]));
  const startWk = labels.map(l => { for (let wk = 0; wk < tl.n; wk++) if (halfOf(dateOf(wk)) === l) return wk; return 0; });

  const cohorts = labels.map((label, i) => ({ label, startWk: startWk[i], arrived: 0, holdNow: 0, supplyNow: 0 }));
  const weekly = Array.from({ length: tl.n }, () => new Array(labels.length).fill(0));

  let everHeld = 0, holdNow = 0, diamond = 0;
  const byPeak = [];

  for (const w of tl.wallets) {
    // arrival = first week at/above the bar
    let arr = null;
    for (const [wk, b] of w.p) { if (b >= BAR) { arr = wk; break; } }
    if (arr == null) continue;
    everHeld++;
    const ci = idxOf.get(halfOf(dateOf(arr)));
    cohorts[ci].arrived++;
    byPeak.push({ peak: Math.max(...w.p.map(x => x[1])), now: balanceAt(w.p, W) });

    // living-by-vintage series: walk the sparse points, hold between them
    let pi = 0, bal = 0;
    for (let wk = arr; wk < tl.n; wk++) {
      while (pi < w.p.length && w.p[pi][0] <= wk) bal = w.p[pi++][1];
      if (bal >= BAR) weekly[wk][ci]++;
    }

    const nowBal = balanceAt(w.p, W);
    if (nowBal >= BAR) {
      holdNow++; cohorts[ci].holdNow++; cohorts[ci].supplyNow += nowBal;
      // never returned to zero after arrival = a clean diamond hold
      let sold = false;
      for (const [wk, b] of w.p) { if (wk > arr && b === 0) { sold = true; break; } }
      if (!sold) diamond++;
    }
  }

  byPeak.sort((a, b) => b.peak - a.peak);
  const topPeak = [100, 1000, 9000].filter(n => n <= byPeak.length).map(n => {
    const gone = byPeak.slice(0, n).filter(w => w.now < BAR).length;
    return { n, gone, gonePct: +(100 * gone / n).toFixed(0) };
  });

  const launchCut = 12; // first ~12 weeks ≈ Aug–Oct 2023
  const launch = cohorts.filter(c => c.startWk < launchCut).reduce((a, c) => ({ arrived: a.arrived + c.arrived, holdNow: a.holdNow + c.holdNow, supplyNow: a.supplyNow + c.supplyNow }), { arrived: 0, holdNow: 0, supplyNow: 0 });

  return {
    updated: tl.updated, week0: tl.week0, n: tl.n, bar: BAR,
    overall: {
      everHeld, holdNow, gonePct: +(100 * (everHeld - holdNow) / everHeld).toFixed(0),
      diamondPct: holdNow ? +(100 * diamond / holdNow).toFixed(0) : 0,
    },
    cohorts: cohorts.map((c, i) => ({
      ...c, supplyNow: Math.round(c.supplyNow),
      survivalPct: c.arrived ? +(100 * c.holdNow / c.arrived).toFixed(0) : 0,
      medPrice: medPrice(c.startWk, i + 1 < cohorts.length ? cohorts[i + 1].startWk : tl.n),
    })),
    topPeak,
    launch: { ...launch, supplyNow: Math.round(launch.supplyNow), pct: launch.arrived ? +(100 * launch.holdNow / launch.arrived).toFixed(0) : 0 },
    weekly,
  };
}

function main() {
  const inp = arg("in") || "public/spx-timeline.json";
  const out = arg("out") || "public/cohort-survival.json";
  const pricesPath = arg("prices") || "public/price-history.json";
  const tl = JSON.parse(readFileSync(inp, "utf8"));
  if (!Array.isArray(tl.wallets) || !tl.n) { console.error("bad timeline input"); process.exit(1); }
  let prices = null;
  try { prices = JSON.parse(readFileSync(pricesPath, "utf8")); } catch { /* era prices optional */ }
  const o = cohortSurvival(tl, prices);
  writeFileSync(out, JSON.stringify(o));
  const c = o.cohorts.find(x => x.arrived > 0);
  console.log(`cohort-survival: ${o.overall.everHeld} ever held → ${o.overall.holdNow} today (${o.overall.gonePct}% gone) · ` +
    `${o.overall.diamondPct}% of holders never sold · launch cohort ${o.launch.pct}% survive · ${o.cohorts.length} cohorts`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main();
