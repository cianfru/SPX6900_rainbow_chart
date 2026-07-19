// "Bitcoin HODL Waves" card — BTC supply split by holding age over its ENTIRE life
// (2009→now), stacked bands. Same visual as our SPX hodlwaves (the owner's favourite:
// clean, colorful, impactful) so the two read side by side — "the king's waves." UTXO
// age is EXACT (the original Unchained method), reconstructed once from the free BigQuery
// public dataset (bigquery/btc_hodl_waves.sql). The classic story: the 1y+ diamond tier
// SWELLS through every bear (coins go dormant, accumulation) and DRAINS into every bull
// (old coins wake up and sell). Data: src/btc-hodl-waves.js. A holding-behaviour read.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// bottom → top = youngest → oldest (warm → cool), oldest is the diamond-hands tier.
const BANDS = [
  { k: 0, label: "0–1m", c: "#f87171" },
  { k: 1, label: "1–3m", c: "#fb923c" },
  { k: 2, label: "3–6m", c: "#fbbf24" },
  { k: 3, label: "6–12m", c: "#38bdf8" },
  { k: 4, label: "1y+", c: "#818cf8" },
];

export function btcHodlWavesSvg(opts = {}) {
  const raw = BTC_HODL.filter(r => Array.isArray(r[1]) && r[1].length === 5)
    .map(r => ({ ts: Date.parse(r[0]), age: r[1] })).sort((a, b) => a.ts - b.ts);
  if (raw.length < 50) return null;
  const cur = raw.at(-1), oldPct = cur.age[4];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 132, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH; // 0–100% stacked

  const cumAt = (age, i) => { let s = 0; for (let k = 0; k <= i; k++) s += age[k]; return s; };

  let ribbons = "";
  for (let i = 0; i < 5; i++) {
    const top = raw.map(r => `${x(r.ts).toFixed(1)},${y(cumAt(r.age, i)).toFixed(1)}`);
    const bot = raw.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : cumAt(r.age, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.82" stroke="#05050e" stroke-width="0.5"/>`;
  }

  let yl = "";
  for (const v of [0, 25, 50, 75, 100]) {
    yl += `<text x="${mL - 12}" y="${(y(v) + 8).toFixed(1)}" fill="#e2e8f0" font-size="25" font-weight="600" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr += 2) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#cbd5e1" font-size="24" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // Right-edge legend: each band's current share, at its ribbon's mid-height.
  let legend = "";
  for (let i = 4; i >= 0; i--) {
    const mid = (i === 0 ? 0 : cumAt(cur.age, i - 1)) + cur.age[i] / 2;
    const yy = Math.max(mT + 14, Math.min(mT + pH - 8, y(mid)));
    legend += `<rect x="${W - mR + 14}" y="${(yy - 10).toFixed(1)}" width="16" height="16" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 36}" y="${(yy + 4).toFixed(1)}" fill="#e2e8f0" font-size="20" font-weight="600" font-family="sans-serif">${esc(BANDS[i].label + " " + cur.age[i].toFixed(0) + "%")}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bhwbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bhwbg)"/>
<text x="60" y="56" fill="#f8fafc" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">BITCOIN — HODL WAVES</text>
<text x="60" y="90" fill="#aab6c8" font-size="21" font-family="sans-serif">How long has BTC supply been sitting still? Cool bands = held longer.</text>
<text x="60" y="128" fill="${BANDS[4].c}" font-size="28" font-weight="800" font-family="sans-serif">${oldPct.toFixed(0)}% of all Bitcoin hasn't moved in over a year</text>
${ribbons}${yl}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · BTC supply by UTXO age, genesis→now · on-chain, reproducible")}</text>
</svg>`;
}

export function renderBtcHodlWavesCard(opts = {}) {
  const svg = btcHodlWavesSvg(opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
