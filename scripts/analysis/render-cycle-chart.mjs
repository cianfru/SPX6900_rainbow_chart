// Renders the BTC Cycle tab (deploy #8 price-overlay engine) as a PNG preview.
// Mirrors src/BtcCycleChart.jsx exactly.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { buildModel } from "../../src/models.js";
import { BTC_HISTORY } from "../../src/btc-history.js";

const DAY = 86400000, YR = 365.25;
const SHIFT = 3395, BETA_UP = 3.5, BETA_DOWN = 0.6, SPREAD = 0.3, FUT_YEARS = 6.5;

const btcMaxAge = BTC_HISTORY.at(-1)[0];
const bmap = new Map(BTC_HISTORY.map(([a, p]) => [a, Math.log(p)]));
const btcLnAt = a => {
  let lo = Math.floor(a), hi = Math.ceil(a);
  while (lo > 0 && !bmap.has(lo)) lo--; while (hi < btcMaxAge && !bmap.has(hi)) hi++;
  const x = bmap.get(lo), y = bmap.get(hi); if (x == null) return y; if (y == null) return x;
  return x + (y - x) * ((a - lo) / ((hi - lo) || 1));
};

const m = buildModel(DEFAULT_RAW);
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const anchorAge = Math.round((new Date(DEFAULT_RAW.at(-1).date).getTime() - SPX0) / DAY);
const anchorLn = Math.log(DEFAULT_RAW.at(-1).price);
const lnBtcAnchor = btcLnAt(SHIFT + anchorAge);
const proj = (a, b) => { const z = btcLnAt(SHIFT + a) - lnBtcAnchor; return Math.exp(anchorLn + (z >= 0 ? b : BETA_DOWN) * z); };
const bubbleAt = a => Math.exp(m.predict(a + 1) + m.bands[8]);
const fireAt = a => Math.exp(m.predict(a + 1) + m.bands[0]);

const spxPts = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), p: r.price }));
const futCap = FUT_YEARS * YR;
const projPts = [], coneLo = [], coneHi = [], bub = [], fire = [];
for (let a = 0; a <= futCap; a += 5) {
  bub.push({ age: a, p: bubbleAt(a) }); fire.push({ age: a, p: fireAt(a) });
  const bd = SHIFT + a;
  if (a >= anchorAge && bd <= btcMaxAge) { projPts.push({ age: a, p: proj(a, BETA_UP) }); coneLo.push({ age: a, p: proj(a, BETA_UP - SPREAD) }); coneHi.push({ age: a, p: proj(a, BETA_UP + SPREAD) }); }
}
const peak = projPts.reduce((mm, q) => q.p > mm.p ? q : mm, { p: 0 });
const peakLoP = proj(peak.age, BETA_UP - SPREAD), peakHiP = proj(peak.age, BETA_UP + SPREAD);

{ const xs = [], ys = []; for (const q of spxPts) { const bd = SHIFT + q.age; if (bd <= btcMaxAge) { xs.push(Math.log(q.p)); ys.push(btcLnAt(bd)); } }
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  globalThis.R = sxy / Math.sqrt(sxx * syy); }

const W = 1200, H = 700, mL = 86, mR = 36, mT = 132, mB = 64;
const pW = W - mL - mR, pH = H - mT - mB;
const allP = [...spxPts.map(q => q.p), ...coneHi.map(q => q.p), ...fire.map(q => q.p), ...bub.map(q => q.p)];
const yMin = Math.min(...allP) * 0.8, yMax = Math.max(...allP) * 1.2;
const X = age => mL + (age / futCap) * pW;
const Y = p => mT + ((Math.log(yMax) - Math.log(p)) / (Math.log(yMax) - Math.log(yMin))) * pH;
const path = pts => pts.map((q, i) => `${i ? "L" : "M"}${X(q.age).toFixed(1)},${Y(q.p).toFixed(1)}`).join("");
const fmtP = p => p >= 1 ? "$" + (p >= 100 ? p.toFixed(0) : p.toFixed(2)) : "$" + p.toFixed(4);

