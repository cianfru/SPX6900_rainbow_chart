// "SPX vs the Alt Market" relative-strength rainbow card — SPX ÷ TOTAL3ES (alt market
// ex-BTC/ETH/stables), rebased to 1× at launch, with a log-linear trend + σ (z-score)
// rainbow. Above trend = SPX stretched vs alts, below = cheap vs alts. Data: the bundled
// TOTAL3ES (TradingView) × our dense daily SPX. A relative-VALUATION lens, NOT a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { buildAltRainbow, zLabel } from "../../src/alt-rainbow.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const DAY = 86400000;
const fMul = v => v >= 100 ? Math.round(v) + "×" : v >= 10 ? v.toFixed(0) + "×" : v.toFixed(1) + "×";
// blue (cheap) → red (stretched) ramp for a z in [-2.5, 2.5]
const RAMP = ["#2563eb", "#3b82f6", "#22d3ee", "#34d399", "#a3e635", "#fbbf24", "#fb923c", "#f87171", "#ef4444"];
const zColor = z => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round((z + 2.5) / 5 * (RAMP.length - 1))))];

export function altRainbowSvg(stats, opts = {}) {
  const R = buildAltRainbow();
  if (!R || R.series.length < 100) return null;
  const { series, fit, cur } = R;
  const t0 = series[0].ts;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 96, mT = 128, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t1 = series.at(-1).ts;
  const x = ts => mL + ((ts - t0) / ((t1 - t0) || 1)) * pW;
  const band = (ts, k) => Math.exp(fit.a + fit.b * ((ts - t0) / DAY) + k * fit.sigma);

  // y-domain from the ±2.5σ bands so the whole rainbow fits.
  const lo = Math.min(band(t1, -2.5), band(t0, -2.5), ...series.map(s => s.rr)) * 0.9;
  const hi = Math.max(band(t1, 2.5), band(t0, 2.5), ...series.map(s => s.rr)) * 1.1;
  const y = v => mT + ((Math.log(hi) - Math.log(Math.max(v, 1e-9))) / ((Math.log(hi) - Math.log(lo)) || 1)) * pH;

  // rainbow ribbons: fill between consecutive σ levels, blue (bottom/cheap) → red (top).
  const KS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];
  let ribbons = "";
  for (let i = 0; i < KS.length - 1; i++) {
    const kMid = (KS[i] + KS[i + 1]) / 2;
    const up = series.map(s => `${x(s.ts).toFixed(1)},${y(band(s.ts, KS[i + 1])).toFixed(1)}`);
    const dn = series.map(s => `${x(s.ts).toFixed(1)},${y(band(s.ts, KS[i])).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${up.join(" ")} ${dn.join(" ")}" fill="${zColor(kMid)}" fill-opacity="0.5"/>`;
  }

  let grid = "";
  for (const v of [1, 3, 10, 30, 100, 300].filter(v => v >= lo && v <= hi)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.10)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#c3ccda" font-size="22" text-anchor="end" font-family="sans-serif">${fMul(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#c3ccda" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const rrLine = series.map(s => `${x(s.ts).toFixed(1)},${y(s.rr).toFixed(1)}`).join(" ");
  const trendLine = series.map(s => `${x(s.ts).toFixed(1)},${y(band(s.ts, 0)).toFixed(1)}`).join(" ");
  const curX = x(cur.ts), curY = y(cur.rr), cc = zColor(cur.z);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="arbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<filter id="arglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#arbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 vs THE ALT MARKET</text>
<text x="60" y="102" fill="${cc}" font-size="27" font-weight="800" font-family="sans-serif">${fMul(cur.rr)} since launch · ${cur.z >= 0 ? "+" : ""}${cur.z.toFixed(1)}σ — ${esc(cur.label)}</text>
${ribbons}${grid}${xlab}
<polyline points="${trendLine}" fill="none" stroke="#e2e8f0" stroke-width="1.6" stroke-opacity="0.55" stroke-dasharray="7 7"/>
<polyline points="${rrLine}" fill="none" stroke="#f8fafc" stroke-width="8" stroke-opacity="0.18" stroke-linejoin="round" stroke-linecap="round" filter="url(#arglow)"/>
<polyline points="${rrLine}" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${cc}" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY - 18).toFixed(1)}" fill="${cc}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · vs TOTAL3ES (alt market ex-BTC/ETH/stables) · rebased to launch")}</text>
</svg>`;
}

export function renderAltRainbowCard(stats, opts = {}) {
  const svg = altRainbowSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
