// "SPX City — total value" — the DOLLAR sibling of the citizens card. Same stacked-by-cohort city,
// but the height is USD TVL (Σ every resident's balance × SPX price), not the head-count. The shape
// is deliberately different from the growth card: the citizen count climbed and plateaued, but the
// VALUE rode the price cycle — it ballooned into the 2025 top and round-tripped back down. Told next
// to the growth card, the two are the whole "adoption decoupled from price" story: people stayed,
// dollars followed the chart. Data: public/city-history.json (weekly seed → daily in CI). Hand-postable.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";
import { loadCityHistory } from "./city-growth-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// $ with one decimal on millions (matches CityHistoryChart + the growth card) and two on billions.
const fUsd = v => v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k";
const fAxis = v => v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + Math.round(v / 1e6) + "M" : v > 0 ? "$" + Math.round(v / 1e3) + "k" : "$0";

// Summary for the post copy (no Resvg import needed by posts.mjs): current + all-time peak value.
let _cache;
export function cityValueStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d) return (_cache = null);
  const NC = d.labels.length;
  const vOf = r => r.slice(2 + NC, 2 + 2 * NC).reduce((s, v) => s + v, 0);
  const cur = d.rows.at(-1), curV = vOf(cur);
  let peak = d.rows[0], peakV = vOf(d.rows[0]);
  for (const r of d.rows) { const v = vOf(r); if (v > peakV) { peakV = v; peak = r; } }
  return (_cache = {
    value: curV, peak: peakV, peakDate: peak[0], price: cur[1],
    drawdown: peakV > 0 ? 1 - curV / peakV : 0, fromPeak: curV > 0 ? peakV / curV : 0, updated: d.updated,
  });
}

export function cityValueSvg(doc, opts = {}) {
  const NC = doc.labels.length, cols = doc.colors;
  const rows = doc.rows.map(r => {
    const tv = r.slice(2 + NC, 2 + 2 * NC);
    return { ts: Date.parse(r[0]), price: r[1], tv, vTot: tv.reduce((s, v) => s + v, 0) };
  }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  const first = rows[0], cur = rows.at(-1);
  let peak = rows[0]; for (const r of rows) if (r.vTot > peak.vTot) peak = r;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 58, mT = 168, mB = 74, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = first.ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const maxV = peak.vTot * 1.06;
  const y = v => mT + (1 - v / maxV) * pH;
  // price line (log) on the right, for the "value follows price" read
  const prices = rows.map(r => r.price).filter(p => p > 0);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);
  const ly = p => { const lo = Math.log(pMin), hi = Math.log(pMax); return mT + (1 - (Math.log(Math.max(p, pMin)) - lo) / ((hi - lo) || 1)) * pH; };

  // stacked cohort $ areas (bottom = smallest cohort, warm → cool going up)
  let areas = "";
  const cum = rows.map(() => 0);
  for (let ci = 0; ci < NC; ci++) {
    const top = rows.map((r, i) => { cum[i] += r.tv[ci]; return cum[i]; });
    const base = top.map((t, i) => t - rows[i].tv[ci]);
    const up = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(top[i]).toFixed(1)}`).join(" ");
    const dn = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(base[i]).toFixed(1)}`).reverse().join(" ");
    areas += `<polygon points="${up} ${dn}" fill="${cols[ci]}" fill-opacity="0.9"/>`;
  }
  const outline = rows.map((r, i) => `${x(r.ts).toFixed(1)},${y(r.vTot).toFixed(1)}`).join(" ");
  const priceLine = rows.filter(r => r.price > 0).map(r => `${x(r.ts).toFixed(1)},${ly(r.price).toFixed(1)}`).join(" ");

  // gridlines + $ y labels
  let grid = "";
  const stepV = maxV > 1e9 ? 250e6 : maxV > 4e8 ? 100e6 : 50e6;
  for (let v = 0; v <= maxV; v += stepV) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${fAxis(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  // peak marker
  const peakX = x(peak.ts), peakY = y(peak.vTot);
  const peakLbl = `<line x1="${peakX.toFixed(1)}" y1="${(peakY - 4).toFixed(1)}" x2="${peakX.toFixed(1)}" y2="${mT}" stroke="#e0f2fe" stroke-width="1.2" stroke-opacity="0.35" stroke-dasharray="3 4"/>`
    + `<circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="5" fill="#e0f2fe"/>`
    + `<text x="${Math.min(peakX + 12, W - mR - 130).toFixed(1)}" y="${(peakY + 4).toFixed(1)}" fill="#e0f2fe" font-size="19" font-weight="700" font-family="sans-serif">peak ${fUsd(peak.vTot)}</text>`;

  // cohort colour-ramp legend, top-right
  const sw = 26, gap = 4, lw = NC * sw + (NC - 1) * gap, lx0 = W - mR - lw;
  let legend = `<text x="${(W - mR).toFixed(1)}" y="70" fill="#8fa0b6" font-size="17" text-anchor="end" font-family="sans-serif">by wallet size</text>`;
  for (let i = 0; i < NC; i++) legend += `<rect x="${(lx0 + i * (sw + gap)).toFixed(1)}" y="84" width="${sw}" height="12" rx="2" fill="${cols[i]}" fill-opacity="0.92"/>`;
  legend += `<text x="${lx0.toFixed(1)}" y="118" fill="#8fa0b6" font-size="16" font-family="sans-serif">5k</text>`
    + `<text x="${(lx0 + lw).toFixed(1)}" y="118" fill="#8fa0b6" font-size="16" text-anchor="end" font-family="sans-serif">5M+</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { skyline: false })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX CITY — TOTAL VALUE</text>
<text x="60" y="104" fill="#a3e635" font-size="32" font-weight="800" font-family="sans-serif">${fUsd(cur.vTot)} today · peaked ${fUsd(peak.vTot)}</text>
<text x="60" y="140" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc("Every resident's holdings × SPX price — the count held, the value rode the cycle")}</text>
${grid}${xlab}
${areas}
<polyline points="${outline}" fill="none" stroke="#e0f2fe" stroke-width="1.6" stroke-opacity="0.55"/>
<polyline points="${priceLine}" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-opacity="0.85" stroke-dasharray="6 5"/>
<text x="${W - mR}" y="${(ly(cur.price) - 10).toFixed(1)}" fill="#cbd5e1" font-size="18" text-anchor="end" font-family="sans-serif">SPX $${cur.price < 0.1 ? cur.price.toFixed(3) : cur.price.toFixed(2)}</text>
${peakLbl}
${legend}
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · value = resident balance × SPX price · stacked by size cohort · ETH-native · not financial advice")}</text>
</svg>`;
}

export function renderCityValueCard(_stats, opts = {}) {
  const doc = loadCityHistory();
  return doc ? png(cityValueSvg(doc, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
