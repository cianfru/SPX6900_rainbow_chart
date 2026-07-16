// "Holder Concentration" card — the share of ETH-native supply held by the largest
// wallets (top 10 / top 100, contracts/pools/CEX excluded) over time, from the Dune
// reconstruction. The honest story: SPX has DECENTRALISED — the whales' grip loosened
// as the holder base grew (top 100 ~68% at launch → ~58% now). A distribution-of-
// ownership statement, NOT a buy signal. Data: stats.onchain. Clean mvrvtrend style.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const A100 = "#fbbf24", A10 = "#f87171"; // top-100 amber, top-10 red

export function concentrationSvg(stats, opts = {}) {
  const raw = (stats.onchain || []).filter(r => Number.isFinite(r.top100) && Number.isFinite(r.top10)).map(r => ({ ts: Date.parse(r.d), t10: r.top10, t100: r.top100 }));
  if (raw.length < 50) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const first = raw[0], cur = raw.at(-1);
  const dir = cur.t100 < first.t100 ? "down from" : "up from";
  const spread = cur.t100 < first.t100;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 92, mT = 128, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yMax = 75; // % axis, comfortably above top-100's launch ~68%
  const y = v => mT + (1 - v / yMax) * pH;

  let grid = "";
  for (const v of [0, 25, 50, 75]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#a3aec0" font-size="23" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const lineOf = key => raw.map(r => `${x(r.ts).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const line100 = lineOf("t100"), line10 = lineOf("t10");
  const area100 = `${mL},${(mT + pH).toFixed(1)} ${line100} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ccbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="ccfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${A100}" stop-opacity="0.26"/><stop offset="70%" stop-color="${A100}" stop-opacity="0.05"/><stop offset="100%" stop-color="${A100}" stop-opacity="0"/></linearGradient>
<filter id="ccglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#ccbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDER CONCENTRATION</text>
<text x="60" y="102" fill="${A100}" font-size="28" font-weight="800" font-family="sans-serif">Top 100 wallets hold ${cur.t100.toFixed(0)}% — ${dir} ${first.t100.toFixed(0)}% at launch</text>
${grid}${xlab}
<polygon points="${area100}" fill="url(#ccfill)"/>
<polyline points="${line100}" fill="none" stroke="${A100}" stroke-width="8" stroke-opacity="0.18" stroke-linejoin="round" stroke-linecap="round" filter="url(#ccglow)"/>
<polyline points="${line100}" fill="none" stroke="${A100}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<polyline points="${line10}" fill="none" stroke="${A10}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${x(cur.ts).toFixed(1)}" cy="${y(cur.t100).toFixed(1)}" r="8" fill="${A100}" stroke="#05050e" stroke-width="2"/>
<text x="${(x(cur.ts) - 14).toFixed(1)}" y="${(y(cur.t100) - 16).toFixed(1)}" fill="${A100}" font-size="21" font-weight="800" text-anchor="end" font-family="sans-serif">top 100 · ${cur.t100.toFixed(0)}%</text>
<circle cx="${x(cur.ts).toFixed(1)}" cy="${y(cur.t10).toFixed(1)}" r="8" fill="${A10}" stroke="#05050e" stroke-width="2"/>
<text x="${(x(cur.ts) - 14).toFixed(1)}" y="${(y(cur.t10) + 30).toFixed(1)}" fill="${A10}" font-size="21" font-weight="800" text-anchor="end" font-family="sans-serif">top 10 · ${cur.t10.toFixed(0)}%</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · largest wallets' share of supply · contracts & CEX excluded")}</text>
</svg>`;
}

export function renderConcentrationCard(stats, opts = {}) {
  const svg = concentrationSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
