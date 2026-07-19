// "SOPR — Spent Output Profit Ratio" card. When coins actually MOVE on-chain, were they
// sold at a profit or a loss? SOPR = realized value ÷ cost of every coin that moved that
// week, from the LOCAL FIFO per-lot engine. Above 1 = coins moving at a profit (green),
// below 1 = at a loss / capitulation (red). The classic Glassnode oscillator, pinned at the
// 1.0 break-even. Bottoms cluster where SOPR dips under 1 and holders refuse to realise
// losses. Data: stats.fifo (sopr per weekly window, src/spx-fifo.js). A behaviour POSITION,
// not a signal. Edge-bright zones in the HODL-waves house style.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GRN = "#34d399", RED = "#fb7185";

export function soprSvg(stats, opts = {}) {
  const raw = (stats.fifo || []).filter(r => Number.isFinite(r.sopr) && r.sopr > 0 && r.d)
    .map(r => ({ ts: Date.parse(r.d), v: r.sopr })).sort((a, b) => a.ts - b.ts);
  if (raw.length < 50) return null;
  const cur = raw.at(-1), sopr = cur.v;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 92, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  // clamp the display so a single spike doesn't flatten the 1.0 line; center on 1.0
  const vals = raw.map(r => r.v);
  const lo = Math.max(0.4, Math.min(...vals) - 0.05), hi = Math.min(1.6, Math.max(...vals) + 0.05);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * pH;
  const oneY = y(1);

  // zones: green above 1.0 (profit), red below (loss) — edge-bright, fading toward 1.0
  const zones = `<rect x="${mL}" y="${mT}" width="${pW}" height="${(oneY - mT).toFixed(1)}" fill="url(#soG)"/>`
    + `<rect x="${mL}" y="${oneY.toFixed(1)}" width="${pW}" height="${(mT + pH - oneY).toFixed(1)}" fill="url(#soR)"/>`;
  const zoneLabels =
    `<text x="${W - mR - 12}" y="${(y(hi) + 30).toFixed(1)}" fill="#6ee7b7" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">selling at a profit</text>`
    + `<text x="${W - mR - 12}" y="${(y(lo) - 16).toFixed(1)}" fill="#fecdd3" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">selling at a loss</text>`;

  let grid = "";
  for (const v of [lo, (lo + 1) / 2, 1, (1 + hi) / 2, hi]) {
    const yy = y(v).toFixed(1), is1 = Math.abs(v - 1) < 1e-9;
    grid += `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#e2e8f0" font-size="25" font-weight="600" text-anchor="end" font-family="sans-serif">${v.toFixed(2)}</text>`;
    if (!is1) grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#cbd5e1" font-size="26" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const line = raw.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
  const col = sopr >= 1 ? GRN : RED;
  const curX = x(cur.ts), curY = y(sopr);
  const state = sopr >= 1.02 ? "coins moving at a profit" : sopr <= 0.98 ? "coins moving at a loss" : "coins moving near break-even";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sobg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="soG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.45"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0.03"/></linearGradient>
<linearGradient id="soR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${RED}" stop-opacity="0.03"/><stop offset="100%" stop-color="${RED}" stop-opacity="0.45"/></linearGradient>
<filter id="soglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sobg)"/>
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — SOPR</text>
<text x="60" y="92" fill="#aab6c8" font-size="22" font-family="sans-serif">When coins move, are they sold at a profit or a loss? Above 1 = profit, below 1 = loss.</text>
<text x="60" y="130" fill="${col}" font-size="32" font-weight="800" font-family="sans-serif">${sopr.toFixed(2)} — ${state}</text>
${zones}${grid}${xlab}${zoneLabels}
<line x1="${mL}" y1="${oneY.toFixed(1)}" x2="${W - mR}" y2="${oneY.toFixed(1)}" stroke="#f8fafc" stroke-width="2.5" stroke-dasharray="7 6"/>
<text x="${W - mR - 8}" y="${(oneY - 12).toFixed(1)}" fill="#f8fafc" font-size="22" font-weight="600" text-anchor="end" font-family="sans-serif">break-even 1.0</text>
<polyline points="${line}" fill="none" stroke="#cbd5e1" stroke-width="11" stroke-opacity="0.22" stroke-linejoin="round" stroke-linecap="round" filter="url(#soglow)"/>
<polyline points="${line}" fill="none" stroke="#e2e8f0" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="12" fill="${col}" stroke="#05050e" stroke-width="3"/>
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · realized value ÷ cost of coins that moved, weekly (FIFO per-lot)")}</text>
</svg>`;
}

export function renderSoprCard(stats, opts = {}) {
  const svg = soprSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
