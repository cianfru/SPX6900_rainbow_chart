// "Free Float" card — the share of SPX6900 supply that's actually LIQUID (changed hands
// in the last 6 months), over days since inception. Falls from ~100% at launch as coins
// mature into strong hands — the "supply squeeze" story, but with the definition + data
// source stated ON the card so anyone can reproduce it (public Ethereum transfers, our
// on-chain reconstruction — NO new Dune). A holder-behaviour POSITION, not a signal.
// free float = 100 − (age 6-12m + age 1y+) from stats.onchain HODL age bands.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const YEL = "#fbbf24";

export function freeFloatSvg(stats, opts = {}) {
  const oc = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
  if (oc.length < 50) return null;
  const launch = Date.parse(oc[0].d);
  const pts = oc.map(r => ({ day: (Date.parse(r.d) - launch) / 86400000, ff: 100 - (r.age[3] + r.age[4]) }));
  const cur = pts.at(-1);

  // exponential trend (mirrors the classic Excel "Expon." line): log(ff) = a + b·day
  const n = pts.length, xs = pts.map(p => p.day), ys = pts.map(p => Math.log(Math.max(p.ff, 1)));
  const sx = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
  const sxx = xs.reduce((a, v) => a + v * v, 0), sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
  const fit = d => Math.exp(a + b * d);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 60, mT = 130, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const d1 = cur.day || 1;
  const x = d => mL + (d / d1) * pW, y = v => mT + ((100 - v) / 80) * pH; // y: 20%..100%

  let grid = "";
  for (const v of [20, 40, 60, 80, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#c3ccda" font-size="22" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  const xAxisY = mT + pH + 30;
  let xlab = "";
  for (const d of [0, 200, 400, 600, 800, 1000].filter(d => d <= d1)) {
    xlab += `<text x="${x(d).toFixed(1)}" y="${xAxisY.toFixed(1)}" fill="#c3ccda" font-size="21" text-anchor="middle" font-family="sans-serif">${d}</text>`;
  }

  const line = pts.map(p => `${x(p.day).toFixed(1)},${y(p.ff).toFixed(1)}`).join(" ");
  const fitLine = pts.map(p => `${x(p.day).toFixed(1)},${y(fit(p.day)).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${line} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ffbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="fffill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${YEL}" stop-opacity="0.30"/><stop offset="100%" stop-color="${YEL}" stop-opacity="0"/></linearGradient>
<filter id="ffglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#ffbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — FREE FLOAT</text>
<text x="60" y="100" fill="${YEL}" font-size="27" font-weight="800" font-family="sans-serif">${cur.ff.toFixed(0)}% liquid — ${(100 - cur.ff).toFixed(0)}% hasn't moved in 6 months</text>
${grid}${xlab}
<text x="${(mL + pW / 2).toFixed(1)}" y="${(xAxisY + 26).toFixed(1)}" fill="#7c879b" font-size="17" text-anchor="middle" font-family="sans-serif">days since inception</text>
<polygon points="${area}" fill="url(#fffill)"/>
<polyline points="${fitLine}" fill="none" stroke="#a3aec0" stroke-width="1.8" stroke-dasharray="7 6" stroke-opacity="0.65"/>
<polyline points="${line}" fill="none" stroke="${YEL}" stroke-width="8" stroke-opacity="0.16" stroke-linejoin="round" filter="url(#ffglow)"/>
<polyline points="${line}" fill="none" stroke="${YEL}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${x(cur.day).toFixed(1)}" cy="${y(cur.ff).toFixed(1)}" r="8" fill="${YEL}" stroke="#05050e" stroke-width="2"/>
<text x="${(mL + pW / 2).toFixed(1)}" y="${(xAxisY + 52).toFixed(1)}" fill="#6b7688" font-size="16.5" text-anchor="middle" font-family="sans-serif">${esc("free float = supply that changed hands in the last 6 months · on-chain (Ethereum) · reproducible · not financial advice")}</text>
</svg>`;
}

export function renderFreeFloatCard(stats, opts = {}) {
  const svg = freeFloatSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
