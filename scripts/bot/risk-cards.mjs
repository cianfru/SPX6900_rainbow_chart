// Two risk-visualisation cards built straight from the frozen model:
//   • renderRiskColorCard  — the price line recoloured segment-by-segment by the
//     risk value at each point (deep blue = cheap/low-risk → red = stretched).
//   • renderRiskLevelsCard — a recent-price chart with a horizontal line at each
//     risk level's price TODAY, labelled "risk : price" ("what price = what risk").
// Same rainbow data, fresh visuals. Self-contained (model from DEFAULT_RAW).
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import * as M from "../../src/models.js";
import { FONT } from "./font.mjs";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fP = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.001 ? 5 : p < 0.01 ? 4 : p < 0.1 ? 3 : 2));
const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// continuous risk (0..1) → colour: blue → cyan → green → yellow → orange → red
const toRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const STOPS = [[0, "#2563eb"], [0.25, "#06b6d4"], [0.5, "#22c55e"], [0.7, "#eab308"], [0.85, "#f97316"], [1, "#ef4444"]].map(([p, h]) => [p, toRGB(h)]);
export function riskColor(r) {
  r = Math.max(0, Math.min(1, r));
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) if (r >= STOPS[i][0] && r <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  const t = (r - a[0]) / ((b[0] - a[0]) || 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Colorful aurora backdrop (matches the rainbow card's vibe): a warm rose blob
// top-left, a violet blob bottom-right, and a top glow tinted by the CURRENT risk
// color — so a low-risk card reads cool/blue, a high-risk one warm/red.
function auroraBg(W, H, glow) {
  return `<defs>
  <radialGradient id="auTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="${glow}" stop-opacity="0.22"/><stop offset="60%" stop-color="${glow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="auWarm" cx="4%" cy="8%" r="62%"><stop offset="0%" stop-color="#f43f5e" stop-opacity="0.18"/><stop offset="70%" stop-color="#f43f5e" stop-opacity="0"/></radialGradient>
  <radialGradient id="auViolet" cx="96%" cy="94%" r="62%"><stop offset="0%" stop-color="#7c3aed" stop-opacity="0.22"/><stop offset="70%" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#auViolet)"/>
<rect width="${W}" height="${H}" fill="url(#auWarm)"/>
<rect width="${W}" height="${H}" fill="url(#auTop)"/>`;
}

// log-residual range used to normalise risk to 0..1 (same basis as buildRiskSeries)
function residRange(m) {
  let lo = Infinity, hi = -Infinity;
  for (const r of DEFAULT_RAW) { const z = Math.log(r.price) - m.predict(M.dayN(r.date)); if (z < lo) lo = z; if (z > hi) hi = z; }
  return { lo, hi };
}
const yDollarTicks = (yMin, yMax) => [0.0001, 0.001, 0.01, 0.1, 1, 10, 100].filter(v => v >= yMin && v <= yMax);

// --- card 1: price coloured by the valuation z-score -----------------------
// Each segment is shaded by how many standard deviations the price sits from the
// power-law fair value at that point (its log-residual z-score). Blue = below
// trend (cheap), red = stretched above. A statistical "cheap vs heated" read
// distinct from the rainbow-band risk used by the other cards.
export function zScoreSeries(m) {
  const pts = DEFAULT_RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price, z: Math.log(r.price) - m.predict(M.dayN(r.date)) }));
  const mean = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  const std = Math.sqrt(pts.reduce((a, p) => a + (p.z - mean) ** 2, 0) / pts.length) || 1;
  return { pts, mean, std };
}
// raw log-residual z → 0..1 colour position: ±2.5σ spans the full blue→red ramp.
const zToUnit = (z, mean, std) => Math.max(0, Math.min(1, 0.5 + (z - mean) / (std * 5)));

