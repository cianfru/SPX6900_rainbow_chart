// Exploratory "roadmap": anchor SPX6900 at today on Bitcoin's age-aligned curve,
// then extend BTC FORWARD to show what SPX's path could look like if it kept
// rhyming with BTC. BTC is scaled so its curve passes through SPX's CURRENT price
// at today (anchor-at-now), so the dashed continuation reads as a from-here path.
// HEAVILY illustrative — not a forecast. Sensitive to the alignment (SHIFT).
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";

const KAG = process.env.BTC_KAGGLE, CG = process.env.BTC_COINGECKO;
const SHIFT = +(process.env.SHIFT || 0);     // 1:1 alignment offset (days). 0 = raw same-age.
const FUT = +(process.env.FUT || 4.3);        // how far forward to draw, in SPX-years

// stitch BTC daily
const kag = readFileSync(KAG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0], price: +c[5] }; }).filter(r => r.price > 0);
const cg = readFileSync(CG, "utf8").trim().split("\n").slice(1).map(l => { const c = l.split(","); return { date: c[0].slice(0, 10), price: +c[1] }; }).filter(r => r.price > 0);
const map = new Map(); for (const r of kag) if (r.date < "2013-04-28") map.set(r.date, r.price); for (const r of cg) map.set(r.date, r.price);
const btcRows = [...map.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date < b.date ? -1 : 1);
const BTC0 = new Date(btcRows[0].date).getTime();
const btc = btcRows.map(r => ({ age: Math.round((new Date(r.date).getTime() - BTC0) / 86400000), price: r.price }));
const btcByAge = new Map(btc.map(b => [b.age, b.price]));
const btcMaxAge = btc.at(-1).age;
const btcLnAt = age => { let lo = Math.floor(age), hi = Math.ceil(age); while (lo > 0 && !btcByAge.has(lo)) lo--; while (hi < btcMaxAge && !btcByAge.has(hi)) hi++; const a = btcByAge.get(lo), b = btcByAge.get(hi); if (a == null) return Math.log(b); if (b == null) return Math.log(a); const f = (age - lo) / ((hi - lo) || 1); return Math.log(a) + (Math.log(b) - Math.log(a)) * f; };

const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const spx = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / 86400000), price: r.price }));
const spxMaxAge = spx.at(-1).age;
const spxNow = spx.at(-1).price;

// mapping (1:1 tempo, offset SHIFT) + anchor BTC at SPX's price today
const btcDayForSpxAge = s => s + SHIFT;
const spxAgeForBtcDay = d => d - SHIFT;
const btcNowDay = btcDayForSpxAge(spxMaxAge);
const anchor = spxNow / Math.exp(btcLnAt(btcNowDay)); // scale so BTC(now) == SPX(now)

const futCap = FUT * 365.25;
const btcPlot = [];
for (const b of btc) { const ax = spxAgeForBtcDay(b.age); if (ax < 0 || ax > futCap) continue; btcPlot.push({ age: ax, price: b.price * anchor, fut: ax > spxMaxAge }); }
const past = btcPlot.filter(p => !p.fut), future = btcPlot.filter(p => p.fut);

// projection stats
const futPeak = future.reduce((m, p) => p.price > m.price ? p : m, { price: 0 });
const afterPeak = future.filter(p => p.age > futPeak.age);
const futTrough = afterPeak.length ? afterPeak.reduce((m, p) => p.price < m.price ? p : m, { price: Infinity }) : null;
const moAt = p => ((p.age - spxMaxAge) / 30.44).toFixed(0);

// ---- render ----
const W = 1200, H = 700, mL = 96, mR = 40, mT = 158, mB = 84;
const pW = W - mL - mR, pH = H - mT - mB;
const xMax = futCap;
const prices = [...spx.map(s => s.price), ...btcPlot.map(b => b.price)];
const yMin = Math.min(...prices) * 0.8, yMax = Math.max(...prices) * 1.3;
const X = age => mL + (age / xMax) * pW;
const Y = p => mT + ((Math.log(yMax) - Math.log(p)) / (Math.log(yMax) - Math.log(yMin))) * pH;
const poly = pts => pts.map(p => `${X(p.age).toFixed(1)},${Y(p.price).toFixed(1)}`).join(" ");

