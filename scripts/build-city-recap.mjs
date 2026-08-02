// Weekly / monthly recap of what changed in SPX City — new residents, buildings that rose a tier,
// who accumulated, who left — all DIFFED from public/spx-timeline.json (the same weekly per-wallet
// reconstruction the time-machine already replays). No new data collection: it's two snapshots of a
// file we regenerate daily. Emits public/city-recap.json.
//
//   node scripts/build-city-recap.mjs [--timeline=public/spx-timeline.json] [--out=public/city-recap.json]
//
// The residency bar, the "held" clock and the score are copied EXACTLY from SpxCity.jsx histTowers so
// the recap describes the city you can actually see; heightOf + the archetype cut-offs mirror
// city-render.js so "a building upgraded" means the same tier change the 3D city draws.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceAt } from "./build-city-timeline.mjs";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const DAY = 86400000;

// ── mirror of city-render.heightOf (pure; keep in sync) ────────────────────────────────────────
const HMIN = 1.0, HMAX = 21;
function heightOf(score, minScore, maxScore) {
  const s = Math.max(Number.isFinite(score) ? score : 0, minScore);
  const usable = minScore > 0 && maxScore > minScore;
  const lg = usable ? (Math.log(s) - Math.log(minScore)) / (Math.log(maxScore) - Math.log(minScore)) : 0;
  const rt = maxScore > 0 ? Math.sqrt(Math.max(0, s) / maxScore) : 0;
  const u = usable ? 0.5 * lg + 0.5 * rt : rt;
  return HMIN + (HMAX - HMIN) * Math.max(0, Math.min(1, u));
}
// city-render archetype families: masonry (low brick) < 3.5 ≤ concrete (mid-rise) < 11 ≤ glass (tower)
const FAMILIES = ["masonry", "concrete", "glass"];
const familyOf = h => (h >= 11 ? 2 : h >= 3.5 ? 1 : 0);
const FAMILY_LABEL = { masonry: "brick low-rise", concrete: "concrete mid-rise", glass: "glass tower" };

// Days held at week W = 7 × weeks since the wallet last stood at zero (a sold-out-and-returned wallet
// restarts its clock) — histTowers verbatim.
function heldDays(p, W) {
  let runStart = null, atZero = true;
  for (const [wk, b] of p) {
    if (wk > W) break;
    if (b === 0) { atZero = true; runStart = null; }
    else if (atZero) { runStart = wk; atZero = false; }
  }
  return runStart == null ? 0 : (W - runStart) * 7;
}

// The resident set at week W, scored + heighted + ranked exactly as the city draws it.
function cityAt(tl, W) {
  const bar = tl.threshold, isSpx = tl.asset === "SPX";
  const rows = [];
  for (const w of tl.wallets) {
    const bal = balanceAt(w.p, W);
    if (bal < bar) continue;
    const days = heldDays(w.p, W);
    if (isSpx && days < Math.min(90, W * 7)) continue;   // can't hold longer than the token has existed
    rows.push({ a: w.a, bal, days });
  }
  if (!rows.length) return { at: W, byAddr: new Map(), residents: 0, held: 0, familyMix: { masonry: 0, concrete: 0, glass: 0 } };
  const maxBal = Math.max(1, ...rows.map(r => r.bal));
  const maxDays = Math.max(1, ...rows.map(r => r.days));
  for (const r of rows) r.score = (r.bal / maxBal) * (0.45 + 0.55 * (r.days / maxDays));
  const scores = rows.map(r => r.score);
  const minScore = Math.min(...scores), maxScore = Math.max(...scores);
  for (const r of rows) { r.height = heightOf(r.score, minScore, maxScore); r.fam = familyOf(r.height); }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const byAddr = new Map(rows.map(r => [r.a, r]));
  const familyMix = { masonry: 0, concrete: 0, glass: 0 };
  for (const r of rows) familyMix[FAMILIES[r.fam]]++;
  return { at: W, byAddr, residents: rows.length, held: rows.reduce((s, r) => s + r.bal, 0), familyMix, top: rows.slice(0, 12) };
}

const short = a => a.slice(0, 6) + "…" + a.slice(-4);

