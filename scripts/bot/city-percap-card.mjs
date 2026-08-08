// "From whales to a retail city" — the per-capita story. The MEDIAN resident's holding fell from a
// whale-sized ~196k SPX at launch to ~14k today as the base broadened into a retail crowd, while the
// MEAN sits far above (a few big wallets). Honest twist: in dollars the median resident is worth ~9×
// more than at launch (price rose more than holdings shrank). Data: public/city-history.json.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";
import { loadCityHistory } from "./city-growth-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fTok = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : Math.round(v).toString();
const fUsd = v => v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "k" : "$" + Math.round(v);

let _cache;
export function cityPercapStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d?.perCapita?.length) return (_cache = null);
  const NC = d.labels.length;
  const priceOf = new Map(d.rows.map(r => [r[0], r[1]]));
  const meanOf = new Map(d.rows.map(r => {
    let c = 0, v = 0; for (let i = 0; i < NC; i++) { c += r[2 + i]; v += r[2 + NC + i]; }
    return [r[0], c ? (r[1] ? v / r[1] : 0) / c : 0];
  }));
  const pts = d.perCapita.filter(p => p[1] > 0).map(([date, med]) => ({ date, med, mean: meanOf.get(date) || 0, price: priceOf.get(date) || 0 }));
  const first = pts[0], last = pts.at(-1);
  const usd0 = first.med * first.price, usdNow = last.med * last.price;
  return (_cache = { pts, med0: first.med, medNow: last.med, meanNow: last.mean, usdNow, usdGrowth: usd0 ? usdNow / usd0 : 0 });
}

export function cityPercapSvg(s, opts = {}) {
  const { pts } = s;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 88, mR = 58, mT = 172, mB = 74, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1).date);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const lo = 3e3, hi = Math.max(...pts.map(p => Math.max(p.med, p.mean))) * 1.1;   // log range
  const y = v => mT + (1 - (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * pH;

  let grid = "";
  for (const v of [3e3, 1e4, 3e4, 1e5, 3e5, 1e6]) {
    if (v < lo || v > hi) continue;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="sans-serif">${fTok(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  const medLine = pts.map(p => `${x(Date.parse(p.date)).toFixed(1)},${y(p.med).toFixed(1)}`).join(" ");
  const meanLine = pts.map(p => `${x(Date.parse(p.date)).toFixed(1)},${y(p.mean).toFixed(1)}`).join(" ");
  const endMed = pts.at(-1), ey = y(endMed.med);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { glow: "#c084fc", skyline: false })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">FROM WHALES TO A RETAIL CITY</text>
<text x="60" y="104" fill="#d8b4fe" font-size="30" font-weight="800" font-family="sans-serif">The median resident holds ${fTok(s.medNow)} SPX — down from ${fTok(s.med0)} at launch</text>
<text x="60" y="142" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`Broadened from a few whales into a retail crowd — yet worth ${fUsd(s.usdNow)} in dollars, ~${s.usdGrowth.toFixed(1)}× launch.`)}</text>
${grid}${xlab}
<polyline points="${meanLine}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-opacity="0.85" stroke-dasharray="6 5"/>
<polyline points="${medLine}" fill="none" stroke="#c084fc" stroke-width="3.4"/>
<circle cx="${x(t1).toFixed(1)}" cy="${ey.toFixed(1)}" r="6" fill="#c084fc"/>
<text x="${(x(t1) - 14).toFixed(1)}" y="${(ey + 30).toFixed(1)}" fill="#c084fc" font-size="19" font-weight="700" text-anchor="end" font-family="sans-serif">median</text>
<text x="${(x(t1) - 14).toFixed(1)}" y="${(y(pts.at(-1).mean) - 12).toFixed(1)}" fill="#67e8f9" font-size="19" text-anchor="end" font-family="sans-serif">mean</text>
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · resident = ≥5,000 SPX held 90 days · median vs mean · log scale · not financial advice")}</text>
</svg>`;
}

export function renderCityPercapCard(_stats, opts = {}) {
  const s = cityPercapStats();
  return s ? png(cityPercapSvg(s, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
