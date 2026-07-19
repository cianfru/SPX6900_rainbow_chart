// "HODL Waves — SPX6900 vs Bitcoin" — the owner's favourite stacked-band visual, twice,
// as a COMPARISON (a standalone BTC card is off-brand on an SPX account; the point is the
// side-by-side). Two full-width panels: SPX on top (its ~3-year life), Bitcoin below (17
// years, genesis→now), same 5-band colour scheme. The honest story: both MATURE the same
// way — the cool 1y+ diamond band growing from the top — Bitcoin over 17 years, SPX in 3.
// Data: stats.onchain (SPX age bands) + src/btc-hodl-waves.js (BTC, free BigQuery UTXO
// reconstruction). A holding-behaviour read, NOT a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const BANDS = [
  { k: 0, label: "0–1m", c: "#f87171" },
  { k: 1, label: "1–3m", c: "#fb923c" },
  { k: 2, label: "3–6m", c: "#fbbf24" },
  { k: 3, label: "6–12m", c: "#38bdf8" },
  { k: 4, label: "1y+", c: "#818cf8" },
];
const cumAt = (age, i) => { let s = 0; for (let k = 0; k <= i; k++) s += age[k]; return s; };
const yrsSince = ts => (Date.now() - ts) / (365.25 * 86400000);

// draw one stacked HODL panel into rect (px,py,pw,ph) from rows [{ts,age}]
function panel(rows, px, py, pw, ph, label, sub) {
  if (rows.length < 2) return "";
  const t0 = rows[0].ts, t1 = rows.at(-1).ts;
  const x = t => px + ((t - t0) / ((t1 - t0) || 1)) * pw;
  const y = v => py + (1 - v / 100) * ph;
  let ribbons = "";
  for (let i = 0; i < 5; i++) {
    const top = rows.map(r => `${x(r.ts).toFixed(1)},${y(cumAt(r.age, i)).toFixed(1)}`);
    const bot = rows.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : cumAt(r.age, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.85" stroke="#05050e" stroke-width="0.4"/>`;
  }
  // y ticks 0/50/100 just left of the panel
  let yl = "";
  for (const v of [0, 50, 100]) yl += `<text x="${(px - 12).toFixed(1)}" y="${(y(v) + 7).toFixed(1)}" fill="#cbd5e1" font-size="20" font-weight="600" text-anchor="end" font-family="sans-serif">${v}</text>`;
  // year ticks under the panel
  let xl = "";
  const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
  const step = (y1 - y0) > 8 ? 3 : (y1 - y0) > 3 ? 2 : 1;
  for (let yr = y0; yr <= y1; yr += step) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xl += `<text x="${x(t).toFixed(1)}" y="${(py + ph + 26).toFixed(1)}" fill="#8592a6" font-size="19" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  const cur = rows.at(-1);
  const head = `<text x="${px + 4}" y="${(py - 12).toFixed(1)}" fill="#f8fafc" font-size="24" font-weight="800" font-family="sans-serif">${esc(label)} <tspan fill="#8592a6" font-size="19" font-weight="400">· ${esc(sub)}</tspan></text>`
    + `<text x="${(px + pw).toFixed(1)}" y="${(py - 12).toFixed(1)}" fill="${BANDS[4].c}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">${cur.age[4].toFixed(0)}% held 1y+</text>`;
  return head + ribbons + yl + xl;
}

export function hodlCompareSvg(stats, opts = {}) {
  const spx = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5)
    .map(r => ({ ts: Date.parse(r.d), age: r.age })).sort((a, b) => a.ts - b.ts);
  const btc = BTC_HODL.filter(r => Array.isArray(r[1]) && r[1].length === 5)
    .map(r => ({ ts: Date.parse(r[0]), age: r[1] })).sort((a, b) => a.ts - b.ts);
  if (spx.length < 50 || btc.length < 50) return null;
  const spxOld = spx.at(-1).age[4], btcOld = btc.at(-1).age[4];
  // full years elapsed — floor so we never overstate how long it "took".
  const spxYrs = Math.max(1, Math.floor(yrsSince(spx[0].ts) + 0.15)), btcYrs = Math.floor(yrsSince(btc[0].ts));

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 176;
  const pw = W - mL - mR;
  const pAy = 176, pBy = 400, ph = 168; // two stacked panels

  const panels = panel(spx, mL, pAy, pw, ph, "SPX6900", `${spxYrs.toFixed(0)} years`)
    + panel(btc, mL, pBy, pw, ph, "Bitcoin", `${btcYrs.toFixed(0)} years`);

  // shared legend in the right gutter (bottom → top = fresh → diamond)
  let legend = "";
  for (let i = 4; i >= 0; i--) {
    const ly = 210 + (4 - i) * 34;
    legend += `<rect x="${W - mR + 22}" y="${ly - 15}" width="17" height="17" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 46}" y="${ly - 1}" fill="#e2e8f0" font-size="20" font-weight="600" font-family="sans-serif">${esc(BANDS[i].label)}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="hcbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#hcbg)"/>
<text x="60" y="56" fill="#f8fafc" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">HODL WAVES — SPX6900 vs BITCOIN</text>
<text x="60" y="90" fill="#aab6c8" font-size="21" font-family="sans-serif">Supply by holding age. Cool bands = held longer — the diamond-hands tier grows from the top.</text>
<text x="60" y="128" fill="${BANDS[4].c}" font-size="27" font-weight="800" font-family="sans-serif">${spxOld.toFixed(0)}% of SPX6900 is held 1y+ in ${spxYrs.toFixed(0)} years — Bitcoin took ${btcYrs.toFixed(0)} to reach ${btcOld.toFixed(0)}%.</text>
${panels}${legend}
<text x="60" y="${H - 18}" fill="#8592a6" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · SPX age bands + Bitcoin UTXO age (genesis→now) · on-chain, reproducible")}</text>
</svg>`;
}

export function renderHodlCompareCard(stats, opts = {}) {
  const svg = hodlCompareSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
