// Search ALL of BTC history for the window whose SHAPE best matches SPX6900's
// actual path (accumulation -> peak(s) -> deep bear -> flatten). For each start
// offset and time-scale, map SPX's age axis onto a BTC window and score by the
// Pearson correlation of log-prices. Reports the best-matching BTC windows, so
// we can locate "which BTC cycle is SPX rhyming with" instead of assuming genesis.
import { readFileSync } from "node:fs";
import { DEFAULT_RAW } from "../../src/data.js";

const KAG = process.env.BTC_KAGGLE, CG = process.env.BTC_COINGECKO;
const kag = readFileSync(KAG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0], price: +c[5] }; }).filter(r => r.price > 0);
const cg = readFileSync(CG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0].slice(0, 10), price: +c[1] }; }).filter(r => r.price > 0);
const map = new Map(); for (const r of kag) if (r.date < "2013-04-28") map.set(r.date, r.price); for (const r of cg) map.set(r.date, r.price);
const btcRows = [...map.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date < b.date ? -1 : 1);
const BTC0 = new Date(btcRows[0].date).getTime();
const maxAge = Math.round((new Date(btcRows.at(-1).date).getTime() - BTC0) / 86400000);
// dense lnP by integer age (forward-fill any gaps)
const lnByAge = new Float64Array(maxAge + 1);
{ let last = Math.log(btcRows[0].price); const m = new Map(btcRows.map(r => [Math.round((new Date(r.date).getTime() - BTC0) / 86400000), Math.log(r.price)]));
  for (let a = 0; a <= maxAge; a++) { if (m.has(a)) last = m.get(a); lnByAge[a] = last; } }
const dateAt = age => new Date(BTC0 + age * 86400000).toISOString().slice(0, 10);

// SPX sampled every 7 days (log price)
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const spxPts = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / 86400000), ln: Math.log(r.price) }));
const Tspx = spxPts.at(-1).age;
const spxLnAt = a => { if (a <= spxPts[0].age) return spxPts[0].ln; if (a >= spxPts.at(-1).age) return spxPts.at(-1).ln; for (let i = 1; i < spxPts.length; i++) if (a <= spxPts[i].age) { const p = spxPts[i - 1], q = spxPts[i]; return p.ln + (q.ln - p.ln) * (a - p.age) / (q.age - p.age); } };
const spxSamples = []; for (let a = 0; a <= Tspx; a += 7) spxSamples.push({ a, ln: spxLnAt(a) });

function pearson(xs, ys) { const n = xs.length, mx = xs.reduce((p, c) => p + c) / n, my = ys.reduce((p, c) => p + c) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return sxy / Math.sqrt(sxx * syy); }

function score(start, scale) {
  const xs = [], ys = [];
  for (const s of spxSamples) { const ba = Math.round(start + s.a * scale); if (ba < 0 || ba > maxAge) return null; xs.push(s.ln); ys.push(lnByAge[ba]); }
  return pearson(xs, ys);
}

// scan
const scales = []; for (let k = 0.5; k <= 2.51; k += 0.1) scales.push(+k.toFixed(2));
const results = [];
for (const scale of scales) {
  const L = Tspx * scale;
  for (let start = 0; start + L <= maxAge; start += 7) {
    const r = score(start, scale);
    if (r != null) results.push({ start, scale, L: Math.round(L), r });
  }
}
results.sort((a, b) => b.r - a.r);
// dedupe overlapping windows (keep best, skip any whose start within 120d & scale within 0.3 of a kept one)
const kept = [];
for (const c of results) { if (kept.some(k => Math.abs(k.start - c.start) < 150 && Math.abs(k.scale - c.scale) < 0.35)) continue; kept.push(c); if (kept.length >= 8) break; }

console.log("=== Best-matching BTC windows to SPX6900's full shape ===");
console.log("(SPX age 0.." + Tspx + "d mapped onto BTC window; r = log-price correlation)\n");
for (const k of kept) console.log(`  r=${k.r.toFixed(3)}  scale ${k.scale.toFixed(2)}x  BTC ${dateAt(k.start)} -> ${dateAt(k.start + k.L)}  (start age ${k.start}d)`);

// specifically evaluate the user's 2020-07 -> 2022-11 hypothesis
const s2020 = Math.round((new Date("2020-07-02").getTime() - BTC0) / 86400000);
let best2020 = { r: -2 };
for (const scale of scales) { const r = score(s2020, scale); if (r != null && r > best2020.r) best2020 = { scale, r }; }
console.log(`\n=== Your hypothesis: BTC from 2020-07-02 ===`);
console.log(`  best r=${best2020.r.toFixed(3)} at scale ${best2020.scale}x  -> window ${dateAt(s2020)} -> ${dateAt(s2020 + Math.round(Tspx * best2020.scale))}`);
