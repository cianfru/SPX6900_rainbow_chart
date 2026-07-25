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
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

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
<rect width="${W}" height="${H}" fill="url(#auTop)"/>
${brandStripe(H)}`;
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
  // mean/std stay on the frozen bundled fit; the DRAWN line extends to today via
  // the snapshot series so it never freezes weeks behind the live dot.
  const { mean, std } = zScoreSeries(m);
  const RAW = (opts.series && opts.series.length) ? opts.series : DEFAULT_RAW;
  const pts = RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price, z: Math.log(r.price) - m.predict(M.dayN(r.date)) }));
  const colorOf = z => riskColor(zToUnit(z, mean, std));
  const curRawZ = Math.log(price) - m.predict(M.dayN(dateStr));
  const curZ = (curRawZ - mean) / std;
  const dc = colorOf(curRawZ);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 124, mR = 40, mT = 76, mB = 64, pW = W - mL - mR, pH = H - mT - mB;
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
  // WEEKLY closes as colour-by-z DOTS (ITC-style scatter, like the original). The drawn
  // series is dense daily now, so sample ~one point per week; each dot's colour = its σ
  // from fair value (blue cheap → red stretched), read against the dashed fair-value line.
  const WEEK = 7 * 86400000;
  const weekly = [];
  let lastTs = -Infinity;
  for (const p of pts) if (p.ts - lastTs >= WEEK - 43200000) { weekly.push(p); lastTs = p.ts; }
  const dots = weekly.map(p => `<circle cx="${x(p.ts).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="5" fill="${colorOf(p.z)}" fill-opacity="0.92"/>`).join("");
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
<polyline points="${fairLine}" fill="none" stroke="#cbd5e1" stroke-width="2.4" stroke-opacity="0.85" stroke-dasharray="2 8" stroke-linecap="round"/>
${dots}
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8.5" fill="#fff" stroke="${dc}" stroke-width="3.5"/>
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — VALUATION Z-SCORE</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${zTxt} vs trend</text>
<text x="64" y="70" font-size="16" font-family="sans-serif"><tspan fill="#cbd5e1" font-weight="700">┄ power-law fair value</tspan><tspan fill="#64748b">     </tspan><tspan fill="#94a3b8">dots = weekly close, coloured by σ from fair value (blue cheap → red stretched)</tspan></text>
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
  const RAW = (opts.series && opts.series.length) ? opts.series : DEFAULT_RAW;
  const recent = RAW.slice(-60).map(r => ({ ts: new Date(r.date).getTime(), price: r.price }));

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 124, mR = 200, mT = 76, mB = 68, pW = W - mL - mR, pH = H - mT - mB;
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

