// "HODL Waves" card — supply split by holding age over time (stacked bands), from
// the Dune reconstruction. The classic Glassnode visual: fresh coins (recently moved)
// at the bottom in warm colours, long-held coins ("diamond hands") at the top in cool
// colours. The story: SPX supply has MATURED — 100% was <1 month old at launch; now
// ~38% hasn't moved in over a year. A conviction/holding-behaviour read, NOT a signal.
// Data: stats.onchain (age[5] = [<1m, 1-3m, 3-6m, 6-12m, >12m]). Bands sum to ~100%.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// bottom → top = youngest → oldest (warm → cool), oldest is the diamond-hands tier.
const BANDS = [
  { k: 0, label: "0–1m", c: "#f87171" },
  { k: 1, label: "1–3m", c: "#fb923c" },
  { k: 2, label: "3–6m", c: "#fbbf24" },
  { k: 3, label: "6–12m", c: "#38bdf8" },
  { k: 4, label: "1y+", c: "#818cf8" },
];

export function hodlWavesSvg(stats, opts = {}) {
  const raw = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5).map(r => ({ ts: Date.parse(r.d), age: r.age }));
  if (raw.length < 50) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const cur = raw.at(-1), oldPct = cur.age[4];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 132, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH; // 0–100% stacked

  // Cumulative upper edge per band (band 0 at bottom). cum[i] = sum of bands 0..i.
  const cumAt = (age, i) => { let s = 0; for (let k = 0; k <= i; k++) s += age[k]; return s; };

  // Each band is the ribbon between its lower edge (cum i-1) and upper edge (cum i).
  let ribbons = "";
  for (let i = 0; i < 5; i++) {
    const top = raw.map(r => `${x(r.ts).toFixed(1)},${y(cumAt(r.age, i)).toFixed(1)}`);
    const bot = raw.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : cumAt(r.age, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.82" stroke="#05050e" stroke-width="0.6"/>`;
  }

  let grid = "", yl = "";
  for (const v of [0, 25, 50, 75, 100]) {
    yl += `<text x="${mL - 12}" y="${(y(v) + 7).toFixed(1)}" fill="#a3aec0" font-size="22" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // Right-edge legend: each band's current share, positioned at its ribbon's mid-height.
  let legend = "";
  for (let i = 4; i >= 0; i--) {
    const mid = (i === 0 ? 0 : cumAt(cur.age, i - 1)) + cur.age[i] / 2;
    const yy = Math.max(mT + 12, Math.min(mT + pH - 6, y(mid)));
    legend += `<rect x="${W - mR + 14}" y="${(yy - 9).toFixed(1)}" width="14" height="14" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 34}" y="${(yy + 3).toFixed(1)}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${esc(BANDS[i].label + " " + cur.age[i].toFixed(0) + "%")}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="hwbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#hwbg)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HODL WAVES</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="sans-serif">How long has supply been sitting still? Cool bands = held longer.</text>
<text x="60" y="128" fill="${BANDS[4].c}" font-size="28" font-weight="800" font-family="sans-serif">${oldPct.toFixed(0)}% of supply hasn't moved in over a year</text>
${ribbons}${yl}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · supply by holding age (ETH-native) · older = held longer")}</text>
</svg>`;
}

export function renderHodlWavesCard(stats, opts = {}) {
  const svg = hodlWavesSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
