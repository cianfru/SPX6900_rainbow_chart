// "SPX6900 price × RSI" — an homage to PlanB's (@100trillionUSD) Bitcoin
// "Realized Price & Geometric MA" chart: the price plotted as DOTS colored by RSI
// (blue = oversold/cold → red = overbought/hot), over the power-law fair-value
// line as the long-run trend reference (our analog of his 200-week MA). Built so
// we can reference him directly. Self-contained from DEFAULT_RAW + the model.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { riskColor } from "./risk-cards.mjs";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// Wilder's RSI over a close series (returns same-length array, null until primed).
function rsiSeries(prices, period = 14) {
  const out = new Array(prices.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 1; i < prices.length; i++) {
    const ch = prices[i] - prices[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= period) { ag += g; al += l; if (i === period) { ag /= period; al /= period; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); } }
    else { ag = (ag * (period - 1) + g) / period; al = (al * (period - 1) + l) / period; out[i] = 100 - 100 / (1 + ag / (al || 1e-9)); }
  }
  return out;
}

// RSI colour domain (matches PlanB's ~oversold→overbought spread). Clamped.
const RSI_LO = 35, RSI_HI = 85;
const rsiColor = v => riskColor((v - RSI_LO) / (RSI_HI - RSI_LO));
const fP = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.001 ? 5 : p < 0.01 ? 4 : p < 0.1 ? 3 : 2));

export function rsiDotsSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const raw = DEFAULT_RAW.map(r => ({ ts: new Date(r.date).getTime(), price: r.price })).sort((a, b) => a.ts - b.ts);
  const rsis = rsiSeries(raw.map(p => p.price), 14);
  const dots = raw.map((p, i) => ({ ...p, rsi: rsis[i] })).filter(p => p.rsi != null);
  const curRsi = rsis.at(-1) ?? dots.at(-1).rsi;
  const dc = rsiColor(curRsi);

  const W = opts.W ?? 1200, H = opts.H ?? 630, legW = 58, mL = 96 + legW, mR = 44, mT = 92, mB = 66, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = raw[0].ts, xMax = raw.at(-1).ts;
  // Geometric moving average — PlanB's reference line. Trailing window of closes
  // (the asset is too young for a true 200-week MA), only drawn once primed, so the
  // line begins partway in just like his does. (Realized-price line not buildable
  // yet — needs ~30d of banked break-even; revisit ~mid-July, see CLAUDE.md.)
  const GMA_N = 30;
  const gma = raw.map((p, i) => {
    const lo = Math.max(0, i - GMA_N + 1); let acc = 0;
    for (let j = lo; j <= i; j++) acc += Math.log(raw[j].price);
    return { ts: p.ts, v: Math.exp(acc / (i - lo + 1)), primed: i >= GMA_N - 1 };
  }).filter(g => g.primed);
  let yMin = Infinity, yMax = -Infinity;
  for (const p of raw) { if (p.price < yMin) yMin = p.price; if (p.price > yMax) yMax = p.price; }
  for (const g of gma) { if (g.v < yMin) yMin = g.v; if (g.v > yMax) yMax = g.v; }
  yMin *= 0.7; yMax *= 1.4;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH;

  // $ gridlines
  let grid = "";
  for (const t of [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= yMin && v <= yMax)) {
    const yy = y(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="19" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="19" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // RSI colour legend (vertical bar, blue bottom → red top), PlanB-style
  const lbX = 40, lbW = 18, lbTop = mT, lbBot = mT + pH;
  let legStops = "";
  for (let s = 0; s <= 10; s++) legStops += `<stop offset="${(s * 10)}%" stop-color="${rsiColor(RSI_HI - (s / 10) * (RSI_HI - RSI_LO))}"/>`;
  let legTicks = "";
  for (let v = RSI_LO; v <= RSI_HI; v += 10) {
    const yy = (lbBot - ((v - RSI_LO) / (RSI_HI - RSI_LO)) * (lbBot - lbTop)).toFixed(1);
    legTicks += `<text x="${lbX + lbW + 7}" y="${(+yy + 5).toFixed(1)}" fill="#94a3b8" font-size="16" font-family="sans-serif">${v}</text>`;
  }
  const legend = `<rect x="${lbX}" y="${lbTop}" width="${lbW}" height="${(lbBot - lbTop).toFixed(1)}" fill="url(#rsiBar)" rx="4"/>`
    + `<rect x="${lbX}" y="${lbTop}" width="${lbW}" height="${(lbBot - lbTop).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.18)" rx="4"/>`
    + legTicks
    + `<text x="${lbX - 6}" y="${(lbTop + pH / 2).toFixed(1)}" fill="#94a3b8" font-size="16" font-family="sans-serif" text-anchor="middle" transform="rotate(-90 ${lbX - 6} ${(lbTop + pH / 2).toFixed(1)})">RSI (14)</text>`;

  // smooth faint connector under the dots so the eye follows the path
  const connector = raw.map(p => `${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  // geometric MA reference line (PlanB's "Geometric MA" analog)
  const gmaLine = gma.map(g => `${x(g.ts).toFixed(1)},${y(g.v).toFixed(1)}`).join(" ");
  // RSI dots (glow underlay + sharp core)
  let glowDots = "", coreDots = "";
  for (const p of dots) {
    const cx = x(p.ts).toFixed(1), cy = y(p.price).toFixed(1), c = rsiColor(p.rsi);
    glowDots += `<circle cx="${cx}" cy="${cy}" r="9" fill="${c}" fill-opacity="0.45"/>`;
    coreDots += `<circle cx="${cx}" cy="${cy}" r="5.4" fill="${c}" stroke="#05050e" stroke-width="0.8"/>`;
  }
  const lp = dots.at(-1), lx = x(lp.ts).toFixed(1), ly = y(lp.price).toFixed(1);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="rsiBar" x1="0" y1="0" x2="0" y2="1">${legStops}</linearGradient>
  <radialGradient id="rsiTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="${dc}" stop-opacity="0.16"/><stop offset="60%" stop-color="${dc}" stop-opacity="0"/></radialGradient>
  <filter id="rsiGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#rsiTop)"/>
${grid}${xlab}${legend}
<polyline points="${connector}" fill="none" stroke="rgba(148,163,184,0.35)" stroke-width="1.6"/>
<polyline points="${gmaLine}" fill="none" stroke="#e2e8f0" stroke-width="3.6" stroke-opacity="0.95" stroke-linejoin="round" stroke-linecap="round"/>
<g filter="url(#rsiGlow)">${glowDots}</g>
${coreDots}
<circle cx="${lx}" cy="${ly}" r="9" fill="#fff" stroke="${dc}" stroke-width="3.5"/>
<text x="${mL - legW - 32}" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1">SPX6900 — PRICE × RSI</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">RSI ${Math.round(curRsi)} · ${fP(price)}</text>
<text x="${mL - legW - 32}" y="70" font-size="17" font-family="sans-serif"><tspan fill="#e2e8f0" font-weight="700">— geometric MA</tspan><tspan fill="#64748b">     </tspan><tspan fill="#94a3b8">● price (colour = RSI, blue cold → red hot)</tspan></text>
<text x="${mL - legW - 32}" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · RSI overlay — homage to @100trillionUSD (PlanB)</text>
</svg>`;
}

export function renderRsiDotsCard(stats, opts = {}) { return png(rsiDotsSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
