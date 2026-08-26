// SUPPLY TURNOVER card — of all held SPX, the cumulative share that last changed hands within each
// horizon (24h / 1wk / 1mo / 3mo / 6mo / 1yr) as a ladder, plus the dormant-1yr+ complement. The
// tweet twin of the site's Supply Turnover chart and the mirror of HODL waves (velocity, not conviction).
// Reads stats.onchain via the shared turnover logic — the finer ageFine buckets when present, else the
// coarse month-granularity age bands, so it degrades cleanly before the sub-week buckets land.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { HORIZONS, turnoverOf } from "../../src/turnover.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const DORMANT = "#94a3b8";

export function turnoverCardStats(stats) {
  const oc = (stats.onchain || []).filter(r => (Array.isArray(r.ageFine) && r.ageFine.length === 7) || (Array.isArray(r.age) && r.age.length === 5));
  if (oc.length < 20) return null;
  return turnoverOf(oc.at(-1));
}

export function turnoverCardSvg(stats, opts = {}) {
  const s = turnoverCardStats(stats);
  if (!s) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 60, mR = 58;
  const rows = HORIZONS.filter(h => s[h.key] != null).map(h => ({ label: `moved < ${h.label}`, v: s[h.key], c: h.c }));
  rows.push({ label: "dormant 1 year+", v: s.dormant, c: DORMANT, sep: true });

  // ladder geometry — right-aligned label column, a bar track, the % at the far right
  const top = 232, bottom = 84, labelW = 214, pctW = 74;
  const trackX = mL + labelW + 16, trackW = W - mR - pctW - trackX;
  const rowH = Math.min(58, (H - top - bottom) / rows.length);
  const barH = Math.min(30, rowH - 16);

  let bars = "";
  rows.forEach((r, i) => {
    const cy = top + i * rowH, midY = cy + rowH / 2;
    const w = Math.max(2, trackW * Math.min(100, r.v) / 100);
    if (r.sep) bars += `<line x1="${mL}" y1="${(cy + 2).toFixed(1)}" x2="${W - mR}" y2="${(cy + 2).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>`;
    bars += `<text x="${mL + labelW}" y="${(midY + 7).toFixed(1)}" fill="#c3cedd" font-size="22" text-anchor="end" font-family="sans-serif">${esc(r.label)}</text>`;
    bars += `<rect x="${trackX}" y="${(midY - barH / 2).toFixed(1)}" width="${trackW.toFixed(1)}" height="${barH}" rx="5" fill="#ffffff" fill-opacity="0.05"/>`;
    bars += `<rect x="${trackX}" y="${(midY - barH / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${barH}" rx="5" fill="${r.c}" fill-opacity="0.92"/>`;
    bars += `<text x="${W - mR}" y="${(midY + 8).toFixed(1)}" fill="${r.c}" font-size="26" font-weight="800" text-anchor="end" font-family="sans-serif">${Math.round(r.v)}%</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="tobg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#tobg)"/>
${brandStripe(H)}
<text x="60" y="62" fill="#f8fafc" font-size="41" font-weight="800" font-family="sans-serif" letter-spacing="1">HOW MUCH SPX6900 ACTUALLY MOVES</text>
<text x="60" y="108" fill="#4ade80" font-size="30" font-weight="800" font-family="sans-serif">~${Math.round(s.m1)}% turns over in a month · ${Math.round(s.y1)}% within a year</text>
<text x="60" y="148" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`${Math.round(s.dormant)}% has sat still for a year or more. Held ≠ frozen — it just moves slowly.`)}</text>
<text x="60" y="${top - 22}" fill="#8fa0b6" font-size="19" font-family="sans-serif">Share of all held SPX that last changed hands within each window</text>
${bars}
<text x="60" y="${H - 22}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · ETH-native · reconstructed from on-chain transfer history · reproducible · not financial advice")}</text>
</svg>`;
}

export function renderTurnoverCard(stats, opts = {}) {
  const svg = turnoverCardSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
