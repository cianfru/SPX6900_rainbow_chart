// "365D Running ROI" card (à la Into the Cryptoverse): at each date, the return
// you'd have if you'd bought SPX6900 exactly 365 days earlier — price(t) /
// price(t−365d). A green 1× line is break-even; above = a profitable year, below =
// a year underwater. Dual log axes: price (left, blue) + ROI (right, red).
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const YEAR = 365 * 86400000;

export function runningRoiSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  // Draw from the bundled history extended to today (snapshot); default to bundled.
  const RAW = (opts.series && opts.series.length) ? opts.series : DEFAULT_RAW;
  const pts = RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price })).sort((a, b) => a.ts - b.ts);
  const priceAtTs = target => { let best = null, bd = Infinity; for (const p of pts) { const d = Math.abs(p.ts - target); if (d < bd) { bd = d; best = p; } } return bd <= 18 * 86400000 ? best.price : null; };
  const roi = pts.map(p => { const prev = priceAtTs(p.ts - YEAR); return prev ? { ts: p.ts, v: p.price / prev } : null; }).filter(Boolean);
  const curPrev = priceAtTs(Date.parse(dateStr) - YEAR) ?? priceAtTs(pts.at(-1).ts - YEAR);
  const curRoi = curPrev ? price / curPrev : (roi.at(-1)?.v ?? 1);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 78, mT = 92, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  // Start the chart where the ROI line begins (needs 1y of prior data) — the
  // pre-ROI price-only stretch is just dead space. Price + ROI share the window.
  const xMin = roi.length ? roi[0].ts : pts[0].ts, xMax = pts.at(-1).ts;
  const shown = pts.filter(p => p.ts >= xMin);
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  let pMin = Infinity, pMax = -Infinity; for (const p of shown) { if (p.price < pMin) pMin = p.price; if (p.price > pMax) pMax = p.price; } pMin *= 0.7; pMax *= 1.35;
  const yP = v => mT + ((Math.log(pMax) - Math.log(v)) / ((Math.log(pMax) - Math.log(pMin)) || 1)) * pH;
  let rMin = 1, rMax = 1; for (const r of roi) { if (r.v < rMin) rMin = r.v; if (r.v > rMax) rMax = r.v; } rMin *= 0.7; rMax *= 1.35;
  const yR = v => mT + ((Math.log(rMax) - Math.log(v)) / ((Math.log(rMax) - Math.log(rMin)) || 1)) * pH;

  let grid = "";
  for (const t of [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= pMin && v <= pMax)) {
    const yy = yP(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.05)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="26" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let rtick = "";
  for (const v of [0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50].filter(v => v >= rMin && v <= rMax)) {
    rtick += `<text x="${mL + pW + 10}" y="${(yR(v) + 5).toFixed(1)}" fill="${v === 1 ? "#4ade80" : "#a06a72"}" font-size="24" font-weight="${v === 1 ? 700 : 400}" font-family="sans-serif">${v}×</text>`;
  }
  const oneY = yR(1).toFixed(1);
  const beLine = `<line x1="${mL}" y1="${oneY}" x2="${mL + pW}" y2="${oneY}" stroke="#4ade80" stroke-width="2" stroke-opacity="0.85"/>`;
  const priceLine = shown.map(p => `${x(p.ts).toFixed(1)},${yP(p.price).toFixed(1)}`).join(" ");
  const priceArea = shown.length ? `${x(shown[0].ts).toFixed(1)},${(mT + pH).toFixed(1)} ${priceLine} ${x(shown.at(-1).ts).toFixed(1)},${(mT + pH).toFixed(1)}` : "";
  const roiLine = roi.map(r => `${x(r.ts).toFixed(1)},${yR(r.v).toFixed(1)}`).join(" ");
  const roiArea = roi.length ? `${x(roi[0].ts).toFixed(1)},${(mT + pH).toFixed(1)} ${roiLine} ${x(roi.at(-1).ts).toFixed(1)},${(mT + pH).toFixed(1)}` : "";
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 44}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  const dc = curRoi >= 1 ? "#4ade80" : "#f87171";
  const pct = Math.round((curRoi - 1) * 100);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="roiTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="${dc}" stop-opacity="0.18"/><stop offset="60%" stop-color="${dc}" stop-opacity="0"/></radialGradient>
  <radialGradient id="roiV" cx="96%" cy="94%" r="62%"><stop offset="0%" stop-color="#7c3aed" stop-opacity="0.20"/><stop offset="70%" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
  <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f87171" stop-opacity="0.36"/><stop offset="100%" stop-color="#f87171" stop-opacity="0"/></linearGradient>
  <linearGradient id="roiPxFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.20"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/></linearGradient>
  <filter id="roiGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#roiV)"/>
<rect width="${W}" height="${H}" fill="url(#roiTop)"/>
${grid}${rtick}${beLine}
<polygon points="${priceArea}" fill="url(#roiPxFill)"/>
<polygon points="${roiArea}" fill="url(#roiFill)"/>
<polyline points="${priceLine}" fill="none" stroke="#38bdf8" stroke-width="9" stroke-opacity="0.18" filter="url(#roiGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="#38bdf8" stroke-width="3.4" stroke-opacity="0.95" stroke-linejoin="round"/>
<polyline points="${roiLine}" fill="none" stroke="#f87171" stroke-width="10" stroke-opacity="0.24" filter="url(#roiGlow)"/>
<polyline points="${roiLine}" fill="none" stroke="#f87171" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>
${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — 365D RUNNING ROI</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${curRoi.toFixed(2)}× · ${pct >= 0 ? "+" : ""}${pct}% (1yr)</text>
<text x="64" y="70" font-size="26" font-family="sans-serif"><tspan fill="#38bdf8" font-weight="700">— price</tspan><tspan fill="#64748b">    </tspan><tspan fill="#f87171" font-weight="700">— 365D ROI</tspan><tspan fill="#64748b">    </tspan><tspan fill="#4ade80" font-weight="700">— break-even (1×)</tspan></text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · price ÷ price 365d ago</text>
</svg>`;
}

export function renderRunningRoiCard(stats, opts = {}) { return png(runningRoiSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), opts.W ?? 1200); }
