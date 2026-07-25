// "Liquid vs Illiquid Supply" card (id stays `freefloat` for wiring; the metric is reframed).
// The Glassnode-aligned "how much supply is likely to actually move" metric — NOT "free float"
// (~88% is technically tradable for a fair launch → uninteresting) and NOT "locked" (self-custody
// isn't locked). ILLIQUID = long-term holders held >155d (Glassnode's LTH bar); LIQUID = short-term
// holders + exchange + LP. Plotted vs Bitcoin on the SAME method, aligned by age, then BTC carried
// 24 months forward. The honest reveal: at the same age SPX's supply is STICKIER than Bitcoin's was.
// Data: stats.onchain (FIFO 155d) via src/liquidity.js; BTC from src/btc-hodl-waves.js. A holder-
// behaviour POSITION, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";
import { spxLiquidity, btcIlliquid } from "../../src/liquidity.js";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const SPX = "#a78bfa", BTC = "#fb923c"; // illiquid = purple (the sticky, diamond-tier feel)
const at = (series, day) => { if (!series.length) return null; let b = series[0]; for (const p of series) if (Math.abs(p[0] - day) < Math.abs(b[0] - day)) b = p; return b[1]; };

export function freeFloatSvg(stats, opts = {}) {
  const liq = spxLiquidity(stats.onchain || []);
  if (liq.length < 50) return null;
  const launch = liq[0].ts;
  const spx = liq.map(r => [(r.ts - launch) / 86400000, r.illiqPct]);
  const curIlliq = spx.at(-1)[1], spxLastDay = spx.at(-1)[0];

  const FWD = 730; // 24 months of "what Bitcoin did next" past SPX's current age
  const btcSeries = btcIlliquid(BTC_HODL);
  const bt0 = btcSeries.length ? btcSeries[0].ts : 0;
  const btcAll = btcSeries.map(r => [(r.ts - bt0) / 86400000, r.illiqPct]).filter(p => p[0] <= spxLastDay + FWD);
  const btcPast = btcAll.filter(p => p[0] <= spxLastDay + 8);
  const btcFwd = btcAll.filter(p => p[0] >= spxLastDay);
  const multi = btcAll.length > 20;
  const btcSameAge = at(btcAll, spxLastDay);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 94, mR = 60, mT = 132, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const YR = 365.25;
  const d1 = multi ? spxLastDay + FWD : (spxLastDay || 1);
  const x = d => mL + (d / d1) * pW, y = v => mT + ((100 - v) / 100) * pH; // y: 0..100%

  let grid = "";
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.1)"/><text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  const xAxisY = mT + pH + 32;
  let xlab = "";
  for (let yr = 0; yr * YR <= d1 + 15; yr++) xlab += `<text x="${x(yr * YR).toFixed(1)}" y="${xAxisY.toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr === 0 ? "launch" : yr + "yr"}</text>`;

  const poly = (series, color, w, dash) => `<polyline points="${series.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}" stroke-opacity="0.85"` : ""}/>`;
  const area = `${mL},${(mT + pH).toFixed(1)} ${spx.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} ${x(spxLastDay).toFixed(1)},${(mT + pH).toFixed(1)}`;

  let lines = `<polygon points="${area}" fill="url(#ilfill)"/>`;
  let legend = "";
  if (multi) {
    const nowX = x(spxLastDay);
    lines += `<line x1="${nowX.toFixed(1)}" y1="${mT}" x2="${nowX.toFixed(1)}" y2="${(mT + pH).toFixed(1)}" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 6" stroke-opacity="0.5"/>`
      + `<text x="${(nowX + 8).toFixed(1)}" y="${(mT + 22).toFixed(1)}" fill="#e2e8f0" font-size="19" font-weight="700" font-family="sans-serif">SPX today</text>`
      + `<text x="${(nowX + 8).toFixed(1)}" y="${(mT + 44).toFixed(1)}" fill="#94a3b8" font-size="16" font-family="sans-serif">Bitcoin's path from here →</text>`
      + poly(btcPast, BTC, 3.6) + poly(btcFwd, BTC, 3.2, "3 7");
    const be = btcFwd.at(-1)?.[1];
    if (be != null) legend += `<text x="${(x(btcFwd.at(-1)[0]) - 6).toFixed(1)}" y="${(y(be) - 14).toFixed(1)}" fill="${BTC}" font-size="19" font-weight="700" text-anchor="end" font-family="sans-serif">+2yr: ${be.toFixed(0)}%</text>`;
  }
  lines += poly(spx, SPX, 5.6);

  const chip = (i, c, t) => `<rect x="${W - mR - 285 + i * 150}" y="120" width="16" height="16" rx="3" fill="${c}"/><text x="${W - mR - 285 + i * 150 + 22}" y="133" fill="#e2e8f0" font-size="21" font-weight="700" font-family="sans-serif">${t}</text>`;
  if (multi) legend += chip(0, SPX, "SPX6900") + chip(1, BTC, "Bitcoin");
  const stickier = btcSameAge != null && curIlliq > btcSameAge;
  const hero = multi
    ? `${curIlliq.toFixed(0)}% illiquid — ${stickier ? "stickier than Bitcoin at the same age" : "vs Bitcoin at the same age"}`
    : `${curIlliq.toFixed(0)}% of supply is illiquid — held long-term, unlikely to move`;
  const foot = multi
    ? "illiquid = held 155 days+ · liquid = short-term + exchanges + LP · dashed = Bitcoin's next 24 months"
    : "illiquid = held 155 days+ by long-term holders · liquid = short-term + exchanges + LP · on-chain, reproducible";
  const curX = x(spxLastDay), curY = y(curIlliq);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ilbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="ilfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SPX}" stop-opacity="0.45"/><stop offset="60%" stop-color="${SPX}" stop-opacity="0.12"/><stop offset="100%" stop-color="${SPX}" stop-opacity="0"/></linearGradient>
<filter id="ilglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#ilbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">${multi ? "ILLIQUID SUPPLY — SPX6900 vs BITCOIN, SAME AGE" : "SPX6900 — ILLIQUID SUPPLY"}</text>
<text x="60" y="100" fill="${SPX}" font-size="26" font-weight="800" font-family="sans-serif">${esc(hero)}</text>
${grid}${xlab}${lines}${legend}
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${SPX}" stroke="#05050e" stroke-width="3"/>
<text x="60" y="${(xAxisY + 44).toFixed(1)}" fill="#8592a6" font-size="16.5" font-family="sans-serif">${esc(foot)}</text>
</svg>`;
}

export function renderFreeFloatCard(stats, opts = {}) {
  const svg = freeFloatSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
