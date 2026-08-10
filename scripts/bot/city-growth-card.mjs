// "SPX City is growing" — the flagship city card. Citizens (wallets ≥5,000 SPX held 90 days) stacked
// by size cohort over time, rising left→right like a city skyline, on the dusk-blue city background.
// The stacked area IS the cityscape. A thin SPX price line shows the count climbing THROUGH the
// drawdown — adoption decoupled from price. Data: public/city-history.json (weekly seed → daily in CI).
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// One decimal on millions to match CityHistoryChart's fUsd exactly, so the card and the site chart
// can never show a different-looking city TVL ($190.2M on both, not $190M vs $190.2M).
const fUsd = v => v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k";
const fNum = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toString();

export function loadCityHistory() {
  try {
    const d = JSON.parse(readFileSync(new URL("../../public/city-history.json", import.meta.url), "utf8"));
    return Array.isArray(d?.rows) && d.rows.length && Array.isArray(d.labels) ? d : null;
  } catch { return null; }
}

// Memoized summary for the post copy (no Resvg import needed by posts.mjs).
let _cache;
export function cityGrowthStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d) return (_cache = null);
  const NC = d.labels.length;
  const tot = (r, o) => r.slice(2 + o * NC, 2 + o * NC + NC).reduce((s, v) => s + v, 0);
  const first = d.rows[0], last = d.rows.at(-1);
  const c0 = tot(first, 0), cNow = tot(last, 0), vNow = tot(last, 1);
  const back = d.res === "daily" ? 30 : 4;
  const prev = d.rows[Math.max(0, d.rows.length - 1 - back)];
  const dM = cNow - tot(prev, 0);
  return (_cache = { citizens: cNow, tvl: vNow, c0, growth: c0 ? cNow / c0 : 0, dMonth: dM, updated: d.updated });
}

export function cityGrowthSvg(doc, opts = {}) {
  const NC = doc.labels.length, cols = doc.colors;
  const rows = doc.rows.map(r => {
    const cts = r.slice(2, 2 + NC), tv = r.slice(2 + NC);
    return { ts: Date.parse(r[0]), price: r[1], cts, cTot: cts.reduce((s, v) => s + v, 0), vTot: tv.reduce((s, v) => s + v, 0) };
  }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  const first = rows[0], cur = rows.at(-1);
  const growth = first.cTot ? cur.cTot / first.cTot : 0;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 58, mT = 168, mB = 74, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = first.ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const maxC = Math.max(...rows.map(r => r.cTot)) * 1.04;
  const y = v => mT + (1 - v / maxC) * pH;
  // price line (log) on the right
  const prices = rows.map(r => r.price).filter(p => p > 0);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);
  const ly = p => { const lo = Math.log(pMin), hi = Math.log(pMax); return mT + (1 - (Math.log(Math.max(p, pMin)) - lo) / ((hi - lo) || 1)) * pH; };

  // stacked cohort areas (bottom = smallest cohort, warm → cool going up), opaque = the cityscape mass
  let areas = "";
  const cum = rows.map(() => 0);
  for (let ci = 0; ci < NC; ci++) {
    const top = rows.map((r, i) => { cum[i] += r.cts[ci]; return cum[i]; });
    const base = top.map((t, i) => t - rows[i].cts[ci]);
    const up = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(top[i]).toFixed(1)}`).join(" ");
    const dn = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(base[i]).toFixed(1)}`).reverse().join(" ");
    areas += `<polygon points="${up} ${dn}" fill="${cols[ci]}" fill-opacity="0.9"/>`;
  }
  // top outline for crispness
  const outline = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(r.cTot).toFixed(1)}`).join(" ");
  const priceLine = rows.filter(r => r.price > 0).map(r => `${x(r.ts).toFixed(1)},${ly(r.price).toFixed(1)}`).join(" ");

  // gridlines + y labels (citizens)
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
  // cohort colour-ramp legend, top-right: swatches small→big with end labels
  const sw = 26, gap = 4, lw = NC * sw + (NC - 1) * gap, lx0 = W - mR - lw;
  let legend = `<text x="${(W - mR).toFixed(1)}" y="70" fill="#8fa0b6" font-size="17" text-anchor="end" font-family="sans-serif">by wallet size</text>`;
  for (let i = 0; i < NC; i++) legend += `<rect x="${(lx0 + i * (sw + gap)).toFixed(1)}" y="84" width="${sw}" height="12" rx="2" fill="${cols[i]}" fill-opacity="0.92"/>`;
  legend += `<text x="${lx0.toFixed(1)}" y="118" fill="#8fa0b6" font-size="16" font-family="sans-serif">5k</text>`
    + `<text x="${(lx0 + lw).toFixed(1)}" y="118" fill="#8fa0b6" font-size="16" text-anchor="end" font-family="sans-serif">5M+</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { skyline: false })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX CITY IS GROWING</text>
<text x="60" y="104" fill="#67e8f9" font-size="32" font-weight="800" font-family="sans-serif">${cur.cTot.toLocaleString()} citizens · ${fUsd(cur.vTot)} value</text>
<text x="60" y="140" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`${growth >= 2 ? growth.toFixed(1) + "×" : "+" + Math.round((growth - 1) * 100) + "%"} more residents since launch — built through the drawdown`)}</text>
${grid}${xlab}
${areas}
<polyline points="${outline}" fill="none" stroke="#e0f2fe" stroke-width="1.6" stroke-opacity="0.55"/>
<polyline points="${priceLine}" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-opacity="0.85" stroke-dasharray="6 5"/>
<text x="${W - mR}" y="${(ly(cur.price) - 10).toFixed(1)}" fill="#cbd5e1" font-size="18" text-anchor="end" font-family="sans-serif">SPX $${cur.price < 0.1 ? cur.price.toFixed(3) : cur.price.toFixed(2)}</text>
${legend}
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · citizen = ≥5,000 SPX held 90 days · stacked by size cohort · ETH-native · not financial advice")}</text>
</svg>`;
}

export function renderCityGrowthCard(_stats, opts = {}) {
  const doc = loadCityHistory();
  return doc ? png(cityGrowthSvg(doc, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
