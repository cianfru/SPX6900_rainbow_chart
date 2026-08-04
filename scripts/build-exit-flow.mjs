// ============================================================================
// EXIT FLOW — daily departures from SPX6900, split by profit / loss at the exit
// ============================================================================
//   CI (DAILY, from the raw archive the on-chain pipeline already downloads):
//     node scripts/build-exit-flow.mjs --transfers=transfers.csv --prices=public/price-history.json --out=public/exit-flow.json
//   LOCAL (WEEKLY, from the committed city timeline — for validation + a seed):
//     node scripts/build-exit-flow.mjs --timeline=public/spx-timeline.json --prices=public/price-history.json --out=public/exit-flow.json
//
// "Who is selling, and are they selling green or red" at a resolution you can watch — for mass-
// behaviour watching (esp. if SPX runs again), quarterly/weekly buckets smear the very capitulation-
// vs-profit-taking spikes you want to see. The archive carries real per-transfer timestamps, so from
// it we get the exact DAY each wallet crosses below the 5,000-SPX bar. The weekly `--timeline` mode
// reconstructs the same thing from the committed timeline (coarser, but lets us validate the logic
// offline — it must reconcile to the cohort-survival totals: ~21,008 left, ~71% in profit).
//
// A departure = a wallet that was ever ≥ bar and whose balance is now below it; its EXIT day = the
// last day it was ≥ bar, its ENTRY day = the first. It "left in profit" if price(exit) ≥ price(entry)
// — both ≈ the price when it crossed the bar, a realized-P/L proxy (stated on every surface).
// Emits: { updated, bar, res, overall:{left,profit,profitPct}, days:[[date,profit,loss],…] }
// ============================================================================
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EXCLUDE } from "./build-onchain-local.mjs";
import { parseTime, balanceAt } from "./build-city-timeline.mjs";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const ZERO = "0x0000000000000000000000000000000000000000";

