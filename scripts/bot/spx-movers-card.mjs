// EXPERIMENT — "SPX6900 vs its closest movers" from-inception comparison. The two coins
// that track SPX most on daily returns (Dune study): the memecoin BITCOIN (HPOS10I, #1) and
// AIXBT (#2). Rebased to 1× at each coin's OWN launch and plotted vs days-since-inception, so
// you see how each did from day zero. The honest twist: both round-tripped — BITCOIN back to
// ~flat, AIXBT below launch — while SPX is the lone survivor. Same daily heartbeat, wildly
// different destinies. A for-fun curiosity, NOT a signal. Data: bundles (no live fetch).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { SPX_DAILY } from "../../src/spx-daily.js";
import { BITCOIN_MEME } from "../../src/bitcoin-meme.js";
import { AIXBT } from "../../src/aixbt.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const DAY = 86400000;
const COINS = [
  { key: "SPX6900", data: SPX_DAILY, c: "#5eead4" },
  { key: "BITCOIN", data: BITCOIN_MEME, c: "#fb923c" },
  { key: "AIXBT", data: AIXBT, c: "#c084fc" },
];
const fMult = m => m >= 100 ? Math.round(m) + "×" : m >= 10 ? m.toFixed(0) + "×" : m >= 1 ? m.toFixed(1) + "×" : m.toFixed(2) + "×";

let _cache = null;
export function spxMoversStats() {
  if (_cache) return _cache;
  const out = COINS.map(({ key, data, c }) => {
    const t0 = Date.parse(data[0][0]), p0 = data[0][1];
    const pts = data.map(([d, v]) => ({ age: (Date.parse(d) - t0) / DAY, m: v / p0 }));
    let peak = pts[0];
    for (const p of pts) if (p.m > peak.m) peak = p;
    return { key, c, pts, now: pts.at(-1).m, peak, ageDays: pts.at(-1).age };
  });
  return (_cache = out);
}

export function spxMoversSvg(opts = {}) {
  const S = spxMoversStats();
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 96;
  const narrow = W < 1160, heroFs = narrow ? 23 : 27;
  const pT = 152, pB = H - 96, footY = H - 16;
  const pW = W - mL - mR;
  const maxAge = Math.max(...S.map(s => s.ageDays));
  const x = a => mL + (a / (maxAge || 1)) * pW;

  // log y over the full multiple range across all three (rebased to 1× at launch).
  let mMin = Infinity, mMax = 0;
  for (const s of S) for (const p of s.pts) { if (p.m < mMin) mMin = p.m; if (p.m > mMax) mMax = p.m; }
  mMin = Math.min(mMin, 0.5) * 0.85; mMax *= 1.15;
  const lo = Math.log(mMin), hi = Math.log(mMax);
  const y = m => pT + ((hi - Math.log(Math.max(m, 1e-6))) / ((hi - lo) || 1)) * (pB - pT);

  // gridlines at decade-ish multiples
  let grid = "";
  for (const m of [0.5, 1, 2, 5, 10, 25, 100, 250, 500]) {
    if (m < mMin || m > mMax) continue;
    const yy = y(m).toFixed(1);
    const is1 = m === 1;
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="${is1 ? "#e2e8f0" : "rgba(255,255,255,0.07)"}" stroke-width="${is1 ? 1.6 : 1}" ${is1 ? 'stroke-dasharray="6 5" stroke-opacity="0.8"' : ""}/>`
      + `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="${is1 ? "#cbd5e1" : "#8b95a7"}" font-size="${is1 ? 19 : 20}" text-anchor="end" font-family="sans-serif">${fMult(m)}</text>`;
  }
  const y1 = y(1).toFixed(1);

  // x labels every 6 months (in years)
  let xlab = "";
  for (let d = 0; d <= maxAge; d += 182.5) {
    const yr = d / 365;
    const lbl = yr < 0.1 ? "launch" : (Number.isInteger(Math.round(yr * 2) / 2) ? (Math.round(yr * 2) / 2) + "y" : "");
    if (!lbl) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${pB + 34}" fill="#8b95a7" font-size="19" text-anchor="middle" font-family="sans-serif">${lbl}</text>`;
  }

  // one polyline per coin (up to its own age) + a faint peak dot + an endpoint dot.
  let lines = "", ends = "";
  S.forEach(s => {
    const pline = s.pts.map(p => `${x(p.age).toFixed(1)},${y(p.m).toFixed(1)}`).join(" ");
    lines += `<polyline points="${pline}" fill="none" stroke="${s.c}" stroke-width="7" stroke-opacity="0.14" stroke-linejoin="round" filter="url(#mvglow)"/>`
      + `<polyline points="${pline}" fill="none" stroke="${s.c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    ends += `<circle cx="${x(s.peak.age).toFixed(1)}" cy="${y(s.peak.m).toFixed(1)}" r="4.5" fill="${s.c}" fill-opacity="0.55"/>`
      + `<circle cx="${x(s.ageDays).toFixed(1)}" cy="${y(s.now).toFixed(1)}" r="7" fill="${s.c}" stroke="#05050e" stroke-width="2"/>`;
  });

  // stacked legend (top-right, where every line sits low): name + now + peak, so the
  // whole story reads without tracing a line back to an axis.
  const lgX = W - mR - 348, lgY = pT + 12;
  let legend = `<rect x="${lgX - 14}" y="${lgY - 22}" width="372" height="${18 + S.length * 30}" rx="10" fill="#0b0b16" fill-opacity="0.9" stroke="rgba(255,255,255,0.1)"/>`;
  S.forEach((s, i) => {
    const ly = lgY + 6 + i * 30;
    legend += `<line x1="${lgX}" y1="${ly - 5}" x2="${lgX + 24}" y2="${ly - 5}" stroke="${s.c}" stroke-width="4"/>`
      + `<text x="${lgX + 34}" y="${ly}" fill="${s.c}" font-size="17" font-weight="800" font-family="sans-serif">${esc(s.key)}</text>`
      + `<text x="${lgX + 344}" y="${ly}" text-anchor="end" fill="#e2e8f0" font-size="17" font-weight="700" font-family="sans-serif">${fMult(s.now)} now <tspan fill="#8b95a7" font-weight="400">· peak ${fMult(s.peak.m)}</tspan></text>`;
  });

  const spx = S[0];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="mvbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<filter id="mvglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#mvbg)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 vs ITS CLOSEST MOVERS</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="sans-serif">The two coins that trade most like SPX — from each one's launch day.</text>
<text x="60" y="128" fill="#f8fafc" font-size="${heroFs}" font-weight="800" font-family="sans-serif">Same daily heartbeat — <tspan fill="${spx.c}">wildly</tspan> different destinies.</text>
${grid}${xlab}
<text x="${W - mR + 8}" y="${(+y1 + 5).toFixed(1)}" fill="#cbd5e1" font-size="15" font-family="sans-serif">launch</text>
${lines}${ends}${legend}
<text x="60" y="${footY}" fill="#5b6577" font-size="15" font-family="sans-serif">${esc("spx6900rainbow.xyz · rebased to 1× at each coin's launch · days since inception · a for-fun curiosity, not a signal")}</text>
</svg>`;
}

export function renderSpxMoversCard(opts = {}) {
  const svg = spxMoversSvg(opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
