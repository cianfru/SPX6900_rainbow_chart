// "Valuation Composite" card — a weighted basket of SPX6900 valuation indicators (on-chain +
// technical + sentiment) combined into ONE over/under-valued oscillator over history. Each lens
// is percentile-ranked over its own history (higher = more expensive) and weighted; the composite
// reads as "weighted percentile of expensiveness across everything we track." Replaces the
// snapshot "Am I Cheap?" card. A valuation POSITION over time, NOT a signal. Data: stats (all lenses).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { valuationComposite, ZONES, zoneOf, INDICATORS } from "./valuation-composite.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

export function valuationBandSvg(stats, opts = {}) {
  const { series, cur } = valuationComposite(stats);
  if (!series || series.length < 40 || !cur) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 70, mR = 196;
  const pT = 170, pB = H - 84, pW = W - mL - mR;
  const t0 = series[0].ts, t1 = series.at(-1).ts;
  const X = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const Y = v => pB - v * (pB - pT); // v in 0..1
  const z = zoneOf(cur.composite);

  // horizontal zone bands (background)
  let bands = ""; let prev = 0;
  for (const zn of ZONES) {
    const top = Math.min(zn.max, 1);
    bands += `<rect x="${mL}" y="${Y(top).toFixed(1)}" width="${pW}" height="${(Y(prev) - Y(top)).toFixed(1)}" fill="${zn.color}" fill-opacity="0.11"/>`
      + `<text x="${W - mR + 12}" y="${(Y((prev + top) / 2) + 6).toFixed(1)}" fill="${zn.color}" font-size="15" font-family="sans-serif" font-weight="700">${esc(zn.label)}</text>`;
    prev = top;
  }
  // gridlines at 20/40/60/80
  let grid = "";
  for (const g of [0.2, 0.4, 0.6, 0.8]) grid += `<line x1="${mL}" y1="${Y(g).toFixed(1)}" x2="${W - mR}" y2="${Y(g).toFixed(1)}" stroke="rgba(255,255,255,0.10)"/><text x="${mL - 10}" y="${(Y(g) + 6).toFixed(1)}" fill="#8b95a7" font-size="18" text-anchor="end" font-family="sans-serif">${(g * 100).toFixed(0)}%</text>`;

  const line = series.map(p => `${X(p.ts).toFixed(1)},${Y(p.composite).toFixed(1)}`).join(" ");
  const area = `${mL},${Y(0).toFixed(1)} ${line} ${X(t1).toFixed(1)},${Y(0).toFixed(1)}`;
  let xl = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xl += `<text x="${X(t).toFixed(1)}" y="${pB + 34}" fill="#aab6cc" font-size="21" text-anchor="middle" font-family="sans-serif" font-weight="600">${yr}</text>`; }

  const wlist = INDICATORS.map(i => i.label).join(" · ");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="vbbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0e1430"/><stop offset="55%" stop-color="#0a0d1c"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
<filter id="vbglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#vbbg)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="22" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
<text x="52" y="58" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="0.5"><tspan fill="${z.color}">${(cur.composite * 100).toFixed(0)}% · ${esc(z.label)}</tspan></text>
<text x="52" y="90" font-size="21" font-family="sans-serif" fill="#e2e8f0">SPX6900 Valuation Composite — where it sits vs its own history, right now</text>
<text x="52" y="114" font-size="15.5" font-family="sans-serif" fill="#64748b" textLength="${W - 260}" lengthAdjust="spacingAndGlyphs">${esc(`weighted basket: ${wlist}`)}</text>
${bands}${grid}${xl}
<polygon points="${area}" fill="${z.color}" fill-opacity="0.14"/>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="7" stroke-opacity="0.14" filter="url(#vbglow)"/>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="3.2" stroke-linejoin="round"/>
<circle cx="${X(t1).toFixed(1)}" cy="${Y(cur.composite).toFixed(1)}" r="8" fill="${z.color}" stroke="#06070f" stroke-width="2.5"/>
<text x="52" y="${H - 22}" fill="#64748b" font-size="16" font-family="sans-serif">spx6900rainbow.xyz · each lens percentile-ranked over its own history, then weighted · a valuation position, not a signal</text>
</svg>`;
}

export function renderValuationBandCard(stats, opts = {}) {
  const svg = valuationBandSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
