// Build the rainbow chart as an SVG string from the model — shared by the social
// share image (api/og.js) and the X bot card. Pure (no rasterizer), so it works
// in any runtime; callers rasterize with their own tool.
import { DEFAULT_RAW } from "./data.js";
import * as M from "./models.js";

export function rainbowSvg(price, dateStr = new Date().toISOString().slice(0, 10)) {
  const m = M.buildModel(DEFAULT_RAW);
  const day = M.dayN(dateStr);
  const band = M.BAND_LABELS[M.bandIndex(m, price, day)];

  const W = 1200, H = 630, mL = 78, mR = 28, mT = 76, mB = 52;
  const pW = W - mL - mR, pH = H - mT - mB;

  const firstDay = M.dayN(DEFAULT_RAW[0].date);
  const lastDay = M.dayN(DEFAULT_RAW.at(-1).date);
  const nowDay = Math.max(lastDay, day);
  const dMin = Math.max(1, firstDay - 30);
  const dMax = nowDay + 150; // small projection so the band cone shows
  const days = [];
  const step = Math.max(1, Math.round((dMax - dMin) / 360));
  for (let d = dMin; d <= dMax; d += step) days.push(d);

  let minB = Infinity, maxB = -Infinity;
  for (const d of days) { minB = Math.min(minB, M.bandVal(m, d, 0)); maxB = Math.max(maxB, M.bandVal(m, d, 9)); }
  const yMin = minB * 0.7, yMax = maxB * 1.2;

  const x = d => mL + ((d - dMin) / (dMax - dMin)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / (Math.log(yMax) - Math.log(yMin))) * pH;

  let bands = "";
  for (let i = 0; i < 9; i++) {
    const top = days.map(d => `${x(d).toFixed(1)},${y(M.bandVal(m, d, i + 1)).toFixed(1)}`);
    const bot = days.map(d => `${x(d).toFixed(1)},${y(M.bandVal(m, d, i)).toFixed(1)}`).reverse();
    bands += `<polygon points="${[...top, ...bot].join(" ")}" fill="${M.BAND_LABELS[i].c}" fill-opacity="0.62"/>`;
  }
  const center = days.map(d => `${x(d).toFixed(1)},${y(Math.exp(m.predict(d))).toFixed(1)}`).join(" ");
  const priceLine = DEFAULT_RAW.map(r => `${x(M.dayN(r.date)).toFixed(1)},${y(r.price).toFixed(1)}`).join(" ");

  let grid = "";
  for (const t of [0.0001, 0.001, 0.01, 0.1, 1, 10, 100].filter(v => v >= yMin && v <= yMax)) {
    const yy = y(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(DEFAULT_RAW[0].date).getFullYear(); yr <= new Date(M.ds(dMax)).getFullYear(); yr++) {
    const d = M.dayN(`${yr}-01-01`);
    if (d < dMin || d > dMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 18}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const px = x(nowDay), py = y(price);
  const priceText = price >= 1 ? "$" + price.toFixed(2) : "$" + price.toFixed(4);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
${grid}${xlab}
${bands}
<polyline points="${center}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-dasharray="6 6"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="3.5"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="#fff" stroke="${band.c}" stroke-width="3"/>
<text x="${mL}" y="42" fill="#e2e8f0" font-size="30" font-weight="700" font-family="sans-serif" letter-spacing="2">SPX6900 RAINBOW CHART</text>
<text x="${W - mR}" y="42" fill="${band.c}" font-size="30" font-weight="800" font-family="sans-serif" text-anchor="end">${priceText} · ${band.l}</text>
</svg>`;
}