// price at/before a date, from price-history.json ([{date,price}]) — a step function
function priceLookup(pricesPath) {
  let arr = [];
  try { arr = JSON.parse(readFileSync(pricesPath, "utf8")); } catch { /* no prices → all exits count as loss; guarded by caller */ }
  const px = (Array.isArray(arr) ? arr : []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  return (t) => { if (!px.length) return null; let best = px[0].p; for (const r of px) { if (r.t <= t) best = r.p; else break; } return best; };
}

// aggregate a list of {exitT, entryT, spx} departures into a daily/weekly series + overall totals.
// Each row carries BOTH the wallet COUNT and the SPX AMOUNT that left, split profit/loss — so the
// chart can read "how many wallets left" or "how much SPX dropped out of strong hands" that day.
// `spx` = the wallet's holding the moment before it fell below the bar (the position that exited);
// it's an OUTFLOW PROXY — on-chain can't tell a sale from a plain transfer — and never overstates.
function summarise(departures, priceAt, res) {
  const byDay = new Map();
  let left = 0, profit = 0, spxProfit = 0, spxLoss = 0;
  for (const d of departures) {
    const ep = priceAt(d.exitT), ap = priceAt(d.entryT);
    const inProfit = ep != null && ap != null && ep >= ap;
    const spx = Number.isFinite(d.spx) ? d.spx : 0;
    const key = dayOf(d.exitT);
    let row = byDay.get(key); if (!row) { row = { profit: 0, loss: 0, spxP: 0, spxL: 0 }; byDay.set(key, row); }
    if (inProfit) { row.profit++; profit++; row.spxP += spx; spxProfit += spx; }
    else { row.loss++; row.spxL += spx; spxLoss += spx; }
    left++;
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(([d, r]) => [d, r.profit, r.loss, Math.round(r.spxP), Math.round(r.spxL)]);
  return { updated: new Date().toISOString().slice(0, 10), bar: 5000, res,
    overall: {
      left, profit, loss: left - profit, profitPct: left ? +(100 * profit / left).toFixed(0) : 0,
      spx: Math.round(spxProfit + spxLoss), spxProfit: Math.round(spxProfit), spxLoss: Math.round(spxLoss),
      spxProfitPct: (spxProfit + spxLoss) ? +(100 * spxProfit / (spxProfit + spxLoss)).toFixed(0) : 0,
    }, days };
}

// DAILY — stream the raw transfer archive, track running balance, record each wallet's first/last day above the bar
async function fromTransfers(src, priceAt) {
  const BAR = 5000;
  // exitT = the transfer that DROPS the wallet below the bar (the actual sell-out day), not its last
  // transfer while still above — so a one-shot full dump lands on the dump day, not on its prior
  // activity. lastBal = its holding the moment before that drop = the position that left (the SPX
  // amount, an outflow proxy).
  const bal = new Map(), firstT = new Map(), crossT = new Map(), lastBal = new Map();
  let head = null, rows = 0;
  const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
  const touch = (a, d, t) => {
    if (!a || a === ZERO) return;
    a = a.toLowerCase(); if (EXCLUDE.has(a)) return;
    const prev = bal.get(a) || 0;
    const nb = Math.max(0, prev + d); bal.set(a, nb);
    if (nb >= BAR) { if (!firstT.has(a)) firstT.set(a, t); lastBal.set(a, nb); }   // still a holder
    else if (prev >= BAR) { crossT.set(a, t); }                                     // just fell below → exit day
  };
  for await (const line of rl) {
    if (!head) { head = line; continue; }
    if (!line) continue;
    const c = line.split(",");                 // sender,receiver,time,value (8-decimal raw)
    const t = parseTime(c[2]), qty = Number(c[3]) / 1e8;
    if (!Number.isFinite(t) || !(qty > 0)) continue;
    touch(c[0], -qty, t); touch(c[1], qty, t); rows++;
  }
  const departures = [];
  for (const [a, entryT] of firstT) if ((bal.get(a) || 0) < BAR) {
    departures.push({ entryT, exitT: crossT.get(a), spx: lastBal.get(a) || 0 });
  }
  console.error(`exit-flow[daily]: ${rows} transfers → ${departures.length} departures`);
  return summarise(departures, priceAt, "daily");
}

// WEEKLY — from the committed city timeline (validation + seed; coarser but offline-runnable)
function fromTimeline(path, priceAt) {
  const tl = JSON.parse(readFileSync(path, "utf8"));
  const week0 = Date.parse(tl.week0), W = tl.n - 1, BAR = tl.threshold, WEEK = 7 * DAY;
  const tOf = (wk) => week0 + wk * WEEK;
  const departures = [];
  for (const w of tl.wallets) {
    let arr = null; for (const [wk, b] of w.p) { if (b >= BAR) { arr = wk; break; } }
    if (arr == null || balanceAt(w.p, W) >= BAR) continue;
    let last = arr; for (let wk = arr; wk <= W; wk++) if (balanceAt(w.p, wk) >= BAR) last = wk;
    departures.push({ entryT: tOf(arr), exitT: tOf(last), spx: balanceAt(w.p, last) });
  }
  console.error(`exit-flow[weekly]: ${tl.wallets.length} wallets → ${departures.length} departures`);
  return summarise(departures, priceAt, "weekly");
}

async function main() {
  const transfers = arg("transfers"), timeline = arg("timeline"), out = arg("out") || "public/exit-flow.json";
  const priceAt = priceLookup(arg("prices") || "public/price-history.json");
  if (!transfers && !timeline) { console.error("usage: --transfers=archive.csv | --timeline=spx-timeline.json  --prices=… --out=…"); process.exit(1); }
  const o = transfers ? await fromTransfers(transfers, priceAt) : fromTimeline(timeline, priceAt);
  writeFileSync(out, JSON.stringify(o));
  console.log(`exit-flow: ${o.overall.left} left → ${o.overall.profitPct}% in profit · ${o.days.length} ${o.res} points → ${out}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main().catch(e => { console.error(e); process.exit(1); });

export { summarise, fromTimeline, fromTransfers, priceLookup };
