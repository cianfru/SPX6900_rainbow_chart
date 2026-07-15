// "Supply in Profit %" card — the flagship on-chain valuation metric, finally
// buildable from the Dune per-wallet cost-basis reconstruction (previously
// IMPOSSIBLE: HolderScan gave only the aggregate break-even, never the cost-basis
// DISTRIBUTION). The share of ETH-native supply whose holder's average cost sits
// below spot. Plain-word, glanceable: "X% of supply is in profit." High near tops
// (frothy), low near bottoms (cheap) — a valuation POSITION, not a buy signal.
// Data: stats.onchain (src/spx-onchain.js, weekly). Same clean look as mvrvtrend.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMon = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const GRN = "#4ade80", COOL = "#38bdf8", HOT = "#f87171";

export function supplyProfitSvg(stats, opts = {}) {
  const raw = (stats.onchain || []).filter(r => Number.isFinite(r.sip)).map(r => ({ ts: Date.parse(r.d), v: r.sip }));
  if (raw.length < 50) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const cur = raw.at(-1), sip = cur.v, under = 100 - sip;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 92, mT = 128, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH; // linear 0–100%

  // Subtle valuation context (no labels): warm at top = most in profit / frothy,
  // cool at bottom = most underwater / cheap. Same language as mvrvtrend.
  const band = (v1, v2, fill, op) => `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${fill}" fill-opacity="${op}"/>`;
  const zones = band(66, 100, HOT, 0.15) + band(0, 34, COOL, 0.15);

  let grid = "";
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${v === 50 ? 0 : 0.09})"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#a3aec0" font-size="23" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const line = raw.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${line} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const halfY = y(50).toFixed(1);
  const curX = x(cur.ts), curY = y(sip);
  const state = sip >= 50 ? "most of the float is in profit" : "most of the float is underwater";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="spbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="spfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.30"/><stop offset="60%" stop-color="${GRN}" stop-opacity="0.07"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0"/></linearGradient>
<filter id="spglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#spbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — SUPPLY IN PROFIT</text>
<text x="60" y="102" fill="${GRN}" font-size="28" font-weight="800" font-family="sans-serif">${sip.toFixed(0)}% in profit — ${state}</text>
${zones}${grid}${xlab}
<polygon points="${area}" fill="url(#spfill)"/>
<line x1="${mL}" y1="${halfY}" x2="${W - mR}" y2="${halfY}" stroke="#94a3b8" stroke-width="1.8" stroke-opacity="0.7" stroke-dasharray="7 6"/>
<text x="${W - mR - 8}" y="${(+halfY - 10).toFixed(1)}" fill="#cbd5e1" font-size="19" text-anchor="end" font-family="sans-serif">half in profit</text>
<polyline points="${line}" fill="none" stroke="${GRN}" stroke-width="9" stroke-opacity="0.20" stroke-linejoin="round" stroke-linecap="round" filter="url(#spglow)"/>
<polyline points="${line}" fill="none" stroke="#86efac" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="#86efac" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY - 18).toFixed(1)}" fill="#86efac" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · share of ETH-native supply held above its on-chain cost basis")}</text>
</svg>`;
}

export function renderSupplyProfitCard(stats, opts = {}) {
  const svg = supplyProfitSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
