// "On-Chain Positioning" card — Hyperliquid perp FUNDING rate (annualised),
// NORMALISED to its neutral baseline so the structural ~+10% APR (what longs pay
// even in a balanced book) reads as neutral, not "crowd long." Bars pivot on that
// baseline: green above (extra demand to be long), red below (leaning short). Price
// overlaid. On-chain and unmanipulable — SPX's CEX futures geo-block our collection.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + Math.round(p).toLocaleString());
const LONG = "#34d399", SHORT = "#f87171", PRICE = "#38bdf8";

export function longShortSvg(stats, opts = {}) {
  const fund = (stats.longshort || []).filter(r => r.hlFunding != null).sort((a, b) => a.date.localeCompare(b.date));
  if (fund.length < 8) return null; // data-gated — needs a bit of history

  const aprs = fund.map(r => r.hlFunding * 24 * 365 * 100);
  const neutral = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length / 2)]; // median over FULL history ≈ HL baseline
  const priceByDate = new Map((stats.drawn || []).map(r => [r.date, r.price]));
  const allRows = fund.map((r, i) => ({ ts: Date.parse(r.date), apr: aprs[i], dev: aprs[i] - neutral, price: priceByDate.get(r.date) ?? null }));
  // CARD = a tight, glanceable RECENT window so the current lean vs neutral is the clear
  // read (funding is a short-term signal; full history is noise on a card). The SITE chart
  // keeps full history + zoom. Baseline stays full-history above, so the pivot is stable.
  const WINDOW_DAYS = opts.windowDays ?? 90;
  const cutoff = allRows.at(-1).ts - WINDOW_DAYS * 86400000;
  const rows = allRows.filter(r => r.ts >= cutoff);
  const cur = rows.at(-1);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 92, mT = 84, mB = 64;
  const iT = mT, iB = H - mB, iH = iB - iT;
  const xMin = rows[0].ts, xMax = rows.at(-1).ts;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * (W - mL - mR);
  let dMin = 0, dMax = 0, pMin = Infinity, pMax = -Infinity;
  for (const r of rows) { if (r.dev < dMin) dMin = r.dev; if (r.dev > dMax) dMax = r.dev; if (r.price != null) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; } }
  const dPad = Math.max(5, (dMax - dMin) * 0.12); dMin -= dPad; dMax += dPad;
  pMin *= 0.7; pMax *= 1.4;
  const yD = d => iT + ((dMax - d) / ((dMax - dMin) || 1)) * iH;
  const yP = p => iT + ((Math.log(pMax) - Math.log(Math.max(p, 1e-9))) / ((Math.log(pMax) - Math.log(pMin)) || 1)) * iH;

  // gridlines: absolute-APR values mapped into dev-space (axis reads real APR, bars
  // pivot on the neutral line at dev = 0).
  let grid = "";
  const span = (dMax - dMin), step = span > 400 ? 100 : span > 160 ? 50 : span > 60 ? 25 : 10;
  for (let a = Math.ceil((dMin + neutral) / step) * step; a <= dMax + neutral; a += step) {
    const yy = yD(a - neutral).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.05)"/>`;
    grid += `<text x="${W - mR + 12}" y="${(+yy + 5).toFixed(1)}" fill="#94a3b8" font-size="22" font-family="sans-serif">${Math.round(a)}%</text>`;
  }
  // price $ labels (left)
  for (const t of [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= pMin && v <= pMax)) {
    grid += `<text x="${mL - 10}" y="${(yP(t) + 5).toFixed(1)}" fill="#64748b" font-size="24" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }

  const bw = Math.max(1.2, (W - mL - mR) / (Math.max(2, rows.length) - 1) + 0.6);
  const yPivot = yD(0);
  let bars = "";
  for (const r of rows) {
    const yy = yD(r.dev), top = Math.min(yy, yPivot), h = Math.abs(yy - yPivot);
    bars += `<rect x="${(x(r.ts) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.4, h).toFixed(1)}" fill="${r.dev >= 0 ? LONG : SHORT}" fill-opacity="0.85"/>`;
  }
  const pivot = `<line x1="${mL}" y1="${yPivot.toFixed(1)}" x2="${W - mR}" y2="${yPivot.toFixed(1)}" stroke="rgba(255,255,255,0.5)" stroke-dasharray="6 6"/>`
    + `<text x="${mL + 8}" y="${(yPivot - 8).toFixed(1)}" fill="#94a3b8" font-size="18" font-family="sans-serif">neutral · ~${Math.round(neutral)}% APR</text>`;
  const priceLine = rows.filter(r => r.price != null).map(r => `${x(r.ts).toFixed(1)},${yP(r.price).toFixed(1)}`).join(" ");

  // x labels: monthly marks (the window is short now, so quarter marks were too sparse)
  let xlab = "";
  const d0 = new Date(xMin);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m.getTime() <= xMax; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    if (m.getTime() < xMin - 10 * 86400000) continue;
    xlab += `<text x="${x(m.getTime()).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="24" text-anchor="middle" font-family="sans-serif">${m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`;
  }

  const dc = cur.dev >= 0 ? LONG : SHORT;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="lsGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter></defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="lsV" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="${dc}" stop-opacity="0.14"/><stop offset="60%" stop-color="${dc}" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#lsV)"/>
${brandStripe(H)}
${grid}
${bars}${pivot}
<polyline points="${priceLine}" fill="none" stroke="${PRICE}" stroke-width="9" stroke-opacity="0.16" filter="url(#lsGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="${PRICE}" stroke-width="3.4" stroke-linejoin="round"/>
${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — ON-CHAIN POSITIONING</text>
<text x="${W - mR + 24}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${fPct(cur.dev)} vs neutral</text>
<text x="64" y="70" font-size="24" font-family="sans-serif"><tspan fill="${PRICE}" font-weight="700">— price</tspan><tspan fill="#64748b">    </tspan><tspan fill="${LONG}" font-weight="700">▮ long-leaning</tspan><tspan fill="#64748b">    </tspan><tspan fill="${SHORT}" font-weight="700">▮ short-leaning</tspan></text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · Hyperliquid perp funding, normalised to its neutral baseline</text>
</svg>`;
}

export function renderLongShortCard(stats, opts = {}) {
  const svg = longShortSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
