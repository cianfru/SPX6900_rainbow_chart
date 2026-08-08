// "SPX City's changing skyline" — residents drawn as building TYPES over time, using the same height
// rule the 3D city uses (holdings × hold-time, relative to the biggest → glass tower / concrete
// mid-rise / masonry / low-rise). The stacked area IS the skyline: a thin crown of glass towers over
// a base that sprawled outward in brick as retail arrived. Data: public/city-history.json (skyline).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";
import { loadCityHistory } from "./city-growth-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fNum = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toString();

let _cache;
export function citySkylineStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d?.skyline?.length) return (_cache = null);
  const NT = d.skylineLabels.length;
  const sum = r => r.slice(1).reduce((a, b) => a + b, 0);
  const first = d.skyline[0], last = d.skyline.at(-1);
  return (_cache = {
    towerNow: last[1], towerShareNow: last[1] / sum(last) * 100, towerShare0: first[1] / sum(first) * 100,
    lowNow: last[NT], lowShareNow: last[NT] / sum(last) * 100, total: sum(last),
  });
}

export function citySkylineSvg(doc, opts = {}) {
  const NT = doc.skylineLabels.length, cols = doc.skylineColors;
  const rows = doc.skyline.map(r => ({ ts: Date.parse(r[0]), t: r.slice(1), tot: r.slice(1).reduce((a, b) => a + b, 0) }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  const cur = rows.at(-1);
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 58, mT = 168, mB = 74, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const maxC = Math.max(...rows.map(r => r.tot)) * 1.04;
  const y = v => mT + (1 - v / maxC) * pH;

  // stacked areas, drawn low-rise (bottom) → glass tower (crown). Data order is tower..low-rise, so
  // stack from the LAST index up.
  let areas = "";
  const cum = rows.map(() => 0);
  for (let ti = NT - 1; ti >= 0; ti--) {
    const top = rows.map((r, i) => { cum[i] += r.t[ti]; return cum[i]; });
    const base = top.map((v, i) => v - rows[i].t[ti]);
    const up = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(top[i]).toFixed(1)}`).join(" ");
    const dn = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(base[i]).toFixed(1)}`).reverse().join(" ");
    areas += `<polygon points="${up} ${dn}" fill="${cols[ti]}" fill-opacity="0.9"/>`;
  }

  let grid = "";
  const step = maxC > 4000 ? 1000 : maxC > 2000 ? 500 : 250;
  for (let v = 0; v <= maxC; v += step) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${fNum(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  // legend, top-right: swatch + label per building type (tower → low-rise)
  let legend = "";
  doc.skylineLabels.forEach((lb, i) => {
    const ly = 82 + i * 24;
    legend += `<rect x="${W - mR - 214}" y="${ly - 12}" width="16" height="16" rx="3" fill="${cols[i]}"/>`
      + `<text x="${W - mR - 192}" y="${ly + 1}" fill="#c3cedd" font-size="17" font-family="sans-serif">${esc(lb)}</text>`;
  });

  const s = citySkylineStats();
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { glow: "#38bdf8", skyline: false })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX CITY'S CHANGING SKYLINE</text>
<text x="60" y="104" fill="#7dd3fc" font-size="30" font-weight="800" font-family="sans-serif">${s.towerNow} glass towers crown a city of ${fNum(s.total)} buildings</text>
<text x="60" y="140" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`Height = holdings × hold-time, same rule as the 3D city.`)}</text>
${grid}${xlab}
${areas}
${legend}
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · building type = holdings × hold-time, like the 3D city · ETH-native · not financial advice")}</text>
</svg>`;
}

export function renderCitySkylineCard(_stats, opts = {}) {
  const doc = loadCityHistory();
  return doc?.skyline?.length ? png(citySkylineSvg(doc, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
