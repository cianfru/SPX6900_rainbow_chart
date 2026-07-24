// PROJECT AEON — "Holder Age / HODL Waves" card. The collection split by how long each
// token has sat with its current owner, over time (stacked bands). NFTs are clean: age =
// now − last transfer per tokenId, no FIFO. Fresh (recently traded) at the bottom in warm
// colours, long-held ("diamond") at the top in cool. The story: AEON has MATURED — ~77% of
// the 3,333 hasn't changed hands in over a year. A holding-behaviour read, NOT a signal.
// Data: public/aeon-onchain.json → series[{ d, age:[<1m,1-3m,3-6m,6-12m,1y+] }] (% of held).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// bottom → top = youngest → oldest (warm → cool); oldest = the long-held tier.
const BANDS = [
  { k: 0, label: "0–1m", c: "#f87171" },
  { k: 1, label: "1–3m", c: "#fb923c" },
  { k: 2, label: "3–6m", c: "#fbbf24" },
  { k: 3, label: "6–12m", c: "#38bdf8" },
  { k: 4, label: "1y+", c: "#818cf8" },
];

export function aeonHodlSvg(data, opts = {}) {
  const raw = (data.series || []).filter(r => Array.isArray(r.age) && r.age.length === 5).map(r => ({ ts: Date.parse(r.d), age: r.age }));
  if (raw.length < 30) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const cur = raw.at(-1), oldPct = cur.age[4];
  const supply = data.supply ?? 3333;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 132, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH; // 0–100% stacked
  const cumAt = (age, i) => { let s = 0; for (let k = 0; k <= i; k++) s += age[k]; return s; };

  let ribbons = "";
  for (let i = 0; i < 5; i++) {
    const top = raw.map(r => `${x(r.ts).toFixed(1)},${y(cumAt(r.age, i)).toFixed(1)}`);
    const bot = raw.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : cumAt(r.age, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.82" stroke="#05050e" stroke-width="0.6"/>`;
  }

  let yl = "";
  for (const v of [0, 25, 50, 75, 100]) {
    yl += `<text x="${mL - 12}" y="${(y(v) + 7).toFixed(1)}" fill="#a3aec0" font-size="22" text-anchor="end" font-family="sans-serif">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // Right-edge legend, de-collided: place each band at its ribbon mid-height, then push
  // successive (downward) rows apart so thin bottom bands (0–1m, 1–3m) don't overlap.
  let legend = "", prevY = -1e9;
  const GAP = 26;
  for (let i = 4; i >= 0; i--) {
    const mid = (i === 0 ? 0 : cumAt(cur.age, i - 1)) + cur.age[i] / 2;
    let yy = Math.max(mT + 12, Math.min(mT + pH - 6, y(mid)));
    if (yy < prevY + GAP) yy = prevY + GAP;
    prevY = yy;
    legend += `<rect x="${W - mR + 14}" y="${(yy - 9).toFixed(1)}" width="14" height="14" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 34}" y="${(yy + 3).toFixed(1)}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${esc(BANDS[i].label + " " + cur.age[i].toFixed(0) + "%")}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="awbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#awbg)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">PROJECT AEON — HOLDER AGE</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="sans-serif">How long since each AEON last changed hands? Cool bands = held longer.</text>
<text x="60" y="128" fill="${BANDS[4].c}" font-size="28" font-weight="800" font-family="sans-serif">${oldPct.toFixed(0)}% of the collection hasn't changed hands in over a year</text>
${ribbons}${yl}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc(`on-chain · ${supply.toLocaleString()} AEON · holder age = time since last transfer · older = held longer`)}</text>
</svg>`;
}

export function renderAeonHodlCard(data, opts = {}) {
  const svg = aeonHodlSvg(data, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