let grid = "";
for (const v of [0.001, 0.01, 0.1, 1, 10].filter(v => v >= yMin && v <= yMax)) {
  const yy = Y(v).toFixed(1);
  grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`;
  grid += `<text x="${mL - 14}" y="${+yy + 6}" fill="#64748b" font-size="22" text-anchor="end" font-family="sans-serif">$${v}</text>`;
}
for (let y = 0; y <= xMax / 365.25; y++) grid += `<text x="${X(y * 365.25).toFixed(1)}" y="${H - 40}" fill="#64748b" font-size="22" text-anchor="middle" font-family="sans-serif">${y}y</text>`;

const nowX = X(spxMaxAge).toFixed(1);
const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<text x="64" y="56" fill="#94a3b8" font-size="30" font-weight="700" letter-spacing="3" font-family="sans-serif">SPX6900</text>
<text x="64" y="104" fill="#e2e8f0" font-size="34" font-weight="700" font-family="sans-serif">If SPX6900 keeps rhyming with Bitcoin — the road ahead</text>
<text x="64" y="142" fill="#64748b" font-size="22" font-family="sans-serif">BTC age-aligned${SHIFT ? ` (${SHIFT > 0 ? "+" : ""}${SHIFT}d)` : " (1:1, raw)"}, anchored to SPX's price today · illustrative, NOT a forecast</text>
${grid}
<line x1="${nowX}" y1="${mT}" x2="${nowX}" y2="${H - mB}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4 5"/>
<text x="${nowX}" y="${mT - 8}" fill="#94a3b8" font-size="20" text-anchor="middle" font-family="sans-serif">TODAY</text>
<polyline points="${poly(past)}" fill="none" stroke="#f7931a" stroke-width="2" stroke-opacity="0.35"/>
<polyline points="${poly(future)}" fill="none" stroke="#f7931a" stroke-width="3" stroke-dasharray="7 6"/>
<polyline points="${poly(spx)}" fill="none" stroke="#4ade80" stroke-width="3.4"/>
${futPeak.price ? `<circle cx="${X(futPeak.age)}" cy="${Y(futPeak.price)}" r="6" fill="#f7931a"/><text x="${X(futPeak.age)}" y="${Y(futPeak.price) - 14}" fill="#fbbf24" font-size="22" font-weight="700" text-anchor="middle" font-family="sans-serif">~$${futPeak.price.toFixed(2)} (${(futPeak.price / spxNow).toFixed(0)}x, +${moAt(futPeak)}mo)</text>` : ""}
<circle cx="${nowX}" cy="${Y(spxNow)}" r="6" fill="#4ade80"/>
<rect x="${W - mR - 300}" y="${mT + 10}" width="22" height="6" rx="3" fill="#4ade80"/><text x="${W - mR - 268}" y="${mT + 20}" fill="#cbd5e1" font-size="22" font-family="sans-serif">SPX6900 (actual)</text>
<rect x="${W - mR - 300}" y="${mT + 40}" width="22" height="6" rx="3" fill="#f7931a"/><text x="${W - mR - 268}" y="${mT + 50}" fill="#cbd5e1" font-size="22" font-family="sans-serif">BTC analog (dashed = ahead)</text>
<text x="64" y="${H - 12}" fill="#475569" font-size="19" font-family="sans-serif">spx6900rainbow.xyz · BTC analog, anchored at today · illustrative scenario, NOT financial advice or a price target</text>
</svg>`;

const out = `bot-preview-btcroadmap${SHIFT ? `-${SHIFT}` : ""}.png`;
writeFileSync(out, new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
console.log(`SHIFT ${SHIFT}d · SPX today $${spxNow.toFixed(3)} = BTC age ${btcNowDay}d ($${Math.exp(btcLnAt(btcNowDay)).toFixed(2)})`);
console.log(`projected peak ~$${futPeak.price.toFixed(2)} (${(futPeak.price / spxNow).toFixed(1)}x) at +${moAt(futPeak)}mo` + (futTrough ? ` · then trough ~$${futTrough.price.toFixed(2)} at +${moAt(futTrough)}mo` : ""));
console.log(`-> ${out}`);