let grid = "";
for (const v of [0.001, 0.01, 0.1, 1, 10, 100]) {
  if (v < yMin || v > yMax) continue;
  const yy = Y(v).toFixed(1);
  grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/><text x="${mL - 10}" y="${+yy + 5}" fill="#64748b" font-size="19" text-anchor="end" font-family="monospace">$${v}</text>`;
}
for (let yr = 2024; yr <= 2030; yr++) {
  const age = (Date.UTC(yr, 0, 1) - SPX0) / DAY; if (age < 0 || age > futCap) continue;
  grid += `<text x="${X(age).toFixed(1)}" y="${H - 36}" fill="#64748b" font-size="19" text-anchor="middle" font-family="monospace">${yr}</text>`;
}
let marks = "";
for (const d of ["2024-04-20", "2028-04-15"]) {
  const age = (new Date(d).getTime() - SPX0) / DAY; if (age < 0 || age > futCap) continue;
  const xx = X(age).toFixed(1);
  marks += `<line x1="${xx}" y1="${mT}" x2="${xx}" y2="${H - mB}" stroke="rgba(255,255,255,0.2)"/><text x="${+xx - 6}" y="${H - mB - 10}" fill="#94a3b8" font-size="16" font-family="sans-serif" transform="rotate(-90 ${+xx - 6} ${H - mB - 10})">BTC Halving</text>`;
}
const nowX = X(anchorAge).toFixed(1);
marks += `<line x1="${nowX}" y1="${mT}" x2="${nowX}" y2="${H - mB}" stroke="#64748b" stroke-dasharray="4 5"/><text x="${+nowX + 8}" y="${mT + 18}" fill="#94a3b8" font-size="18" font-family="sans-serif">NOW</text>`;

const cone = `M${coneLo.map(q => `${X(q.age).toFixed(1)},${Y(q.p).toFixed(1)}`).join("L")}L${[...coneHi].reverse().map(q => `${X(q.age).toFixed(1)},${Y(q.p).toFixed(1)}`).join("L")}Z`;
const stat = (x, k, v, c) => `<text x="${x}" y="66" fill="#94a3b8" font-size="17" letter-spacing="2" text-anchor="middle" font-family="monospace">${k}</text><text x="${x}" y="104" fill="${c}" font-size="34" font-weight="700" text-anchor="middle" font-family="monospace">${v}</text>`;
const peakDate = new Date(SPX0 + peak.age * DAY).toLocaleDateString("en-US", { month: "short", year: "numeric" });

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<text x="${W / 2}" y="30" fill="#94a3b8" font-size="20" font-weight="700" letter-spacing="3" text-anchor="middle" font-family="sans-serif">BTC CYCLE — WHAT IF</text>
${stat(W * 0.17, "SHAPE MATCH (r)", globalThis.R.toFixed(2), "#4ade80")}
${stat(W * 0.39, "PROJECTED LOW", fmtP(Math.min(...projPts.map(q => q.p))), "#38bdf8")}
${stat(W * 0.61, "CYCLE PEAK", peakDate, "#a78bfa")}
${stat(W * 0.83, "PROJECTED PEAK", fmtP(peak.p), "#fbbf24")}
${grid}${marks}
<path d="${path(bub)}" fill="none" stroke="#a78bfa" stroke-width="1.6" stroke-dasharray="3 4" stroke-opacity="0.85"/>
<path d="${path(fire)}" fill="none" stroke="#38bdf8" stroke-width="1.4" stroke-dasharray="3 4" stroke-opacity="0.7"/>
<path d="${cone}" fill="#f7931a" fill-opacity="0.13"/>
<path d="${path(projPts)}" fill="none" stroke="#f7931a" stroke-width="2.6" stroke-dasharray="7 6"/>
<path d="${path(spxPts)}" fill="none" stroke="#4ade80" stroke-width="2.6"/>
<text x="${W / 2}" y="${H - 10}" fill="#475569" font-size="16" text-anchor="middle" font-family="sans-serif">green = SPX actual · orange dashed = BTC-cycle path (cone ${fmtP(peakLoP)}–${fmtP(peakHiP)}) · purple/blue = bubble / fire-sale bands · fixed Jun 9 2026 · NFA</text>
</svg>`;
writeFileSync("bot-preview-btccycle-tab.png", new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
console.log(`peak ${fmtP(peak.p)} (${peakDate}) cone ${fmtP(peakLoP)}–${fmtP(peakHiP)} -> bot-preview-btccycle-tab.png`);
