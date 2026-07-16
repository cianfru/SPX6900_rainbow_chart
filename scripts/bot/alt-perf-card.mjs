// "SPX vs the Alt Market" relative-performance card — SPX ÷ TOTAL3ES (alt market
// ex-BTC/ETH/stables), rebased to 1× at launch. The alt market is the FLAT baseline
// (dividing by it makes it horizontal); the line ABOVE = SPX outperforming the sector,
// BELOW = underperforming. Two bands — OVERBOUGHT (rich vs alts) and CHEAP (cheap vs
// alts) — are the ±1σ envelope of the ratio's trend (adaptive, since the ratio trends up;
// a flat overbought line would only ever trigger recently). NOT the price rainbow, and
// NOT a signal — a relative-valuation read. Data: bundled TOTAL3ES × our dense SPX.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { buildAltRainbow } from "../../src/alt-rainbow.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMul = v => v >= 100 ? Math.round(v) + "×" : v >= 10 ? v.toFixed(0) + "×" : v.toFixed(2) + "×";
const RICH = "#f87171", CHEAP = "#38bdf8", LINE = "#f8fafc", BASE = "#94a3b8";
const DAY = 86400000;

export function altPerfSvg(stats, opts = {}) {
  const R = buildAltRainbow();
  if (!R || R.series.length < 100) return null;
  const { series, fit, cur } = R;
  const t0 = series[0].ts, t1 = series.at(-1).ts;
  const band = (ts, k) => Math.exp(fit.a + fit.b * ((ts - t0) / DAY) + k * fit.sigma);
  const zone = cur.z >= 1 ? "overbought vs alts" : cur.z <= -1 ? "cheap vs alts" : "mid-range vs alts";
  const zoneC = cur.z >= 1 ? RICH : cur.z <= -1 ? CHEAP : LINE;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 104, mT = 128, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const x = ts => mL + ((ts - t0) / ((t1 - t0) || 1)) * pW;
  const lo = Math.min(1, band(t0, -1), band(t1, -1)) * 0.8;
  const hi = Math.max(band(t1, 1), ...series.map(s => s.rr)) * 1.12;
  const y = v => mT + ((Math.log(hi) - Math.log(Math.max(v, 1e-9))) / ((Math.log(hi) - Math.log(lo)) || 1)) * pH;

  const bandLine = k => series.map(s => `${x(s.ts).toFixed(1)},${y(band(s.ts, k)).toFixed(1)}`);
  const over = bandLine(1), cheap = bandLine(-1);
  // faint fill in the rich zone (above overbought) and the cheap zone (below cheap band)
  const richFill = `<polygon points="${series.map(s => `${x(s.ts).toFixed(1)},${mT}`).join(" ")} ${over.slice().reverse().join(" ")}" fill="${RICH}" fill-opacity="0.12"/>`;
  const cheapFill = `<polygon points="${cheap.join(" ")} ${series.map(s => `${x(s.ts).toFixed(1)},${mT + pH}`).reverse().join(" ")}" fill="${CHEAP}" fill-opacity="0.12"/>`;

  let grid = "";
  for (const v of [1, 3, 10, 30, 100, 300].filter(v => v >= lo && v <= hi)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#c3ccda" font-size="22" text-anchor="end" font-family="sans-serif">${fMul(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#c3ccda" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const line = series.map(s => `${x(s.ts).toFixed(1)},${y(s.rr).toFixed(1)}`).join(" ");
  const yBase = y(1), curX = x(cur.ts), curY = y(cur.rr);
  // band labels right-anchored at the far right edge (clear of the "now" dot at x≈W-mR).
  const lbl = (k, c, txt) => `<text x="${W - 8}" y="${(y(band(t1, k)) - 9).toFixed(1)}" fill="${c}" font-size="18" font-weight="800" text-anchor="end" font-family="sans-serif">${esc(txt)}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="apbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<filter id="apglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#apbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 vs THE ALT MARKET</text>
<text x="60" y="102" fill="${zoneC}" font-size="27" font-weight="800" font-family="sans-serif">${fMul(cur.rr)} the alt market since launch — ${esc(zone)}</text>
${grid}${xlab}
${richFill}${cheapFill}
<polyline points="${over.join(" ")}" fill="none" stroke="${RICH}" stroke-width="2" stroke-opacity="0.8" stroke-dasharray="7 6"/>
<polyline points="${cheap.join(" ")}" fill="none" stroke="${CHEAP}" stroke-width="2" stroke-opacity="0.8" stroke-dasharray="7 6"/>
<line x1="${mL}" y1="${yBase.toFixed(1)}" x2="${W - mR}" y2="${yBase.toFixed(1)}" stroke="${BASE}" stroke-width="1.6" stroke-opacity="0.7" stroke-dasharray="3 6"/>
<text x="${W - mR - 6}" y="${(yBase - 9).toFixed(1)}" fill="${BASE}" font-size="17" font-weight="700" text-anchor="end" font-family="sans-serif">alt market · even = 1×</text>
${lbl(1, RICH, "overbought")}${lbl(-1, CHEAP, "cheap")}
<polyline points="${line}" fill="none" stroke="${LINE}" stroke-width="8" stroke-opacity="0.16" stroke-linejoin="round" stroke-linecap="round" filter="url(#apglow)"/>
<polyline points="${line}" fill="none" stroke="${LINE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${zoneC}" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY - 18).toFixed(1)}" fill="${zoneC}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · vs TOTAL3ES (alt market ex-BTC/ETH/stables) · rebased to launch")}</text>
</svg>`;
}

export function renderAltPerfCard(stats, opts = {}) {
  const svg = altPerfSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
