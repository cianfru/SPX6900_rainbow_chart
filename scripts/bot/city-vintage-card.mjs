// "Who's still here, by when they arrived" — survivorship by arrival quarter. Of every wallet that
// became a resident in a given quarter, the share still resident today: the launch crowd is nearly
// gone (~3%), each later cohort reads higher (partly conviction, partly right-censoring — recent
// arrivals haven't had time to leave). Bars coloured red→amber→green by survival. Data: city-history.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";
import { loadCityHistory } from "./city-growth-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const col = p => p >= 50 ? "#4ade80" : p >= 25 ? "#fbbf24" : "#f87171";

let _cache;
export function cityVintageStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d?.vintages?.length) return (_cache = null);
  const vintages = d.vintages.filter(v => v.arrived >= 20);
  return (_cache = { vintages, launch: vintages[0], recent: vintages.at(-1) });
}

export function cityVintageSvg(s, opts = {}) {
  const V = s.vintages;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 70, mR = 40, mT = 168, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const n = V.length, slot = pW / n, bw = slot * 0.66;
  const y = p => mT + (1 - p / 100) * pH;

  let grid = "";
  for (const p of [0, 25, 50, 75, 100]) {
    const yy = y(p).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="sans-serif">${p}%</text>`;
  }
  let bars = "";
  V.forEach((v, i) => {
    const cx = mL + slot * i + slot / 2, bh = mT + pH - y(v.pct), by = y(v.pct);
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${col(v.pct)}" fill-opacity="0.9"/>`
      + `<text x="${cx.toFixed(1)}" y="${(by - 10).toFixed(1)}" fill="#e2e8f0" font-size="18" font-weight="700" text-anchor="middle" font-family="sans-serif">${Math.round(v.pct)}%</text>`
      + `<text x="${cx.toFixed(1)}" y="${(mT + pH + 26).toFixed(1)}" fill="#93a3b8" font-size="16" text-anchor="middle" font-family="sans-serif" transform="rotate(-32 ${cx.toFixed(1)} ${(mT + pH + 26).toFixed(1)})">${esc(v.label)}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { glow: "#4ade80", maxTower: 0.16 })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">WHO'S STILL HERE, BY ARRIVAL</text>
<text x="60" y="104" fill="#86efac" font-size="30" font-weight="800" font-family="sans-serif">The launch crowd is nearly gone — just ${Math.round(s.launch.pct)}% remain</text>
<text x="60" y="142" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`Of each arrival quarter, the share still resident today — recent cohorts read high (right-censored).`)}</text>
${grid}${bars}
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · survival = share of an arrival quarter still resident today · right-censored · not financial advice")}</text>
</svg>`;
}

export function renderCityVintageCard(_stats, opts = {}) {
  const s = cityVintageStats();
  return s ? png(cityVintageSvg(s, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