export function riskColorSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const m = M.buildModel(DEFAULT_RAW);
  const { pts, mean, std } = zScoreSeries(m);
  const colorOf = z => riskColor(zToUnit(z, mean, std));
  const curRawZ = Math.log(price) - m.predict(M.dayN(dateStr));
  const curZ = (curRawZ - mean) / std;
  const dc = colorOf(curRawZ);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 40, mT = 76, mB = 64, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = pts[0].ts, xMax = pts.at(-1).ts;
  let yMin = Infinity, yMax = -Infinity;
  for (const r of pts) { if (r.price < yMin) yMin = r.price; if (r.price > yMax) yMax = r.price; }
  yMin *= 0.75; yMax *= 1.3;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH;

  let grid = "";
  for (const t of yDollarTicks(yMin, yMax)) {
    const yy = y(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="26" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  // power-law fair-value (center) line, derived straight from the residual:
  // fair = price / exp(z), so it agrees exactly with the colouring.
  const fairLine = pts.map(p => `${x(p.ts).toFixed(1)},${y(p.price / Math.exp(p.z)).toFixed(1)}`).join(" ");
  // price path as one polyline (for the glow underlay + fading area fill) and the
  // colour-by-z segments on top.
  const pricePoly = pts.map(p => `${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const base = y(yMin).toFixed(1);
  let seg = "";
  for (let i = 0; i < pts.length - 1; i++) {
    seg += `<line x1="${x(pts[i].ts).toFixed(1)}" y1="${y(pts[i].price).toFixed(1)}" x2="${x(pts[i + 1].ts).toFixed(1)}" y2="${y(pts[i + 1].price).toFixed(1)}" stroke="${colorOf((pts[i].z + pts[i + 1].z) / 2)}" stroke-width="5.5" stroke-linecap="round"/>`;
  }
  const px = x(xMax), py = y(price);
  const zTxt = `${curZ >= 0 ? "+" : ""}${curZ.toFixed(1)}σ`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="zFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${dc}" stop-opacity="0.30"/><stop offset="100%" stop-color="${dc}" stop-opacity="0"/></linearGradient>
  <filter id="zGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${grid}${xlab}
<polygon points="${x(xMin).toFixed(1)},${base} ${pricePoly} ${x(xMax).toFixed(1)},${base}" fill="url(#zFill)"/>
<polyline points="${fairLine}" fill="none" stroke="#cbd5e1" stroke-width="2.4" stroke-opacity="0.85" stroke-dasharray="2 8" stroke-linecap="round"/>
<polyline points="${pricePoly}" fill="none" stroke="${dc}" stroke-width="11" stroke-opacity="0.22" filter="url(#zGlow)"/>
${seg}
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7.5" fill="#fff" stroke="${dc}" stroke-width="3"/>
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — VALUATION Z-SCORE</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${zTxt} vs trend</text>
<text x="64" y="70" font-size="16" font-family="sans-serif"><tspan fill="#cbd5e1" font-weight="700">┄ power-law fair value</tspan><tspan fill="#64748b">     </tspan><tspan fill="#94a3b8">line colour = σ from fair value (blue cheap → red stretched)</tspan></text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · σ from power-law fair value</text>
</svg>`;
}

// --- card 2: current risk levels projected onto price ----------------------
export function riskLevelsSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const m = M.buildModel(DEFAULT_RAW);
  const { lo, hi } = residRange(m);
  const curDay = M.dayN(dateStr);
  const priceAtRisk = risk => Math.exp(m.predict(curDay) + lo + risk * (hi - lo));
  const curRisk = Math.max(0, Math.min(1, (Math.log(price) - m.predict(curDay) - lo) / ((hi - lo) || 1)));
  const dc = riskColor(curRisk);
  const LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map(r => ({ risk: r, price: priceAtRisk(r) }));
  const recent = DEFAULT_RAW.slice(-60).map(r => ({ ts: new Date(r.date).getTime(), price: r.price }));

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 168, mT = 76, mB = 68, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = recent[0].ts, xMax = recent.at(-1).ts;
  // Anchor the y-axis to the LEVELS so all the risk bands fill the FULL card height
  // (the point of the card) instead of bunching at the top; expand only if the
  // recent price pokes outside them.
  let yMin = LEVELS[0].price, yMax = LEVELS.at(-1).price;
  for (const r of recent) { if (r.price < yMin) yMin = r.price; if (r.price > yMax) yMax = r.price; }
  yMin *= 0.92; yMax *= 1.06;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH;

  // risk-level lines + right-gutter labels
  let lines = "";
  for (const l of LEVELS) {
    const yy = y(l.price).toFixed(1), c = riskColor(l.risk);
    lines += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="${c}" stroke-opacity="0.85" stroke-width="2" stroke-dasharray="6 6"/>`;
    lines += `<text x="${mL + pW + 10}" y="${(+yy + 5).toFixed(1)}" fill="${c}" font-size="26" font-weight="700" font-family="sans-serif">${l.risk.toFixed(2)} · ${fP(l.price)}</text>`;
  }
  // recent price (white) + a fading area fill down to the floor
  const priceLine = recent.map(r => `${x(r.ts).toFixed(1)},${y(r.price).toFixed(1)}`).join(" ");
  const priceArea = `${x(recent[0].ts).toFixed(1)},${y(yMin).toFixed(1)} ${priceLine} ${x(recent.at(-1).ts).toFixed(1)},${y(yMin).toFixed(1)}`;
  // x labels: month/year a few across
  let xlab = "";
  const monMs = 30 * 86400000;
  for (let t = xMin; t <= xMax; t += monMs * 2) {
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`;
  }
  const px = x(xMax), py = y(price);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="rlGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
  <linearGradient id="rlFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${dc}" stop-opacity="0.28"/><stop offset="100%" stop-color="${dc}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${lines}
<polygon points="${priceArea}" fill="url(#rlFill)"/>
<polyline points="${priceLine}" fill="none" stroke="${dc}" stroke-width="10" stroke-opacity="0.25" filter="url(#rlGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7.5" fill="#fff" stroke="${dc}" stroke-width="3"/>
${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">CURRENT RISK LEVELS</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${fP(price)} · risk ${curRisk.toFixed(2)}</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · risk : price</text>
</svg>`;
}

// --- card 3: price (top) + risk HEAT oscillator (bottom) -------------------
// Risk drawn as bars from a neutral 0.5 midline — red/hot above, blue/cold below —
// aligned under the price. Same data as the rainbow, a fresh "valuation oscillator".
export function riskHeatSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  // Short-term "bubble risk" à la Cowen: extension of price from its 20-WEEK moving
  // average (mean-reversion), NOT the long-term rainbow risk. Centered at the MA
  // (the zero line) — hot/red when price is stretched ABOVE it, cold/blue below.
  const pts = DEFAULT_RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price })).sort((a, b) => a.ts - b.ts);
  const WK20 = 140 * 86400000;
  const maAt = ts => { let s = 0, n = 0; for (const q of pts) if (q.ts > ts - WK20 && q.ts <= ts) { s += q.price; n++; } return n ? s / n : pts[0].price; };
  const ma = pts.map(p => maAt(p.ts));
  const ext = pts.map((p, i) => Math.log(p.price / ma[i]));
  // Scale to the ~90th-percentile extension, not the absolute max — a single
  // launch-era spike would otherwise flatten the whole oscillator. Outliers clamp.
  const absSorted = ext.map(Math.abs).sort((a, b) => a - b);
  const maxAbs = Math.max(0.05, absSorted[Math.floor(absSorted.length * 0.9)] || 0.05);
  const maNow = maAt(pts.at(-1).ts);
  const curExt = Math.log(price / maNow);
  const curPct = Math.round((price / maNow - 1) * 100);
  const curN = 0.5 + 0.5 * Math.max(-1, Math.min(1, curExt / maxAbs));
  const dc = riskColor(curN);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 40, mT = 76, mB = 64;
  const innerTop = mT, innerBot = H - mB, innerH = innerBot - innerTop;
  // Bigger price panel (carries the prominent overlay), a slim oscillator below.
  const priceTop = innerTop, priceBot = innerTop + innerH * 0.66;
  const riskTop = innerTop + innerH * 0.76, riskBot = innerBot, cyc = (riskTop + riskBot) / 2, half = (riskBot - riskTop) / 2;
  const xMin = pts[0].ts, xMax = pts.at(-1).ts;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * (W - mL - mR);
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) { if (p.price < yMin) yMin = p.price; if (p.price > yMax) yMax = p.price; }
  yMin *= 0.8; yMax *= 1.25;
  const yP = p => priceTop + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * (priceBot - priceTop);
  // SOFT (tanh) squash so big extensions compress smoothly toward the edge instead
  // of being hard-clipped flat — fixes the "cut off at the top" look. maxAbs sets
  // the knee (tanh(1)≈0.76), so a 90th-pctl extension reaches ~3/4 of the panel.
  const yE = e => cyc - Math.tanh(e / maxAbs) * half;
  const colN = i => 0.5 + 0.5 * Math.max(-1, Math.min(1, ext[i] / maxAbs)); // ext → 0..1 colour

  // price-panel $ gridlines
  let grid = "";
  for (const t of yDollarTicks(yMin, yMax)) {
    const yy = yP(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="26" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  const bw = Math.max(1.4, (W - mL - mR) / (pts.length - 1) + 0.8);
  // OVERLAY (Cowen-style): fill the gap between price and its 20W MA — red where
  // price is stretched ABOVE the MA, blue where it sits below. The extension drawn
  // straight onto the price, which is the prominent read.
  let band = "";
  pts.forEach((p, i) => {
    const a = yP(p.price), b = yP(ma[i]), top = Math.min(a, b), h = Math.abs(a - b);
    band += `<rect x="${(x(p.ts) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.4, h).toFixed(1)}" fill="${riskColor(colN(i))}" fill-opacity="0.5"/>`;
  });
  // oscillator strip below: same signal, centred on the MA zero line, tanh-scaled
  const cy = cyc.toFixed(1);
  let heat = "";
  pts.forEach((p, i) => {
    const yy = yE(ext[i]), top = Math.min(yy, +cy), h = Math.abs(yy - +cy);
    heat += `<rect x="${(x(p.ts) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.4, h).toFixed(1)}" fill="${riskColor(colN(i))}" fill-opacity="0.95"/>`;
  });
  // edge marks the ~maxAbs knee (tanh saturates beyond it, so label with a "+")
  const pctTop = Math.round((Math.exp(maxAbs) - 1) * 100), pctBot = Math.round((1 - Math.exp(-maxAbs)) * 100);
  const axis = `<line x1="${mL}" y1="${cy}" x2="${W - mR}" y2="${cy}" stroke="rgba(255,255,255,0.55)" stroke-dasharray="6 6"/>`
    + `<text x="${mL - 10}" y="${(riskTop + 12).toFixed(1)}" fill="#94a3b8" font-size="14" text-anchor="end" font-family="sans-serif">+${pctTop}%+</text>`
    + `<text x="${mL - 10}" y="${(+cy + 5).toFixed(1)}" fill="#94a3b8" font-size="14" text-anchor="end" font-family="sans-serif">MA</text>`
    + `<text x="${mL - 10}" y="${(riskBot - 2).toFixed(1)}" fill="#94a3b8" font-size="14" text-anchor="end" font-family="sans-serif">−${pctBot}%+</text>`
    + `<text x="${W - mR}" y="${(riskTop - 6).toFixed(1)}" fill="#94a3b8" font-size="15" text-anchor="end" font-family="sans-serif">extension vs 20W MA — hot above, cold below</text>`;
  const maLine = pts.map((p, i) => `${x(p.ts).toFixed(1)},${yP(ma[i]).toFixed(1)}`).join(" ");
  const priceLine = pts.map(p => `${x(p.ts).toFixed(1)},${yP(p.price).toFixed(1)}`).join(" ");
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="rhGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${grid}
${band}
<polyline points="${maLine}" fill="none" stroke="#f59e0b" stroke-width="4" stroke-opacity="0.95"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="9" stroke-opacity="0.2" filter="url(#rhGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round"/>
${heat}${axis}${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — 20-WEEK EXTENSION</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${curPct >= 0 ? "+" : ""}${curPct}% vs 20W MA</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · short-term risk</text>
</svg>`;
}

export function renderRiskColorCard(stats, opts = {}) { return png(riskColorSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
export function renderRiskLevelsCard(stats, opts = {}) { return png(riskLevelsSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
export function renderRiskHeatCard(stats, opts = {}) { return png(riskHeatSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
