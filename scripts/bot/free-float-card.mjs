// "Free Float" card — the share of supply that's actually LIQUID (changed hands in the
// last ~6 months), over age since launch. SPX6900 (yellow) vs Bitcoin (orange) on the SAME
// on-chain definition, aligned by age and cropped to SPX's age: "at the same age, is SPX's
// float tighter than the king's was?" Both derived from HODL age bands (free float =
// 100 − share aged 6m+), so it's a consistent, fully-citeable comparison — the honest
// answer to the black-box "supply squeeze composite". Falls from ~100% at launch as coins
// mature into strong hands. A holder-behaviour POSITION, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const SPX = "#fbbf24", BTC = "#fb923c";
const ffAt = (series, day) => { // nearest ff at a given day
  if (!series.length) return null;
  let best = series[0];
  for (const p of series) if (Math.abs(p[0] - day) < Math.abs(best[0] - day)) best = p;
  return best[1];
};

export function freeFloatSvg(stats, opts = {}) {
  const oc = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
  if (oc.length < 50) return null;
  const launch = Date.parse(oc[0].d);
  const spx = oc.map(r => [(Date.parse(r.d) - launch) / 86400000, 100 - (r.age[3] + r.age[4])]);
  const curFF = spx.at(-1)[1], spxLastDay = spx.at(-1)[0];

  // Bitcoin free float from its HODL age bands (free BigQuery UTXO reconstruction), same
  // 6-month "moved" definition, cropped to SPX's age → an apples-to-apples same-age race.
  const bt0 = BTC_HODL.length ? Date.parse(BTC_HODL[0][0]) : 0;
  const btc = BTC_HODL
    .map(r => [(Date.parse(r[0]) - bt0) / 86400000, 100 - (r[1][3] + r[1][4])])
    .filter(p => p[0] <= spxLastDay + 20);
  const multi = btc.length > 20;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 60, mT = 130, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const YR = 365.25;
  const d1 = spxLastDay || 1;
  const x = d => mL + (d / d1) * pW, y = v => mT + ((100 - v) / 80) * pH; // y: 20%..100%

  let grid = "";
  for (const v of [20, 40, 60, 80, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.12)"/><text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#e2e8f0" font-size="26" font-weight="600" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  const xAxisY = mT + pH + 32;
  let xlab = "";
  for (let yr = 0; yr * YR <= d1 + 15; yr++) {
    const d = yr * YR;
    xlab += `<text x="${x(d).toFixed(1)}" y="${xAxisY.toFixed(1)}" fill="#cbd5e1" font-size="23" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr === 0 ? "launch" : yr + "yr"}</text>`;
  }

  const poly = (series, color, w) => `<polyline points="${series.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  let lines = "", legend = "", hero, foot;

  if (multi) {
    lines = poly(btc, BTC, 3.6)
      + `<polyline points="${spx.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${SPX}" stroke-width="12" stroke-opacity="0.28" stroke-linejoin="round" filter="url(#ffglow)"/>`
      + poly(spx, SPX, 4.5);
    const chip = (i, c, t) => `<rect x="${W - mR - 285 + i * 150}" y="118" width="16" height="16" rx="3" fill="${c}"/><text x="${W - mR - 285 + i * 150 + 22}" y="131" fill="#e2e8f0" font-size="21" font-weight="700" font-family="sans-serif">${t}</text>`;
    legend = chip(0, SPX, "SPX6900") + chip(1, BTC, "Bitcoin");
    const btcA = ffAt(btc, spxLastDay);
    const tighter = btcA != null && curFF < btcA;
    hero = `${curFF.toFixed(0)}% liquid — ${tighter ? "a tighter float than Bitcoin at the same age" : "vs Bitcoin at the same age"}`;
    foot = "free float = supply that moved in the last 6 months · SPX vs Bitcoin from on-chain age, same age since launch · reproducible";
  } else {
    // SPX-only (peers not banked yet): keep the exp-decay trend
    const n = spx.length, xs = spx.map(p => p[0]), ys = spx.map(p => Math.log(Math.max(p[1], 1)));
    const sx = xs.reduce((a, v) => a + v, 0), sy = ys.reduce((a, v) => a + v, 0);
    const sxx = xs.reduce((a, v) => a + v * v, 0), sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
    const fitLine = spx.map(p => `${x(p[0]).toFixed(1)},${y(Math.exp(a + b * p[0])).toFixed(1)}`).join(" ");
    const area = `${mL},${(mT + pH).toFixed(1)} ${spx.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
    lines = `<polygon points="${area}" fill="url(#fffill)"/>`
      + `<polyline points="${fitLine}" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="7 6" stroke-opacity="0.7"/>`
      + `<polyline points="${spx.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${SPX}" stroke-width="12" stroke-opacity="0.28" stroke-linejoin="round" filter="url(#ffglow)"/>`
      + poly(spx, SPX, 4.5);
    hero = `${curFF.toFixed(0)}% liquid — ${(100 - curFF).toFixed(0)}% hasn't moved in 6 months`;
    foot = "free float = supply that changed hands in the last 6 months · on-chain (Ethereum) · reproducible · not financial advice";
  }
  const curX = x(spxLastDay), curY = y(curFF);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ffbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="fffill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SPX}" stop-opacity="0.5"/><stop offset="55%" stop-color="${SPX}" stop-opacity="0.15"/><stop offset="100%" stop-color="${SPX}" stop-opacity="0"/></linearGradient>
<filter id="ffglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#ffbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">${multi ? "FREE FLOAT — SPX6900 vs BITCOIN, SAME AGE" : "SPX6900 — FREE FLOAT"}</text>
<text x="60" y="100" fill="${SPX}" font-size="26" font-weight="800" font-family="sans-serif">${esc(hero)}</text>
${legend}${grid}${xlab}
${lines}
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${SPX}" stroke="#05050e" stroke-width="3"/>
<text x="60" y="${(xAxisY + 44).toFixed(1)}" fill="#8592a6" font-size="16.5" font-family="sans-serif">${esc(foot)}</text>
</svg>`;
}

export function renderFreeFloatCard(stats, opts = {}) {
  const svg = freeFloatSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
