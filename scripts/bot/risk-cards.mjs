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
function riskColor(r) {
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

// --- card 1: price coloured by risk ----------------------------------------
export function riskColorSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const m = M.buildModel(DEFAULT_RAW);
  const rs = M.buildRiskSeries(m, DEFAULT_RAW); // [{ ts, price, risk }]
  const { lo, hi } = residRange(m);
  const curRisk = Math.max(0, Math.min(1, (Math.log(price) - m.predict(M.dayN(dateStr)) - lo) / ((hi - lo) || 1)));
  const dc = riskColor(curRisk);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 40, mT = 76, mB = 64, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = rs[0].ts, xMax = rs.at(-1).ts;
  let yMin = Infinity, yMax = -Infinity;
  for (const r of rs) { if (r.price < yMin) yMin = r.price; if (r.price > yMax) yMax = r.price; }
  yMin *= 0.75; yMax *= 1.3;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH;

  let grid = "";
  for (const t of yDollarTicks(yMin, yMax)) {
    const yy = y(t).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(xMin).getFullYear(); yr <= new Date(xMax).getFullYear(); yr++) {
    const d = Date.parse(`${yr}-01-01`); if (d < xMin || d > xMax) continue;
    xlab += `<text x="${x(d).toFixed(1)}" y="${H - 42}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  let seg = "";
  for (let i = 0; i < rs.length - 1; i++) {
    seg += `<line x1="${x(rs[i].ts).toFixed(1)}" y1="${y(rs[i].price).toFixed(1)}" x2="${x(rs[i + 1].ts).toFixed(1)}" y2="${y(rs[i + 1].price).toFixed(1)}" stroke="${riskColor((rs[i].risk + rs[i + 1].risk) / 2)}" stroke-width="4.5" stroke-linecap="round"/>`;
  }
  const px = x(xMax), py = y(price);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${grid}${xlab}${seg}
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="#fff" stroke="${dc}" stroke-width="3"/>
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">SPX6900 — PRICE BY RISK</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">risk ${curRisk.toFixed(2)} / 1.00</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice</text>
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
  const recent = DEFAULT_RAW.slice(-130).map(r => ({ ts: new Date(r.date).getTime(), price: r.price }));

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 168, mT = 76, mB = 68, pW = W - mL - mR, pH = H - mT - mB;
  const xMin = recent[0].ts, xMax = recent.at(-1).ts;
  let yMin = Infinity, yMax = -Infinity;
  for (const l of LEVELS) { if (l.price < yMin) yMin = l.price; if (l.price > yMax) yMax = l.price; }
  for (const r of recent) { if (r.price < yMin) yMin = r.price; if (r.price > yMax) yMax = r.price; }
  yMin *= 0.9; yMax *= 1.1;
  const x = t => mL + ((t - xMin) / ((xMax - xMin) || 1)) * pW;
  const y = p => mT + ((Math.log(yMax) - Math.log(p)) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH;

  // risk-level lines + right-gutter labels
  let lines = "";
  for (const l of LEVELS) {
    const yy = y(l.price).toFixed(1), c = riskColor(l.risk);
    lines += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="${c}" stroke-opacity="0.85" stroke-width="2" stroke-dasharray="6 6"/>`;
    lines += `<text x="${mL + pW + 10}" y="${(+yy + 5).toFixed(1)}" fill="${c}" font-size="18" font-weight="700" font-family="sans-serif">${l.risk.toFixed(2)} · ${fP(l.price)}</text>`;
  }
  // recent price (white)
  const priceLine = recent.map(r => `${x(r.ts).toFixed(1)},${y(r.price).toFixed(1)}`).join(" ");
  // x labels: month/year a few across
  let xlab = "";
  const monMs = 30 * 86400000;
  for (let t = xMin; t <= xMax; t += monMs * 2) {
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#64748b" font-size="18" text-anchor="middle" font-family="sans-serif">${new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`;
  }
  const px = x(xMax), py = y(price);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
${auroraBg(W, H, dc)}
${lines}
<polyline points="${priceLine}" fill="none" stroke="#ffffff" stroke-width="2.6"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="#fff" stroke="${dc}" stroke-width="3"/>
${xlab}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1.5">CURRENT RISK LEVELS</text>
<text x="${W - mR}" y="42" fill="${dc}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${fP(price)} · risk ${curRisk.toFixed(2)}</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · risk : price</text>
</svg>`;
}

export function renderRiskColorCard(stats, opts = {}) { return png(riskColorSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
export function renderRiskLevelsCard(stats, opts = {}) { return png(riskLevelsSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
