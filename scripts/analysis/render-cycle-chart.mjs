// Renders the BTC Cycle tab (idealized-cycle engine) as a PNG preview.
// Mirrors src/BtcCycleChart.jsx.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { buildModel } from "../../src/models.js";

const DAY = 86400000, YR = 365.25, FUT_YEARS = 6.5;
const BOTTOM_DATE = "2026-10-15", TOP_DATE = "2029-09-15", END_DATE = "2030-06-15";
const U_BOTTOM = -0.03, U_TOP = 0.72, U_END = 0.46, BULL_EXP = 1.8, BEAR_EXP = 0.7, AMP_LO = 0.78, AMP_HI = 1.25;

const m = buildModel(DEFAULT_RAW);
const SPAN = m.bands[8] - m.bands[0];
const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
const ageOf = d => Math.round((new Date(d).getTime() - SPX0) / DAY);
const anchorAge = ageOf(DEFAULT_RAW.at(-1).date);
const uNow = (Math.log(DEFAULT_RAW.at(-1).price) - m.predict(anchorAge + 1) - m.bands[0]) / SPAN;
const bottomAge = ageOf(BOTTOM_DATE), topAge = ageOf(TOP_DATE), endAge = ageOf(END_DATE);
const uCurve = (age, amp) => {
  let u;
  if (age <= bottomAge) { const q = (age - anchorAge) / (bottomAge - anchorAge); u = uNow + (U_BOTTOM - uNow) * (0.5 - 0.5 * Math.cos(Math.PI * q)); }
  else if (age <= topAge) { const p = (age - bottomAge) / (topAge - bottomAge); u = U_BOTTOM + (U_TOP - U_BOTTOM) * Math.pow(p, BULL_EXP); }
  else { const q = Math.min(1, (age - topAge) / (endAge - topAge)); u = U_TOP - (U_TOP - U_END) * Math.pow(q, BEAR_EXP); }
  return uNow + (u - uNow) * amp;
};
const proj = (age, amp) => Math.exp(m.predict(age + 1) + m.bands[0] + uCurve(age, amp) * SPAN);
const bubbleAt = a => Math.exp(m.predict(a + 1) + m.bands[8]);
const fireAt = a => Math.exp(m.predict(a + 1) + m.bands[0]);

const spxPts = DEFAULT_RAW.map(r => ({ age: ageOf(r.date), p: r.price }));
const futCap = FUT_YEARS * YR;
const projPts = [], coneLo = [], coneHi = [], bub = [], fire = [];
for (let a = 0; a <= futCap; a += 5) {
  bub.push({ age: a, p: bubbleAt(a) }); fire.push({ age: a, p: fireAt(a) });
  if (a >= anchorAge) { projPts.push({ age: a, p: proj(a, 1) }); coneLo.push({ age: a, p: proj(a, AMP_LO) }); coneHi.push({ age: a, p: proj(a, AMP_HI) }); }
}
const peak = projPts.reduce((mm, q) => q.p > mm.p ? q : mm, { p: 0 });
let low = { p: 9, age: 0 };
for (let a = anchorAge; a <= bottomAge + 120; a += 2) { const p = proj(a, 1); if (p < low.p) low = { p, age: a }; }
const peakLoP = proj(peak.age, AMP_LO), peakHiP = proj(peak.age, AMP_HI);

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
const stat = (x, k, v, c) => `<text x="${x}" y="66" fill="#94a3b8" font-size="16" letter-spacing="2" text-anchor="middle" font-family="monospace">${k}</text><text x="${x}" y="104" fill="${c}" font-size="32" font-weight="700" text-anchor="middle" font-family="monospace">${v}</text>`;
const peakDate = new Date(SPX0 + peak.age * DAY).toLocaleDateString("en-US", { month: "short", year: "numeric" });

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<text x="${W / 2}" y="30" fill="#94a3b8" font-size="20" font-weight="700" letter-spacing="3" text-anchor="middle" font-family="sans-serif">BTC CYCLE — WHAT IF</text>
${stat(W * 0.17, "CYCLE LOW", fmtP(low.p), "#38bdf8")}
${stat(W * 0.39, "CYCLE PEAK", peakDate, "#a78bfa")}
${stat(W * 0.61, "PROJECTED PEAK", fmtP(peak.p), "#fbbf24")}
${stat(W * 0.83, "PEAK RANGE", fmtP(peakLoP) + "–" + fmtP(peakHiP), "#f7931a")}
${grid}${marks}
<path d="${path(bub)}" fill="none" stroke="#a78bfa" stroke-width="1.6" stroke-dasharray="3 4" stroke-opacity="0.85"/>
<path d="${path(fire)}" fill="none" stroke="#38bdf8" stroke-width="1.4" stroke-dasharray="3 4" stroke-opacity="0.7"/>
<path d="${cone}" fill="#f7931a" fill-opacity="0.13"/>
<path d="${path(projPts)}" fill="none" stroke="#f7931a" stroke-width="2.6" stroke-dasharray="7 6"/>
<path d="${path(spxPts)}" fill="none" stroke="#4ade80" stroke-width="2.6"/>
<text x="${W / 2}" y="${H - 10}" fill="#475569" font-size="16" text-anchor="middle" font-family="sans-serif">green = SPX actual · orange dashed = idealized cycle on the halving clock · purple/blue = bubble / fire-sale bands · fixed Jun 9 2026 · NFA</text>
</svg>`;
writeFileSync("bot-preview-btccycle-tab.png", new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
console.log(`low ${fmtP(low.p)} · peak ${fmtP(peak.p)} (${peakDate}) cone ${fmtP(peakLoP)}–${fmtP(peakHiP)} -> bot-preview-btccycle-tab.png`);