// Diff two weeks into a legible recap block.
function diff(tl, then, now, weekDate) {
  const A = cityAt(tl, then), B = cityAt(tl, now);
  const arrivals = [], departures = [], upgrades = [], downgrades = [], grew = [], milestones = [];
  for (const [addr, b] of B.byAddr) {
    const a = A.byAddr.get(addr);
    if (!a) { arrivals.push(b); continue; }
    if (b.fam > a.fam) upgrades.push({ ...b, fromFam: a.fam, dBal: b.bal - a.bal, dDays: b.days - a.days, dRank: a.rank - b.rank });
    else if (b.fam < a.fam) downgrades.push({ ...b, fromFam: a.fam });
    if (b.bal > a.bal) grew.push({ ...b, dBal: b.bal - a.bal, aRank: a.rank });
    if (a.days < 365 && b.days >= 365) milestones.push(b);    // crossed a year held this period
  }
  for (const [addr, a] of A.byAddr) if (!B.byAddr.has(addr)) departures.push(a);

  const byGain = grew.slice().sort((x, y) => y.dBal - x.dBal);
  const climbs = grew.filter(g => g.aRank - g.rank > 0).sort((x, y) => (y.aRank - y.rank) - (x.aRank - x.rank));
  // The headline building: the highest-ranked wallet that rose a tier this period, else the biggest
  // new arrival — this is the one we point the camera at for the close-up render.
  const hero = upgrades.slice().sort((x, y) => x.rank - y.rank)[0]
    || arrivals.slice().sort((x, y) => y.score - x.score)[0]
    || byGain[0] || null;

  const trim = r => r && ({ a: r.a, short: short(r.a), bal: Math.round(r.bal), days: r.days, rank: r.rank,
    family: FAMILIES[r.fam], height: +r.height.toFixed(1),
    ...(r.fromFam != null ? { fromFamily: FAMILIES[r.fromFam] } : {}),
    ...(r.dBal != null ? { gained: Math.round(r.dBal) } : {}),
    ...(r.dDays != null ? { agedDays: r.dDays } : {}),
    ...(r.dRank != null ? { climbedRanks: r.dRank } : {}) });

  return {
    fromWeek: then, toWeek: now, toDate: weekDate,
    residents: B.residents, residentsThen: A.residents, residentsDelta: B.residents - A.residents,
    heldNow: Math.round(B.held), heldThen: Math.round(A.held), heldDelta: Math.round(B.held - A.held),
    newResidents: arrivals.length, departed: departures.length,
    upgraded: upgrades.length, downgraded: downgrades.length,
    familyMix: B.familyMix, familyMixThen: A.familyMix,
    hero: trim(hero),
    topArrivals: arrivals.sort((x, y) => y.score - x.score).slice(0, 5).map(trim),
    topUpgrades: upgrades.sort((x, y) => x.rank - y.rank).slice(0, 5).map(trim),
    topAccumulators: byGain.slice(0, 5).map(trim),
    topClimbers: climbs.slice(0, 5).map(trim),
    yearHeldMilestones: milestones.length,
  };
}

// The standard recap tweet, baked into city-recap.json so the control panel can show it with a Copy
// button and it stays in sync with the numbers. House style: hook, then airy lines, plain closing.
function recapTweet(r, period) {
  const f = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(2) + "M" : a >= 1e3 ? Math.round(n / 1e3) + "k" : "" + n; };
  const per = period === "weekly" ? "week" : "month";
  const held = (r.heldDelta >= 0 ? "+" : "") + f(r.heldDelta);
  const move = `${r.newResidents} moved in, ${r.departed} moved out — ${r.upgraded} building${r.upgraded === 1 ? "" : "s"} rose a tier as holders grew and aged in.`;
  const hero = r.hero && r.hero.fromFamily
    ? `A rank #${r.hero.rank} holder's tower went from ${FAMILY_LABEL[r.hero.fromFamily]} to ${FAMILY_LABEL[r.hero.family]}.`
    : `${r.yearHeldMilestones} wallet${r.yearHeldMilestones === 1 ? "" : "s"} crossed a year held.`;
  return [
    `🏙 This ${per} in SPX City`,
    move,
    `${hero} ${held} SPX now stands across ${r.residents.toLocaleString("en-US")} residents.`,
    `Every building is a real wallet — reproducible on-chain.`,
  ].join("\n\n");
}

function main() {
  const file = arg("timeline", "public/spx-timeline.json");
  const out = arg("out", "public/city-recap.json");
  const tl = JSON.parse(readFileSync(file, "utf8"));
  const week0 = Date.parse(tl.week0);
  const wkDate = w => new Date(week0 + w * 7 * DAY).toISOString().slice(0, 10);
  const now = tl.n - 1;
  const weekly = diff(tl, Math.max(0, now - 1), now, wkDate(now));
  const monthly = diff(tl, Math.max(0, now - 4), now, wkDate(now));
  weekly.tweet = recapTweet(weekly, "weekly");
  monthly.tweet = recapTweet(monthly, "monthly");

  const doc = { v: 1, updated: tl.updated || wkDate(now), asset: tl.asset, week0: tl.week0, n: tl.n, weekly, monthly };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2));

  const fmt = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + "k" : "" + n);
  for (const [label, r] of [["WEEK", weekly], ["MONTH", monthly]]) {
    console.log(`\n── ${label} to ${r.toDate} ──`);
    console.log(`  residents ${r.residents} (${r.residentsDelta >= 0 ? "+" : ""}${r.residentsDelta}) · held ${fmt(r.heldNow)} SPX (${r.heldDelta >= 0 ? "+" : ""}${fmt(r.heldDelta)})`);
    console.log(`  ${r.newResidents} moved in · ${r.departed} left · ${r.upgraded} buildings rose a tier · ${r.downgraded} fell · ${r.yearHeldMilestones} crossed 1yr held`);
    console.log(`  mix: ${r.familyMix.glass} glass / ${r.familyMix.concrete} concrete / ${r.familyMix.masonry} masonry`);
    if (r.hero) console.log(`  HERO → ${r.hero.short} · rank #${r.hero.rank} · ${r.hero.family}${r.hero.fromFamily ? ` (was ${r.hero.fromFamily})` : ""}${r.hero.gained ? ` · +${fmt(r.hero.gained)} SPX` : ""}`);
    if (r.topUpgrades[0]) console.log(`  top upgrade: ${r.topUpgrades[0].short} ${r.topUpgrades[0].fromFamily} → ${r.topUpgrades[0].family} (rank #${r.topUpgrades[0].rank})`);
    if (r.topAccumulators[0]) console.log(`  top accumulator: ${r.topAccumulators[0].short} +${fmt(r.topAccumulators[0].gained)} SPX`);
  }
  console.log(`\n✓ wrote ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
