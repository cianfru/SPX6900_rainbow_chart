// Build the POWER-LAW CHANNEL chart as an SVG string — the same model as the
// rainbow, but on LOG–LOG axes (log price vs log(age + t0)) so the power-law
// fair value is a straight diagonal and the limits are straight parallel rails.
// Shared by the X bot card and the social share image (api/og.js), and reusable
// by the website. Pure (no rasterizer). 3-line view: fair value + upper + lower.
import { DEFAULT_RAW } from "./data.js";
import * as M from "./models.js";

export function channelSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const m = M.buildModel(DEFAULT_RAW);               // bands stay frozen on the bundled fit
  const t0 = m.t0;                                   // the offset that makes it straight
  const day = M.dayN(dateStr);
  // Drawn price LINE uses the caller's series (bundled history extended to today
  // via the daily snapshot); defaults to the bundled set. Model is unchanged.
  const raw = (opts.series && opts.series.length) ? opts.series : DEFAULT_RAW;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 132, mT = 76, mB = 56;
  const pW = W - mL - mR, pH = H - mT - mB;

  const firstDay = M.dayN(DEFAULT_RAW[0].date);
  const lastDay = M.dayN(raw.at(-1).date);
  const nowDay = Math.max(lastDay, day);
  const dMax = Math.round(nowDay * 1.2);             // project the rails a little past today (room for the gutter labels), not into empty space
  // x = ln(age + t0) — this is what straightens the power law into a diagonal.
  const xMin = Math.log(firstDay + t0), xMax = Math.log(dMax + t0);
  const x = d => mL + ((Math.log(d + t0) - xMin) / (xMax - xMin)) * pW;

  const days = [];
  for (let d = firstDay; d <= dMax; d = Math.max(d + 1, Math.round(d * 1.03))) days.push(d);
  days.push(dMax);

  const lower = d => M.bandVal(m, d, 0);             // p2 floor
  const upper = d => M.bandVal(m, d, m.bands.length - 1); // p99.5 ceiling
  const fair = d => Math.exp(m.predict(d));

  let yMin = Infinity, yMax = -Infinity;
  for (const d of [firstDay, dMax]) { yMin = Math.min(yMin, lower(d)); yMax = Math.max(yMax, upper(d)); }
  yMin *= 0.7; yMax *= 1.3;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / (Math.log(yMax) - Math.log(yMin))) * pH;

  const path = f => days.map(d => `${x(d).toFixed(1)},${y(f(d)).toFixed(1)}`).join(" ");
  // Two shaded zones split by the fair-value rail: EXPENSIVE (fair→upper, red) and
  // CHEAP (lower→fair, blue), each fading toward the divider — gives the corridor a body.
  const fairPts = days.map(d => `${x(d).toFixed(1)},${y(fair(d)).toFixed(1)}`);
  const zoneUpper = `${days.map(d => `${x(d).toFixed(1)},${y(upper(d)).toFixed(1)}`).join(" ")} ${[...fairPts].reverse().join(" ")}`;
  const zoneLower = `${fairPts.join(" ")} ${days.map(d => `${x(d).toFixed(1)},${y(lower(d)).toFixed(1)}`).reverse().join(" ")}`;
  const priceLine = raw.map(r => `${x(M.dayN(r.date)).toFixed(1)},${y(r.price).toFixed(1)}`).join(" ");

  // gridlines + $ decade y-labels
  let grid = "";
  for (const t of [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000].filter(v => v >= yMin && v <= yMax)) {
    const yy = y(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  // x-labels: year marks — evenly LOG-spaced, which visually proves the straightness
  let xlab = "";
  for (let yr = new Date(DEFAULT_RAW[0].date).getFullYear(); yr <= new Date(M.ds(dMax)).getFullYear(); yr++) {
    const d = M.dayN(`${yr}-01-01`);
    if (d < firstDay || d > dMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 18}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // current point + readout
  const px = x(nowDay), py = y(price);
  const bi = M.bandIndex(m, price, nowDay);
  const band = M.BAND_LABELS[bi];
  const vsFair = price / fair(nowDay) - 1;
  const fpct = v => (v >= 0 ? "+" : "-") + (Math.abs(v * 100) < 10 ? Math.abs(v * 100).toFixed(1) : Math.round(Math.abs(v * 100))) + "%";
  const priceText = price >= 1 ? "$" + price.toFixed(2) : "$" + price.toFixed(4);

  // right-gutter rail labels at their ending y
  const rl = (f, color, text) => `<text x="${(mL + pW + 10)}" y="${(y(f(dMax)) + 5).toFixed(1)}" fill="${color}" font-size="17" font-weight="700" font-family="sans-serif">${text}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="chUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.30"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.02"/></linearGradient>
  <linearGradient id="chLo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.03"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0.30"/></linearGradient>
  <filter id="chGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
  <radialGradient id="chTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="${band.c}" stop-opacity="0.20"/><stop offset="60%" stop-color="${band.c}" stop-opacity="0"/></radialGradient>
  <radialGradient id="chWarm" cx="4%" cy="8%" r="62%"><stop offset="0%" stop-color="#f43f5e" stop-opacity="0.18"/><stop offset="70%" stop-color="#f43f5e" stop-opacity="0"/></radialGradient>
  <radialGradient id="chViolet" cx="96%" cy="94%" r="62%"><stop offset="0%" stop-color="#7c3aed" stop-opacity="0.22"/><stop offset="70%" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#chViolet)"/>
<rect width="${W}" height="${H}" fill="url(#chWarm)"/>
<rect width="${W}" height="${H}" fill="url(#chTop)"/>
${grid}${xlab}
<polygon points="${zoneUpper}" fill="url(#chUp)"/>
<polygon points="${zoneLower}" fill="url(#chLo)"/>
<polyline points="${path(upper)}" fill="none" stroke="#ef4444" stroke-width="3" stroke-opacity="0.9"/>
<polyline points="${path(fair)}" fill="none" stroke="#84cc16" stroke-width="9" stroke-opacity="0.18" filter="url(#chGlow)"/>
<polyline points="${path(fair)}" fill="none" stroke="#a3e635" stroke-width="4"/>
<polyline points="${path(lower)}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-opacity="0.9"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="9" stroke-opacity="0.20" filter="url(#chGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
${rl(upper, "#f87171", "upper limit")}
${rl(fair, "#bef264", "fair value")}
${rl(lower, "#93c5fd", "lower limit")}
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="12" fill="${band.c}" fill-opacity="0.25"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8.5" fill="#fff" stroke="${band.c}" stroke-width="3.5"/>
<text x="${mL}" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 POWER-LAW CHANNEL</text>
<text x="${mL + pW}" y="42" fill="${band.c}" font-size="29" font-weight="800" font-family="sans-serif" text-anchor="end">${priceText} · ${band.l}</text>
<text x="${mL + pW}" y="68" font-size="20" font-family="sans-serif" text-anchor="end" fill="#94a3b8">log price vs log age · <tspan fill="#cbd5e1" font-weight="700">${fpct(vsFair)} vs fair value</tspan></text>
</svg>`;
}
