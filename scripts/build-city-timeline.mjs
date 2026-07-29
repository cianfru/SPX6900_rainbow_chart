// ============================================================================
// CITY TIMELINE — weekly per-wallet balances for the launch→today time slider
// ============================================================================
//   node scripts/build-city-timeline.mjs --spx=transfers.csv  --out=public/spx-timeline.json
//   node scripts/build-city-timeline.mjs --aeon=aeon_transfers.csv --out=public/aeon-timeline.json
//
// The slider replays the city: buildings appear the week a wallet first bought, grow/shrink with
// its balance, and vanish when it sells out. That needs each wallet's balance at every week — but
// NOT the FIFO engine: balance is a plain net sum, so this is a separate, much simpler replay that
// cannot destabilise the cost-basis pipeline.
//
// Encoding is sparse CHANGE-POINTS: `p: [[weekIdx, balance], …]` — the balance holds until the
// next point, and most wallets don't move most weeks, so this is ~10-20× smaller than a dense
// grid. Weeks are a Monday grid carried as `week0` + `n` (the client derives the dates).
//
// SPX rides the same transfers archive the on-chain pipeline already downloads daily
// (release asset `onchain-archive`), so the CI step costs no extra pull. EVERY wallet whose peak
// balance ever cleared the city's entry bar is kept — see the no-cap note in main(); `dropped`
// stays in the output as the standing disclosure that nothing was.
// ============================================================================
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { EXCLUDE } from "./build-onchain-local.mjs";

const arg = (k) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

const DAY = 864e5, WEEK = 7 * DAY;
// Monday on/before t (UTC)
export const mondayOf = (t) => { const d = new Date(t); const dow = (d.getUTCDay() + 6) % 7; return Date.parse(d.toISOString().slice(0, 10)) - dow * DAY; };
export const parseTime = (s) => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };

// Fold per-wallet weekly NET deltas into sparse change-points over a continuous week grid.
export function changePoints(deltasByWeek, nWeeks, round = v => v) {
  const pts = [];
  let bal = 0, last = null;
  const weeks = [...deltasByWeek.keys()].sort((a, b) => a - b);
  for (const w of weeks) {
    if (w < 0 || w >= nWeeks) continue;
    bal += deltasByWeek.get(w);
    const r = round(Math.max(0, bal));
    if (r !== last) { pts.push([w, r]); last = r; }
  }
  return pts;
}

// Balance at week W given change-points (binary search, shared with the client-side reader).
export function balanceAt(p, w) {
  let lo = 0, hi = p.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (p[m][0] <= w) { ans = p[m][1]; lo = m + 1; } else hi = m - 1; }
  return ans;
}

async function main() {
  const spx = arg("spx"), aeon = arg("aeon"), out = arg("out");
  if ((!spx && !aeon) || !out) { console.error("usage: --spx=transfers.csv | --aeon=aeon_transfers.csv  --out=file.json"); process.exit(1); }

  const src = spx || aeon, isSpx = !!spx;
  const threshold = isSpx ? 5000 : 1;       // the city's own entry bars
  // NO CAP. The first cut kept the top 9,000 by PEAK balance — and reproduced only 1,279 of the
  // 4,894 wallets standing today, because churn is enormous: most of the biggest-ever wallets have
  // sold out entirely, and today's residents mostly never had huge peaks. Ranking by any one
  // moment's size silently rewrites every other week. Everyone who ever cleared the bar stays
  // (~26k wallets ≈ 3MB raw, lazy-loaded only when the slider opens); if a single WEEK ever holds
  // more residents than the city has lots, that is the renderer's problem to cap — and disclose.
  const CAP = Infinity;

  // pass 1: per-wallet Map(weekTs -> delta). Streaming — the SPX archive is ~300MB of text.
  const deltas = new Map();                  // addr -> Map(weekTs -> delta)
  const bump = (a, w, d) => {
    if (!a || a === "0x0000000000000000000000000000000000000000") return;
    if (isSpx && EXCLUDE.has(a)) return;     // exchanges/LP/bridge/burn are the harbour, not residents
    let m = deltas.get(a); if (!m) { m = new Map(); deltas.set(a, m); }
    m.set(w, (m.get(w) || 0) + d);
  };

  let minW = Infinity, maxW = -Infinity, rows = 0, head = null;
  const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!head) { head = line.toLowerCase().split(","); continue; }
    if (!line) continue;
    const c = line.split(",");
    let from, to, t, qty;
    if (isSpx) {                             // sender,receiver,time,value (8-decimal raw)
      from = c[0]; to = c[1]; t = parseTime(c[2]); qty = Number(c[3]) / 1e8;
    } else {                                 // from_address,to_address,token_id,time
      from = c[0]; to = c[1]; t = parseTime(c[3]); qty = 1;
    }
    if (!Number.isFinite(t) || !(qty > 0)) continue;
    const w = mondayOf(t);
    minW = Math.min(minW, w); maxW = Math.max(maxW, w);
    bump(from.toLowerCase(), w, -qty);
    bump(to.toLowerCase(), w, qty);
    rows++;
  }
  // extend the grid to the current week so "latest" on the slider means NOW, not the last transfer
  maxW = Math.max(maxW, mondayOf(Date.now()));
  const nWeeks = Math.round((maxW - minW) / WEEK) + 1;

  // pass 2: change-points per wallet, keep the ones that ever cleared the bar
  const round = isSpx ? (v => Math.round(v)) : (v => v);
  const wallets = [];
  for (const [a, m] of deltas) {
    const byIdx = new Map();
    for (const [w, d] of m) byIdx.set(Math.round((w - minW) / WEEK), d);
    const p = changePoints(byIdx, nWeeks, round);
    if (!p.length) continue;
    const peak = Math.max(...p.map(x => x[1]));
    if (peak < threshold) continue;
    wallets.push({ a, p, peak });
  }
  wallets.sort((x, y) => y.peak - x.peak);
  const kept = wallets.slice(0, CAP);
  const dropped = wallets.length - kept.length;

  const outObj = {
    v: 1, updated: new Date().toISOString().slice(0, 10),
    asset: isSpx ? "SPX" : "AEON", threshold,
    week0: new Date(minW).toISOString().slice(0, 10), n: nWeeks,
    dropped,                                  // how many ever-qualified wallets fell past the cap
    wallets: kept.map(({ a, p }) => ({ a, p })),
  };
  writeFileSync(out, JSON.stringify(outObj));
  const bytes = JSON.stringify(outObj).length;
  console.log(`city-timeline[${outObj.asset}]: ${rows} transfers → ${kept.length} wallets` +
    ` (${dropped} dropped past cap) · ${nWeeks} weeks from ${outObj.week0} · ${(bytes / 1e6).toFixed(1)}MB`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) main().catch(e => { console.error(e); process.exit(1); });