// --- card 3: ITC-style Short Term Bubble Risk — price over a price/20W-MA -----
// histogram, single panel. Bars pivot on the 1× (MA) line: hot (green→red) when
// price runs above the MA, discount (cyan→blue) below. Zones are SPX-calibrated by
// percentile (a memecoin trades multiples above its MA, so a fixed ">2×=bubble"
// would peg it perma-red). Mirrors the site RiskHeatChart.
export function riskHeatSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const RAW = (opts.series && opts.series.length) ? opts.series : DEFAULT_RAW;
  const pts = RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price })).sort((a, b) => a.ts - b.ts);
  const WK20 = 140 * 86400000;
  const maAt = ts => { let s = 0, n = 0; for (const q of pts) if (q.ts > ts - WK20 && q.ts <= ts) { s += q.price; n++; } return n ? s / n : pts[0].price; };
  const ma = pts.map(p => maAt(p.ts));
  const ext = pts.map((p, i) => Math.log(p.price / ma[i]));
  // Colour scale = ~90th-pctl extension over the FULL history (stable zones), so a
  // single launch-era spike doesn't wash out the palette. Outliers clamp.
  const absSorted = ext.map(Math.abs).sort((a, b) => a - b);
  const maxAbs = Math.max(0.05, absSorted[Math.floor(absSorted.length * 0.9)] || 0.05);
  const maNow = maAt(pts.at(-1).ts);
  const curRatio = price / maNow, curPct = Math.round((curRatio - 1) * 100);
  const curN = 0.5 + 0.5 * Math.max(-1, Math.min(1, Math.log(curRatio) / maxAbs));
  const dc = riskColor(curN);
  const colN = i => 0.5 + 0.5 * Math.max(-1, Math.min(1, ext[i] / maxAbs));
  const fRatio = r => (r >= 10 ? r.toFixed(0) : r.toFixed(r < 1 ? 2 : 1)) + "×";

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 124, mR = 96, mT = 76, mB = 64;
  const innerTop = mT, innerBot = H - mB, innerH = innerBot - innerTop;
  // DISPLAY a recent window (short-term signal; a 3-yr log view buries the current
  // read under the launch era). Default ~18 months; opts.windowDays overrides.
  const DAY = 86400000;
  const winDays = opts.windowDays === null ? null : (opts.windowDays ?? 549);
  const xMax = pts.at(-1).ts;
  const viewMin = winDays ? xMax - winDays * DAY : pts[0].ts;
  const vis = pts.map((p, i) => ({ ...p, gi: i })).filter(p => p.ts >= viewMin);
  const xMin = vis[0].ts;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * (W - mL - mR);
  // two independent y-scales sharing the panel: price (log, left) + extension
  // (linear ln-ratio, right) centred on the 1× pivot.
  let yMin = Infinity, yMax = -Infinity, eMin = -0.05, eMax = 0.05;
  for (const p of vis) { if (p.price < yMin) yMin = p.price; if (p.price > yMax) yMax = p.price; const e = ext[p.gi]; if (e < eMin) eMin = e; if (e > eMax) eMax = e; }
  yMin *= 0.7; yMax *= 1.4;
  const ePad = (eMax - eMin) * 0.12 || 0.1; eMin -= ePad; eMax += ePad;
  const yP = p => innerTop + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * innerH;
  const yE = e => innerTop + ((eMax - e) / ((eMax - eMin) || 1)) * innerH;

  // left $ gridlines
  let grid = "";
  for (const t of yDollarTicks(yMin, yMax)) {
    const yy = yP(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="26" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  // right ratio ticks (ext = ln ratio), at nice ratios inside the window
  let rlab = "";
  for (const r of [0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20]) {
    const e = Math.log(r); if (e < eMin || e > eMax) continue;
    rlab += `<text x="${W - mR + 12}" y="${(yE(e) + 5).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="start" font-family="sans-serif">${fRatio(r)}</text>`;
  }
  const bw = Math.max(1.4, (W - mL - mR) / (Math.max(2, vis.length) - 1) + 0.8);
  // colour-coded histogram from the 1× (ext=0) pivot — hot up, discount down.
  const yPivot = yE(0);
  let heat = "";
  vis.forEach(p => {
    const i = p.gi, yy = yE(ext[i]), top = Math.min(yy, yPivot), h = Math.abs(yy - yPivot);
    heat += `<rect x="${(x(p.ts) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.4, h).toFixed(1)}" fill="${riskColor(colN(i))}" fill-opacity="0.9"/>`;
  });
  const pivot = `<line x1="${mL}" y1="${yPivot.toFixed(1)}" x2="${W - mR}" y2="${yPivot.toFixed(1)}" stroke="rgba(255,255,255,0.5)" stroke-dasharray="6 6"/>`
    + `<text x="${mL + 8}" y="${(yPivot - 8).toFixed(1)}" fill="#94a3b8" font-size="18" font-family="sans-serif">1× · 20W MA</text>`;
  const priceLine = vis.map(p => `${x(p.ts).toFixed(1)},${yP(p.price).toFixed(1)}`).join(" ");
  let xlab = "";
  const spanDays = (xMax - xMin) / DAY;
  if (spanDays > 900) {
    for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
      const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
      xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
    }
  } else {
    const step = spanDays > 400 ? 3 : 2;
    const d0 = new Date(xMin);
    for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= xMax; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + step, 1))) {
      xlab += `<text x="${x(m.getTime()).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="24" text-anchor="middle" font-family="sans-serif">${m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`;
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <filter id="rhGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${grid}
${heat}${pivot}
<polyline points="${priceLine}" fill="none" stroke="#38bdf8" stroke-width="9" stroke-opacity="0.18" filter="url(#rhGlow)"/>
<polyline points="${priceLine}" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${rlab}${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — 20-WEEK HEAT</text>
<text x="${W - mR + 24}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${fRatio(curRatio)} vs 20W MA</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · price ÷ 20-week MA, hot above the 1× line</text>
</svg>`;
}

export function renderRiskColorCard(stats, opts = {}) { return png(riskColorSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), opts.W ?? 1200); }
export function renderRiskLevelsCard(stats, opts = {}) { return png(riskLevelsSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), opts.W ?? 1200); }
export function renderRiskHeatCard(stats, opts = {}) { return png(riskHeatSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), opts.W ?? 1200); }
