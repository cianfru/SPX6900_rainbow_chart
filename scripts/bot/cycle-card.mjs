// "SPX6900 is tracing Bitcoin's last cycle" — the RHYME card. Overlays SPX6900's
// real price (left axis, green) with Bitcoin's real price (right axis, orange),
// time-aligned so BTC's Aug-'22 bottom sits under today. The point people keep
// asking about ("why do we say we're at BTC Aug '22?") drawn out: SPX retraced
// BTC's 2021 DOUBLE TOP (Apr & Nov) → 2022 bottom, the two cycles peaking weeks
// apart on the aligned clock. Each asset on its OWN scale (the timing rhymes, the
// amplitude doesn't), so it's an honest shape overlay — not a beta-scaled forecast.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { btcCycleProjection } from "../../src/btc-cycle.js";
import { logoMark } from "./logos.mjs";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fBtc = v => v >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + Math.round(v);
const fSpx = v => v >= 1 ? "$" + v.toFixed(2) : "$" + v.toFixed(v < 0.01 ? 4 : v < 0.1 ? 3 : 2);
// decade-ish ticks within a [min,max] range for a log axis
const decadeTicks = (lo, hi, cand) => cand.filter(v => v >= lo * 0.92 && v <= hi * 1.08);

export function cycleSyncSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const c = btcCycleProjection();
  const SPX0 = new Date(DEFAULT_RAW[0].date).getTime();
  const spx = DEFAULT_RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price })).sort((a, b) => a.ts - b.ts);
  const anchorTs = c.anchorTs;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 86, mR = 92, mT = 92, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = SPX0, xMax = c.histFwd.at(-1)?.[0] ?? anchorTs;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;

  // independent log scales: SPX on the left, BTC on the right
  let sMin = Infinity, sMax = -Infinity; for (const p of spx) { if (p.price < sMin) sMin = p.price; if (p.price > sMax) sMax = p.price; }
  sMin *= 0.7; sMax *= 1.4;
  let bMin = Infinity, bMax = -Infinity; for (const [, v] of [...c.histPts, ...c.histFwd]) { if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
  bMin *= 0.7; bMax *= 1.4;
  const yL = v => mT + ((Math.log(sMax) - Math.log(v)) / ((Math.log(sMax) - Math.log(sMin)) || 1)) * pH;
  const yR = v => mT + ((Math.log(bMax) - Math.log(v)) / ((Math.log(bMax) - Math.log(bMin)) || 1)) * pH;

  // left ($ SPX) + right ($ BTC) axis labels
  let grid = "";
  for (const t of decadeTicks(sMin, sMax, [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3])) {
    const yy = yL(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.05)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#4ade80" font-size="22" text-anchor="end" font-family="sans-serif">${fSpx(t)}</text>`;
  }
  for (const t of decadeTicks(bMin, bMax, [1000, 3000, 10000, 20000, 30000, 50000, 69000, 100000])) {
    grid += `<text x="${mL + pW + 10}" y="${(yR(t) + 5).toFixed(1)}" fill="#f7931a" font-size="22" font-family="sans-serif">${fBtc(t)}</text>`;
  }

  // vertical guides at the two aligned double-top dates + the NOW line
  let guides = "";
  for (const pk of c.peaks) {
    const gx = x(pk.ts).toFixed(1);
    guides += `<line x1="${gx}" y1="${mT}" x2="${gx}" y2="${mT + pH}" stroke="rgba(247,147,26,0.28)" stroke-dasharray="3 7"/>`;
    guides += `<text x="${gx}" y="${mT + 18}" fill="#f7931a" font-size="15" text-anchor="middle" font-family="sans-serif">BTC ${pk.label}</text>`;
  }
  const nx = x(anchorTs).toFixed(1);
  guides += `<line x1="${nx}" y1="${mT}" x2="${nx}" y2="${mT + pH}" stroke="rgba(226,232,240,0.5)" stroke-dasharray="5 5"/>`;
  guides += `<text x="${nx}" y="${mT + 18}" fill="#e2e8f0" font-size="15" text-anchor="end" font-family="sans-serif">today ≈ BTC ${fMon(c.btcFrom.getTime())} </text>`;

  // x-axis year labels
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="23" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const btcSolid = c.histPts.map(([t, v]) => `${x(t).toFixed(1)},${yR(v).toFixed(1)}`).join(" ");
  const btcDash = c.histFwd.map(([t, v]) => `${x(t).toFixed(1)},${yR(v).toFixed(1)}`).join(" ");
  const spxLine = spx.map(p => `${x(p.ts).toFixed(1)},${yL(p.price).toFixed(1)}`).join(" ");
  const spxArea = `${x(spx[0].ts).toFixed(1)},${(mT + pH).toFixed(1)} ${spxLine} ${x(spx.at(-1).ts).toFixed(1)},${(mT + pH).toFixed(1)}`;
  // BTC peak dots (on the BTC scale)
  let dots = "";
  for (const pk of c.peaks) dots += `<circle cx="${x(pk.ts).toFixed(1)}" cy="${yR(pk.btc).toFixed(1)}" r="5" fill="#f7931a"/>`;
  // end-of-line coin tags (same as the other cards): the SPX coin at the green
  // line's end (today), the BTC coin at the orange line's end (its real recovery).
  const sx = x(anchorTs), sy = yL(price);
  const be = c.histFwd.at(-1) ?? c.histPts.at(-1);
  const bx = x(be[0]), by = yR(be[1]), CO = 38;
  const endCoin = (kind, cx, cy, stroke) =>
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(CO / 2 + 3).toFixed(1)}" fill="#05050e" stroke="${stroke}" stroke-width="2"/>`
    + logoMark(kind, cx - CO / 2, cy - CO / 2, CO);

  // legend chip (top-left, clear of the launch run)
  const lx = mL + 16, ly = mT + 14;
  const legend = `<rect x="${lx}" y="${ly}" width="246" height="70" rx="9" fill="rgba(5,5,14,0.62)" stroke="rgba(255,255,255,0.10)"/>`
    + `<rect x="${lx + 14}" y="${ly + 16}" width="24" height="7" rx="3.5" fill="#4ade80"/><text x="${lx + 48}" y="${ly + 24}" fill="#cbd5e1" font-size="20" font-family="sans-serif">SPX6900 (left)</text>`
    + `<rect x="${lx + 14}" y="${ly + 44}" width="24" height="7" rx="3.5" fill="#f7931a"/><text x="${lx + 48}" y="${ly + 52}" fill="#cbd5e1" font-size="20" font-family="sans-serif">Bitcoin, aligned (right)</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="cyTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="#f7931a" stop-opacity="0.14"/><stop offset="60%" stop-color="#f7931a" stop-opacity="0"/></radialGradient>
  <radialGradient id="cyG" cx="6%" cy="92%" r="60%"><stop offset="0%" stop-color="#22c55e" stop-opacity="0.16"/><stop offset="70%" stop-color="#22c55e" stop-opacity="0"/></radialGradient>
  <linearGradient id="cySpxFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.24"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0"/></linearGradient>
  <filter id="cyGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#cyG)"/>
<rect width="${W}" height="${H}" fill="url(#cyTop)"/>
${grid}${guides}
<polygon points="${spxArea}" fill="url(#cySpxFill)"/>
<polyline points="${btcSolid}" fill="none" stroke="#f7931a" stroke-width="9" stroke-opacity="0.18" filter="url(#cyGlow)"/>
<polyline points="${btcSolid}" fill="none" stroke="#f7931a" stroke-width="3" stroke-opacity="0.95"/>
<polyline points="${btcDash}" fill="none" stroke="#f7931a" stroke-width="3" stroke-opacity="0.85" stroke-dasharray="7 6"/>
${dots}
<polyline points="${spxLine}" fill="none" stroke="#4ade80" stroke-width="10" stroke-opacity="0.2" filter="url(#cyGlow)"/>
<polyline points="${spxLine}" fill="none" stroke="#4ade80" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${endCoin("btc", bx, by, "#f7931a")}
${endCoin("spx", sx, sy, "#4ade80")}
${xlab}
${logoMark("spx", 64, 18, 34)}${logoMark("btc", 104, 18, 34)}
<text x="150" y="42" fill="#e2e8f0" font-size="27" font-weight="700" font-family="sans-serif" letter-spacing="1">SPX6900 vs BITCOIN'S LAST CYCLE</text>
<text x="${W - mR}" y="42" fill="#f7931a" font-size="24" font-weight="800" font-family="sans-serif" text-anchor="end">now ≈ BTC ${fMon(c.btcFrom.getTime())}</text>
<text x="64" y="70" fill="#94a3b8" font-size="21" font-family="sans-serif">SPX retraced BTC's 2021 double top (Apr &amp; Nov) → 2022 bottom — weeks apart, aligned</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · each on its own scale, aligned in time</text>
</svg>`;
}

export function renderCycleSyncCard(stats, opts = {}) { return png(cycleSyncSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
