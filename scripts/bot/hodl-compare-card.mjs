// "HODL Waves — SPX6900 vs Bitcoin, same age" — the owner's favourite stacked-band visual,
// twice, aligned BY AGE (years since each launch), so you read how SPX's holder maturity
// stacks up against Bitcoin's at the SAME point in life. BTC is cropped to SPX's age (its
// full 17-year history isn't the point here). Minimal chrome — the bands ARE the story, the
// tweet explains. The honest reveal: at ~3 years old SPX already holds MORE of its supply
// for 1y+ than Bitcoin did at the same age (its base matured faster). Data: stats.onchain
// (SPX age bands) + src/btc-hodl-waves.js (BTC UTXO age, free BigQuery). Not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const YR = 365.25 * 86400000;
const BANDS = [
  { k: 0, label: "0–1m", c: "#f87171" },
  { k: 1, label: "1–3m", c: "#fb923c" },
  { k: 2, label: "3–6m", c: "#fbbf24" },
  { k: 3, label: "6–12m", c: "#38bdf8" },
  { k: 4, label: "1y+", c: "#818cf8" },
];
const cumAt = (age, i) => { let s = 0; for (let k = 0; k <= i; k++) s += age[k]; return s; };

// rows as {ax: age-in-years, age:[..]} from a [ts,age] series, cropped to maxAge
const toAged = (rows, maxAge) => {
  const t0 = rows[0].ts;
  return rows.map(r => ({ ax: (r.ts - t0) / YR, age: r.age })).filter(r => r.ax <= maxAge + 0.03);
};

// one stacked panel, x = age (shared scale across both panels → same x = same age)
function panel(rows, x, py, ph, name, oneYr) {
  if (rows.length < 2) return "";
  const y = v => py + (1 - v / 100) * ph;
  let ribbons = "";
  for (let i = 0; i < 5; i++) {
    const top = rows.map(r => `${x(r.ax).toFixed(1)},${y(cumAt(r.age, i)).toFixed(1)}`);
    const bot = rows.map(r => `${x(r.ax).toFixed(1)},${y(i === 0 ? 0 : cumAt(r.age, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.86" stroke="#05050e" stroke-width="0.4"/>`;
  }
  let yl = "";
  for (const v of [0, 50, 100]) yl += `<text x="${(x(0) - 12).toFixed(1)}" y="${(y(v) + 7).toFixed(1)}" fill="#cbd5e1" font-size="20" font-weight="600" text-anchor="end" font-family="sans-serif">${v}</text>`;
  const hdr = `<text x="${x(0).toFixed(1)}" y="${(py - 12).toFixed(1)}" fill="#f8fafc" font-size="25" font-weight="800" font-family="sans-serif">${esc(name)}</text>`
    + `<text x="${x(rows.at(-1).ax).toFixed(1)}" y="${(py - 12).toFixed(1)}" fill="${BANDS[4].c}" font-size="25" font-weight="800" text-anchor="end" font-family="sans-serif">${oneYr.toFixed(0)}% held 1y+</text>`;
  return hdr + ribbons + yl;
}

export function hodlCompareSvg(stats, opts = {}) {
  const spxRows = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5)
    .map(r => ({ ts: Date.parse(r.d), age: r.age })).sort((a, b) => a.ts - b.ts);
  const btcRows = BTC_HODL.filter(r => Array.isArray(r[1]) && r[1].length === 5)
    .map(r => ({ ts: Date.parse(r[0]), age: r[1] })).sort((a, b) => a.ts - b.ts);
  if (spxRows.length < 50 || btcRows.length < 50) return null;
  const maxAge = (spxRows.at(-1).ts - spxRows[0].ts) / YR;
  const spx = toAged(spxRows, maxAge), btc = toAged(btcRows, maxAge);
  const spxOld = spx.at(-1).age[4], btcOld = btc.at(-1).age[4];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 168;
  const pw = W - mL - mR;
  const x = ax => mL + (ax / (maxAge || 1)) * pw;
  // Vertical layout derived from H so the two panels FILL any aspect ratio (the card
  // posts at the taller landscape AR — hardcoded y's left the bottom empty).
  const top = 96, hdrH = 34, footY = H - 16;
  const xLabY = footY - 34, panelBot = xLabY - 26; // reserve room for the age labels + footer
  const ph = (panelBot - top - 2 * hdrH) / 2;
  const pAy = top + hdrH, pBy = pAy + ph + hdrH;

  const panels = panel(spx, x, pAy, ph, "SPX6900", spxOld) + panel(btc, x, pBy, ph, "Bitcoin", btcOld);

  // shared age axis under the bottom panel (0 = launch, then whole years)
  let xax = "";
  for (let yr = 0; yr <= Math.round(maxAge); yr++) {
    if (yr > maxAge + 0.05) continue;
    xax += `<line x1="${x(yr).toFixed(1)}" y1="${panelBot.toFixed(1)}" x2="${x(yr).toFixed(1)}" y2="${(panelBot + 8).toFixed(1)}" stroke="#8592a6" stroke-width="1.5"/>`
      + `<text x="${x(yr).toFixed(1)}" y="${xLabY.toFixed(1)}" fill="#cbd5e1" font-size="21" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr === 0 ? "launch" : yr + "yr"}</text>`;
  }

  // band legend, right gutter — vertically centred on the two-panel region
  let legend = "";
  const legMid = (pAy + pBy + ph) / 2;
  for (let i = 4; i >= 0; i--) {
    const ly = legMid - 72 + (4 - i) * 36;
    legend += `<rect x="${W - mR + 26}" y="${(ly - 15).toFixed(1)}" width="18" height="18" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 52}" y="${ly.toFixed(1)}" fill="#e2e8f0" font-size="20" font-weight="600" font-family="sans-serif">${esc(BANDS[i].label)}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="hcbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#hcbg)"/>
<text x="60" y="58" fill="#f8fafc" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">HODL WAVES — SPX6900 vs BITCOIN, SAME AGE</text>
${panels}${xax}${legend}
<text x="60" y="${H - 16}" fill="#8592a6" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · supply by holding age, years since launch · on-chain, reproducible")}</text>
</svg>`;
}

export function renderHodlCompareCard(stats, opts = {}) {
  const svg = hodlCompareSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
