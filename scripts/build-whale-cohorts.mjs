// ============================================================================
// WHALE COHORTS OVER TIME — how many wallets sit in each size cohort, over time
// ============================================================================
//   CI (DAILY, from the raw archive the on-chain pipeline already downloads):
//     node scripts/build-whale-cohorts.mjs --transfers=transfers.csv --out=public/whale-cohort-history.json
//   LOCAL (WEEKLY, from the committed city timeline — validation + a seed that renders immediately):
//     node scripts/build-whale-cohorts.mjs --timeline=public/spx-timeline.json --out=public/whale-cohort-history.json
//
// A per-period count of the four whale cohorts (100–250k / 250k–1M / 1M–5M / 5M+). Cohort boundaries
// + labels come from src/whale-cohorts.js so this can't drift from the 3D page and the behaviour
// card. The archive carries real per-transfer timestamps → an exact DAILY membership count; the
// weekly `--timeline` mode reconstructs the same thing from the committed timeline (coarser, but
// offline-runnable + the two must reconcile when the daily series is sampled weekly).
//
// Honesty caveats (stated on the chart): a wallet is binned by its balance THAT period and migrates
// cohorts as it grows/shrinks; infra (CEX/LP/bridge/burn) is excluded via EXCLUDE; the live snapshot
// (whales.json) counts a touch fewer using finer per-lot FIFO ages.
// ============================================================================
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EXCLUDE } from "./build-onchain-local.mjs";
import { parseTime, balanceAt } from "./build-city-timeline.mjs";
import { COHORTS, cohortIndex, WHALE_FLOOR } from "../src/whale-cohorts.js";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DAY = 864e5;
const ZERO = "0x0000000000000000000000000000000000000000";
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const meta = (rows, res) => ({
  updated: new Date().toISOString().slice(0, 10), res, floor: WHALE_FLOOR,
  week0: rows[0]?.[0] ?? null, n: rows.length,
  labels: COHORTS.map(c => c.label), colors: COHORTS.map(c => c.accent), rows,
});

// WEEKLY — from the committed city timeline (validation + seed; offline-runnable). Exported for the
// unit test; walks each wallet's sparse change-points, forward-filling the balance across weeks.
export function whaleCohortHistory(tl) {
  const n = tl.n, week0 = Date.parse(tl.week0);
  const weekly = Array.from({ length: n }, () => new Array(COHORTS.length).fill(0));
  for (const w of tl.wallets) {
    let peak = 0; for (const pt of w.p) if (pt[1] > peak) peak = pt[1];
    if (peak < WHALE_FLOOR) continue;                     // most of the 26k never reach whale size
    let pi = 0, bal = 0;
    for (let wk = 0; wk < n; wk++) {
      while (pi < w.p.length && w.p[pi][0] <= wk) bal = w.p[pi++][1];
      const ci = cohortIndex(bal);
      if (ci >= 0) weekly[wk][ci]++;
    }
  }
  const rows = weekly.map((c, wk) => [dayOf(week0 + wk * 7 * DAY), ...c]);
  return meta(rows, "weekly");
}

// DAILY — stream the raw transfer archive, keep a running per-wallet balance + cohort membership, and
// snapshot the cohort counts at the end of every day (forward-filling quiet days). Membership is
// tracked INCREMENTALLY (only a wallet whose balance crosses a cohort edge updates the counts), so a
// day snapshot is O(1), not O(wallets).
export async function fromTransfers(src) {
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

  const bal = new Map(), coh = new Map();
  const counts = new Array(COHORTS.length).fill(0);
  const touch = (a, d) => {
    if (!a || a === ZERO || EXCLUDE.has(a)) return;
    const nb = Math.max(0, (bal.get(a) || 0) + d); bal.set(a, nb);
    const oc = coh.has(a) ? coh.get(a) : -1, nc = cohortIndex(nb);
    if (nc !== oc) { if (oc >= 0) counts[oc]--; if (nc >= 0) counts[nc]++; coh.set(a, nc); }
  };

  const out = [];
  let curDay = null, curT = 0;
  const flushTo = (nextDay) => {                          // emit curDay then forward-fill up to nextDay-1
    out.push([curDay, ...counts]);
    for (let t = curT + DAY; dayOf(t) < nextDay; t += DAY) out.push([dayOf(t), ...counts]);
  };
  for (const r of rows) {
    const d = dayOf(r.t);
    if (curDay === null) { curDay = d; curT = Date.parse(curDay); }
    else if (d !== curDay) { const nd = Date.parse(d); flushTo(d); curDay = d; curT = nd; }
    touch(r.from, -r.qty); touch(r.to, r.qty);
  }
  if (curDay !== null) out.push([curDay, ...counts]);
  console.error(`whale-cohort[daily]: ${rows.length} transfers → ${out.length} days`);
  return meta(out, "daily");
}

async function main() {
  const transfers = arg("transfers"), timeline = arg("timeline") || arg("in");
  const out = arg("out") || "public/whale-cohort-history.json";
  if (!transfers && !timeline) { console.error("usage: --transfers=archive.csv | --timeline=spx-timeline.json  --out=…"); process.exit(1); }
  const o = transfers ? await fromTransfers(transfers) : whaleCohortHistory(JSON.parse(readFileSync(timeline, "utf8")));
  writeFileSync(out, JSON.stringify(o));
  const first = o.rows[0], last = o.rows.at(-1);
  const tot = a => a.slice(1).reduce((s, v) => s + v, 0);
  console.log(`whale-cohort-history[${o.res}]: ${o.n} points · ${first[0]} ${tot(first)} whales → ${last[0]} ${tot(last)} whales · ` +
    o.labels.map((l, i) => `${l}=${last[i + 1]}`).join(" "));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main().catch(e => { console.error(e); process.exit(1); });
