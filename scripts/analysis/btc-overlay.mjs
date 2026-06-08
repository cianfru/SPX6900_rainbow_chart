// Exploratory: overlay early-Bitcoin price action against SPX6900, age-aligned
// (days since each asset's first price), on a log axis. Renders a preview PNG.
// BTC is scaled down to SPX's price tier by the best-fit factor over the shared
// age window, so the two curves sit on top of each other and you can eyeball the
// "rhyme". Reads the two uploaded CSVs (Kaggle early + CoinGecko recent).
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";

const KAG = process.env.BTC_KAGGLE;     // bitcoin_*.csv : Start,End,Open,High,Low,Close,...
const CG = process.env.BTC_COINGECKO;   // btcusdmax.csv : snapped_at,price,...
const SHIFT = +(process.env.SHIFT || 0); // days to lead SPX into BTC timeline (e.g. 125)

// ---- load + stitch real BTC daily history ----
const kag = readFileSync(KAG, "utf8").trim().split("\n").slice(1)
  .map(l => { const c = l.split(","); return { date: c[0], price: +c[5] }; }).filter(r => r.price > 0);
const cg = readFileSync(CG, "utf8").trim().split("\n").slice(1)
  .map(l => { const c = l.split(","); return { date: c[0].slice(0, 10), price: +c[1] }; }).filter(r => r.price > 0);
const map = new Map();
for (const r of kag) if (r.date < "2013-04-28") map.set(r.date, r.price);
for (const r of cg) map.set(r.date, r.price);
const btcRows = [...map.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date < b.date ? -1 : 1);

const BTC0 = new Date(btcRows[0].date).getTime();
const btc = btcRows.map(r => ({ age: Math.round((new Date(r.date).getTime() - BTC0) / 86400000), price: r.price }));
const btcByAge = new Map(btc.map(b => [b.age, b.price]));
const btcMaxAge = btc.at(-1).age;
const btcLnAt = age => {
  let lo = age, hi = age;
  while (lo > 0 && !btcByAge.has(lo)) lo--;
  while (hi < btcMaxAge && !btcByAge.has(hi)) hi++;
  const a = btcByAge.get(lo), b = btcByAge.get(hi);
  if (a == null) return Math.log(b); if (b == null) return Math.log(a);
  const f = (age - lo) / ((hi - lo) || 1);
  return Math.log(a) + (Math.log(b) - Math.log(a)) * f;
};

// ---- SPX ----
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const spx = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / 86400000), price: r.price }));
const spxMaxAge = spx.at(-1).age;

// ---- best-fit vertical scale (bring BTC down to SPX tier over the shared window) ----
let sLn = 0, bLn = 0, n = 0;
for (const s of spx) { const a = s.age + SHIFT; if (a < 0 || a > btcMaxAge) continue; sLn += Math.log(s.price); bLn += btcLnAt(a); n++; }
const scale = Math.exp(sLn / n - bLn / n); // multiply BTC price by this

// BTC series over SPX's lived age window (age-aligned), scaled
const btcPlot = [];
for (let age = 0; age <= spxMaxAge; age++) btcPlot.push({ age, price: Math.exp(btcLnAt(age + SHIFT)) * scale });

// ---- render ----
const W = 1200, H = 675, mL = 96, mR = 40, mT = 150, mB = 84;
const pW = W - mL - mR, pH = H - mT - mB;
const ages = [...spx.map(s => s.age), ...btcPlot.map(b => b.age)];
const xMax = Math.max(...ages);
const prices = [...spx.map(s => s.price), ...btcPlot.map(b => b.price)];
const yMin = Math.min(...prices) * 0.8, yMax = Math.max(...prices) * 1.25;
const X = age => mL + (age / xMax) * pW;
const Y = p => mT + ((Math.log(yMax) - Math.log(p)) / (Math.log(yMax) - Math.log(yMin))) * pH;
const poly = pts => pts.map(p => `${X(p.age).toFixed(1)},${Y(p.price).toFixed(1)}`).join(" ");

const yTicks = [0.001, 0.01, 0.1, 1].filter(v => v >= yMin && v <= yMax);
let grid = "";
for (const v of yTicks) {
  const yy = Y(v).toFixed(1);
  grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`;
  grid += `<text x="${mL - 14}" y="${(+yy + 6)}" fill="#64748b" font-size="22" text-anchor="end" font-family="sans-serif">$${v}</text>`;
}
for (let yr = 0; yr <= xMax / 365.25; yr++) {
  const xx = X(yr * 365.25).toFixed(1);
  grid += `<text x="${xx}" y="${H - 40}" fill="#64748b" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}y</text>`;
}

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<text x="64" y="56" fill="#94a3b8" font-size="30" font-weight="700" letter-spacing="3" font-family="sans-serif">SPX6900</text>
<text x="64" y="104" fill="#e2e8f0" font-size="36" font-weight="700" font-family="sans-serif">SPX6900 vs Bitcoin's early curve — age-aligned (log)</text>
<text x="64" y="138" fill="#64748b" font-size="22" font-family="sans-serif">Days since each asset's first price · BTC scaled ${(1 / scale).toFixed(0)}x to SPX's tier${SHIFT ? ` · SPX led ${SHIFT}d` : ""}</text>
${grid}
<polyline points="${poly(btcPlot)}" fill="none" stroke="#f7931a" stroke-width="3" stroke-opacity="0.85"/>
<polyline points="${poly(spx)}" fill="none" stroke="#4ade80" stroke-width="3.4"/>
<rect x="${W - mR - 290}" y="${mT + 14}" width="22" height="6" rx="3" fill="#4ade80"/>
<text x="${W - mR - 258}" y="${mT + 24}" fill="#cbd5e1" font-size="22" font-family="sans-serif">SPX6900 (actual)</text>
<rect x="${W - mR - 290}" y="${mT + 44}" width="22" height="6" rx="3" fill="#f7931a"/>
<text x="${W - mR - 258}" y="${mT + 54}" fill="#cbd5e1" font-size="22" font-family="sans-serif">BTC 2010–13 (scaled)</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="20" font-family="sans-serif">spx6900rainbow.xyz · exploratory overlay, not a forecast · r=${(() => { const xs = [], ys = []; for (const s of spx) { const a = s.age + SHIFT; if (a < 0 || a > btcMaxAge) continue; xs.push(Math.log(s.price)); ys.push(btcLnAt(a)); } const N = xs.length, mx = xs.reduce((p, c) => p + c) / N, my = ys.reduce((p, c) => p + c) / N; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < N; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return (sxy / Math.sqrt(sxx * syy)).toFixed(2); })()}</text>
</svg>`;

const out = `bot-preview-btcoverlay${SHIFT ? "-shift" : ""}.png`;
writeFileSync(out, new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
console.log(`stitched BTC ${btcRows.length}d (${btcRows[0].date}→${btcRows.at(-1).date}) · scale 1/${(1 / scale).toFixed(1)} · -> ${out}`);
