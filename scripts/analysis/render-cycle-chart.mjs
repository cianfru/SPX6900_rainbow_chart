// Renders the BTC Cycle tab (band-map projection engine) as a PNG so it can be
// previewed without running the app. Mirrors src/BtcCycleChart.jsx exactly.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { buildModel } from "../../src/models.js";
import { BTC_HISTORY } from "../../src/btc-history.js";

const DAY = 86400000, YR = 365.25;
const SHIFT = 3395, FUT_YEARS = 6.5;
const U_BOT = 0.08, SPX_C1_PEAK_U = 0.84, DECAY_MID = 0.83, DECAY_LO = 0.61, DECAY_HI = 1.0;

// BTC rainbow (fitted constants, see band-map.mjs)
const BTC_T0 = 345, BTC_A = 5.03, BTC_B = -32.24;
const btcPredict = d => BTC_A * Math.log(Math.max(1, d) + BTC_T0) + BTC_B;
const btcMaxAge = BTC_HISTORY.at(-1)[0];
const bmap = new Map(BTC_HISTORY.map(([a, p]) => [a, Math.log(p)]));
const btcLnAt = a => {
  let lo = Math.floor(a), hi = Math.ceil(a);
  while (lo > 0 && !bmap.has(lo)) lo--; while (hi < btcMaxAge && !bmap.has(hi)) hi++;
  const x = bmap.get(lo), y = bmap.get(hi); if (x == null) return y; if (y == null) return x;
  return x + (y - x) * ((a - lo) / ((hi - lo) || 1));
};
const res = BTC_HISTORY.map(([a, p]) => Math.log(p) - btcPredict(a)).sort((x, y) => x - y);
const pct = q => { const i = q * (res.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return res[lo] + (res[hi] - res[lo]) * (i - lo); };
const BL = pct(0.02), BH = pct(0.98);
const uBtc = age => (btcLnAt(age) - btcPredict(age) - BL) / (BH - BL);

const m = buildModel(DEFAULT_RAW);
const span = m.bands[8] - m.bands[0];
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const anchorAge = Math.round((new Date(DEFAULT_RAW.at(-1).date).getTime() - SPX0) / DAY);
const anchorLn = Math.log(DEFAULT_RAW.at(-1).price);
const uSpxNow = (anchorLn - m.predict(anchorAge + 1) - m.bands[0]) / span;
const uBtcNow = uBtc(SHIFT + anchorAge);
let uBtcBot = 9; for (let a = anchorAge; a <= anchorAge + 1100; a += 2) { const v = uBtc(SHIFT + a); if (v < uBtcBot) uBtcBot = v; }
let uBtcPeak = -9; for (let a = anchorAge; a <= FUT_YEARS * YR; a += 2) { const bd = SHIFT + a; if (bd > btcMaxAge) break; const v = uBtc(bd); if (v > uBtcPeak) uBtcPeak = v; }
const makeMapU = d => {
  const x0 = uBtcBot, x1 = uBtcNow, x2 = uBtcPeak, y0 = U_BOT, y1 = uSpxNow, y2 = SPX_C1_PEAK_U * d;
  const s1 = (y1 - y0) / (x1 - x0), s2 = (y2 - y1) / (x2 - x1);
  const m0 = s1, m2 = s2, m1 = s1 * s2 <= 0 ? 0 : 2 * s1 * s2 / (s1 + s2);
  return v => {
    if (v <= x0) return y0; if (v >= x2) return y2;
    const [xa, xb, ya, yb, ma, mb] = v < x1 ? [x0, x1, y0, y1, m0, m1] : [x1, x2, y1, y2, m1, m2];
    const h = xb - xa, t = (v - xa) / h, t2 = t * t, t3 = t2 * t;
    return ya * (2 * t3 - 3 * t2 + 1) + ma * h * (t3 - 2 * t2 + t) + yb * (-2 * t3 + 3 * t2) + mb * h * (t3 - t2);
  };
};
const maps = { [DECAY_LO]: makeMapU(DECAY_LO), [DECAY_MID]: makeMapU(DECAY_MID), [DECAY_HI]: makeMapU(DECAY_HI) };
const proj = (a, d) => Math.exp(m.predict(a + 1) + m.bands[0] + maps[d](uBtc(SHIFT + a)) * span);
const bubbleAt = a => Math.exp(m.predict(a + 1) + m.bands[8]);
const fireAt = a => Math.exp(m.predict(a + 1) + m.bands[0]);

// series
const spxPts = DEFAULT_RAW.map(r => ({ age: Math.round((new Date(r.date).getTime() - SPX0) / DAY), p: r.price }));
const futCap = FUT_YEARS * YR;
const projPts = [], coneLo = [], coneHi = [], bub = [], fire = [];
for (let a = 0; a <= futCap; a += 5) {
  bub.push({ age: a, p: bubbleAt(a) }); fire.push({ age: a, p: fireAt(a) });
  const bd = SHIFT + a;
  if (a >= anchorAge && bd <= btcMaxAge) { projPts.push({ age: a, p: proj(a, DECAY_MID) }); coneLo.push({ age: a, p: proj(a, DECAY_LO) }); coneHi.push({ age: a, p: proj(a, DECAY_HI) }); }
}
let peak = projPts.reduce((mm, q) => q.p > mm.p ? q : mm, { p: 0 });
const peakLoP = proj(peak.age, DECAY_LO), peakHiP = proj(peak.age, DECAY_HI);

// shape r (price overlay)
{ const xs = [], ys = []; for (const q of spxPts) { const bd = SHIFT + q.age; if (bd <= btcMaxAge) { xs.push(Math.log(q.p)); ys.push(btcLnAt(bd)); } }
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  globalThis.R = sxy / Math.sqrt(sxx * syy); }

// ---- SVG
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
// halvings + NOW
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
