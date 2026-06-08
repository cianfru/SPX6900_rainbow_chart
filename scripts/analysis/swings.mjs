import { readFileSync } from "node:fs";
import { DEFAULT_RAW } from "../../src/data.js";

const KAG = process.env.BTC_KAGGLE, CG = process.env.BTC_COINGECKO;
const kag = readFileSync(KAG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0], price: +c[5] }; }).filter(r => r.price > 0);
const cg = readFileSync(CG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0].slice(0, 10), price: +c[1] }; }).filter(r => r.price > 0);
const map = new Map(); for (const r of kag) if (r.date < "2013-04-28") map.set(r.date, r.price); for (const r of cg) map.set(r.date, r.price);
const btc = [...map.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date < b.date ? -1 : 1);

// major swing detection: a point is a TOP/BOT if it's the extreme within +/- win days
function swings(rows, win) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    let hi = true, lo = true;
    for (let j = Math.max(0, i - win); j <= Math.min(rows.length - 1, i + win); j++) {
      if (rows[j].price > rows[i].price) hi = false;
      if (rows[j].price < rows[i].price) lo = false;
    }
    if (hi || lo) out.push({ date: rows[i].date, price: rows[i].price, kind: hi ? "TOP" : "BOT" });
  }
  // dedupe consecutive same-kind, keep the extreme
  return out;
}
const ageY = (d, d0) => ((new Date(d).getTime() - d0) / 86400000 / 365.25).toFixed(2);

const BTC0 = new Date(btc[0].date).getTime();
console.log("=== BTC major swings, first ~3.5y (win=45d) ===");
for (const s of swings(btc.filter(r => r.date < "2014-02-01"), 45))
  console.log(`  ${s.kind}  ${s.date}  $${s.price.toFixed(2).padStart(9)}   age ${ageY(s.date, BTC0)}y`);

const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
console.log("\n=== SPX6900 major swings, full history (win=30d) ===");
for (const s of swings(DEFAULT_RAW, 30))
  console.log(`  ${s.kind}  ${s.date}  $${s.price.toFixed(4).padStart(9)}   age ${ageY(s.date, SPX0)}y`);
