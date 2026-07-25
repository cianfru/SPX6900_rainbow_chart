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
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMon = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const GRN = "#4ade80", COOL = "#38bdf8", HOT = "#f87171";

export function supplyProfitSvg(stats, opts = {}) {
  const raw = (stats.onchain || []).filter(r => Number.isFinite(r.sip)).map(r => ({ ts: Date.parse(r.d), v: r.sip }));
  if (raw.length < 50) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const cur = raw.at(-1), sip = cur.v, under = 100 - sip;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 44, mT = 124, mB = 76, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH; // linear 0–100%

  // Valuation zones: warm at top = frothy, cool at bottom = cheap. Edge-bright
  // gradients (vivid at the outer edge, fading toward the middle where the line
  // lives) so the bands POP without muddying the price line's path. Labels sit at
  // the right edge in each zone — clear of the recent line (which sits mid-range).
  const zoneRect = (v1, v2, grad) => `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="url(#${grad})"/>`;
  const zones = zoneRect(66, 100, "spHot") + zoneRect(0, 34, "spCool");
  const zoneLabels =
    `<text x="${W - mR - 12}" y="${(y(93) + 8).toFixed(1)}" fill="#fecaca" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">frothy</text>`
    + `<text x="${W - mR - 12}" y="${(y(7) + 8).toFixed(1)}" fill="#bae6fd" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">cheap</text>`;

  let grid = "";
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${v === 50 ? 0 : 0.12})"/>`
      + `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const line = raw.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${line} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const halfY = y(50).toFixed(1);
  const curX = x(cur.ts), curY = y(sip);
  const state = sip >= 50 ? "most of the float is in profit" : "most of the float is underwater";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="spbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="spfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.5"/><stop offset="55%" stop-color="${GRN}" stop-opacity="0.14"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0"/></linearGradient>
<linearGradient id="spHot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fb7185" stop-opacity="0.5"/><stop offset="100%" stop-color="#fb7185" stop-opacity="0.05"/></linearGradient>
<linearGradient id="spCool" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.05"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0.5"/></linearGradient>
<filter id="spglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#spbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — SUPPLY IN PROFIT</text>
<text x="60" y="100" fill="#4ade80" font-size="32" font-weight="800" font-family="sans-serif">${sip.toFixed(0)}% in profit — ${state}</text>
${zones}${grid}${xlab}${zoneLabels}
<polygon points="${area}" fill="url(#spfill)"/>
<line x1="${mL}" y1="${halfY}" x2="${W - mR}" y2="${halfY}" stroke="#cbd5e1" stroke-width="2" stroke-opacity="0.85" stroke-dasharray="7 6"/>
<polyline points="${line}" fill="none" stroke="#6ee7a0" stroke-width="5.7" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="12" fill="#4ade80" stroke="#05050e" stroke-width="3"/>
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · share of ETH-native supply held above its on-chain cost basis")}</text>
</svg>`;
}

export function renderSupplyProfitCard(stats, opts = {}) {
  const svg = supplyProfitSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
