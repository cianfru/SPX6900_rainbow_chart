// "Hyperliquid Positioning" card — the TWO Hyperliquid perp signals side by side:
//   • FUNDING rate (annualised), NORMALISED to its neutral baseline so the structural ~+10% APR
//     (what longs pay even in a balanced book) reads as neutral. Bars pivot on that baseline: green
//     above (extra demand to be long), red below (leaning short).
//   • OPEN INTEREST (SPX in open perp positions) as a line — how much leverage is riding on the pair,
//     rising = positions building, falling = deleveraging. Independent of which way funding leans.
// Both come straight from Hyperliquid (on-chain, unmanipulable). SPX's CEX futures geo-block our
// collection, so this is the honest positioning read. A snapshot, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fM = v => v >= 1e6 ? +(v / 1e6).toFixed(1) + "M" : Math.round(v / 1e3) + "k";
const LONG = "#34d399", SHORT = "#f87171", OI = "#fbbf24";

export function longShortSvg(stats, opts = {}) {
  const all0 = (stats.longshort || []).filter(r => r.hlFunding != null).sort((a, b) => a.date.localeCompare(b.date));
  if (all0.length < 8) return null; // data-gated — needs a bit of history

  const aprs = all0.map(r => r.hlFunding * 24 * 365 * 100);
  const neutral = [...aprs].sort((a, b) => a - b)[Math.floor(aprs.length / 2)]; // median over FULL history ≈ HL baseline
  const allRows = all0.map((r, i) => ({ ts: Date.parse(r.date), apr: aprs[i], dev: aprs[i] - neutral, oi: r.hlOI != null ? +r.hlOI : null }));
  // CARD = a tight, glanceable RECENT window so the current lean vs neutral is the clear read (funding
  // is a short-term signal; full history is noise on a card). Baseline stays full-history above, so
  // the pivot is stable. The SITE chart keeps full history + zoom.
  const WINDOW_DAYS = opts.windowDays ?? 90;
  const cutoff = allRows.at(-1).ts - WINDOW_DAYS * 86400000;
  const rows = allRows.filter(r => r.ts >= cutoff);
  const cur = rows.at(-1);
  const oiRows = rows.filter(r => r.oi != null);
  const oiCur = oiRows.at(-1)?.oi ?? null;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 88, mR = 90, mT = 116, mB = 66;
  const iT = mT, iB = H - mB, iH = iB - iT;
  const xMin = rows[0].ts, xMax = rows.at(-1).ts;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * (W - mL - mR);
  // funding-deviation domain (right axis, real APR), OI domain (left axis, SPX)
  let dMin = 0, dMax = 0, oMax = 0;
  for (const r of rows) { if (r.dev < dMin) dMin = r.dev; if (r.dev > dMax) dMax = r.dev; if (r.oi != null && r.oi > oMax) oMax = r.oi; }
  const dPad = Math.max(5, (dMax - dMin) * 0.12); dMin -= dPad; dMax += dPad;
  oMax = oMax > 0 ? oMax * 1.18 : 1;
  const yD = d => iT + ((dMax - d) / ((dMax - dMin) || 1)) * iH;
  const yO = v => iB - (v / oMax) * iH;   // OI: linear from 0 at the floor

  // gridlines: absolute-APR values (right), OI marks (left)
  let grid = "";
  const span = (dMax - dMin), step = span > 400 ? 100 : span > 160 ? 50 : span > 60 ? 25 : 10;
  for (let a = Math.ceil((dMin + neutral) / step) * step; a <= dMax + neutral; a += step) {
    const yy = yD(a - neutral).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.05)"/>`;
    grid += `<text x="${W - mR + 12}" y="${(+yy + 5).toFixed(1)}" fill="#94a3b8" font-size="22" font-family="sans-serif">${Math.round(a)}%</text>`;
  }
  const oiStep = oMax > 20e6 ? 5e6 : oMax > 8e6 ? 2.5e6 : 1e6;
  for (let v = oiStep; v <= oMax; v += oiStep) {
    grid += `<text x="${mL - 12}" y="${(yO(v) + 5).toFixed(1)}" fill="${OI}" fill-opacity="0.7" font-size="20" text-anchor="end" font-family="sans-serif">${fM(v)}</text>`;
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
  // OPEN INTEREST line (amber), on the left axis, with the current value labelled at its end point
  const lastOiX = oiRows.length ? x(oiRows.at(-1).ts) : 0, lastOiY = oiCur != null ? yO(oiCur) : 0;
  const oiLine = oiRows.length > 1
    ? `<polyline points="${oiRows.map(r => `${x(r.ts).toFixed(1)},${yO(r.oi).toFixed(1)}`).join(" ")}" fill="none" stroke="${OI}" stroke-width="4.6" stroke-linejoin="round" stroke-linecap="round" filter="url(#lsGlow)"/>`
      + `<polyline points="${oiRows.map(r => `${x(r.ts).toFixed(1)},${yO(r.oi).toFixed(1)}`).join(" ")}" fill="none" stroke="${OI}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<circle cx="${lastOiX.toFixed(1)}" cy="${lastOiY.toFixed(1)}" r="6" fill="${OI}"/>`
      + `<text x="${(lastOiX - 10).toFixed(1)}" y="${(lastOiY - 12).toFixed(1)}" fill="${OI}" font-size="24" font-weight="800" text-anchor="end" font-family="sans-serif">${fM(oiCur)}</text>`
    : "";

  // x labels: monthly marks
  let xlab = "";
  const d0 = new Date(xMin);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)); m.getTime() <= xMax; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    if (m.getTime() < xMin - 10 * 86400000) continue;
    xlab += `<text x="${x(m.getTime()).toFixed(1)}" y="${H - 42}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`;
  }

  const dc = cur.dev >= 0 ? LONG : SHORT;
  // one compact current-state chip (short enough it can never collide with the title); the exact
  // numbers live in the post text, so the card stays clean.
  const lean = cur.dev > 8 ? { t: "▲ long-leaning", c: LONG } : cur.dev < -8 ? { t: "▼ short-leaning", c: SHORT } : { t: "● neutral", c: "#94a3b8" };
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="lsGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter></defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="lsV" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="${dc}" stop-opacity="0.13"/><stop offset="60%" stop-color="${dc}" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#lsV)"/>
${brandStripe(H)}
${grid}
${bars}${pivot}
${oiLine}
${xlab}
<text x="60" y="50" fill="#e2e8f0" font-size="31" font-weight="800" font-family="sans-serif" letter-spacing="0.6">Hyperliquid positioning</text>
<text x="${W - mR}" y="50" fill="${lean.c}" font-size="24" font-weight="800" font-family="sans-serif" text-anchor="end">${lean.t}</text>
<text x="60" y="86" font-size="20" font-family="sans-serif"><tspan fill="${LONG}" font-weight="700">▮ funding vs neutral</tspan><tspan fill="#475569">    </tspan><tspan fill="${OI}" font-weight="700">— open interest (SPX)</tspan></text>
<text x="60" y="${H - 20}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · Hyperliquid perp · not financial advice</text>
</svg>`;
}

export function renderLongShortCard(stats, opts = {}) {
  const svg = longShortSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
