// "Holder Growth" card — the holder COUNT over time (violet hero) coupled with price
// (cyan, log). Holder-count growth = genuinely new wallets, the one on-chain metric
// safe to read as accumulation. Fills the gap: every other on-chain card is a snapshot;
// this shows the trend. A foundation card — gentler now, stronger as history banks.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fK = n => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const fPrice = p => "$" + (p >= 1 ? p.toFixed(2) : p.toFixed(3));
// Catmull-Rom → cubic-bezier so the daily-snapshot lines read as a smooth curve
// instead of a boxy polyline. Input: array of [x, y].
const smooth = pts => {
  if (pts.length < 2) return pts.length ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};
// Slight palette break from the all-green convention: holders in VIOLET (still an
// "up/good" hue, but distinct in the rotation), price stays cyan.
const HOLD = "#a78bfa", PRICE = "#38bdf8";

export function holderGrowthSvg(stats, opts = {}) {
  const rows = (stats.supply?.holderSeries || []).filter(r => r.holders != null && r.price > 0);
  if (rows.length < 8) return null; // data-gated — needs a couple weeks of snapshots
  const first = rows[0], cur = rows.at(-1), grew = cur.holders - first.holders;
  const ndays = Math.round((cur.ts - first.ts) / 86400000);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 118, mR = 104, mT = 118, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].ts, t1 = rows.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  let hmin = Math.min(...rows.map(r => r.holders)), hmax = Math.max(...rows.map(r => r.holders));
  const hpad = (hmax - hmin) * 0.35 || 50; hmin -= hpad; hmax += hpad * 0.4;
  const yH = h => mT + ((hmax - h) / ((hmax - hmin) || 1)) * pH;
  let pmin = Math.min(...rows.map(r => r.price)) * 0.92, pmax = Math.max(...rows.map(r => r.price)) * 1.08;
  const yP = p => mT + ((Math.log(pmax) - Math.log(Math.max(p, 1e-9))) / ((Math.log(pmax) - Math.log(pmin)) || 1)) * pH;

  let grid = "";
  const hstep = Math.max(100, Math.ceil((hmax - hmin) / 4 / 100) * 100);
  for (let v = Math.ceil(hmin / hstep) * hstep; v <= hmax; v += hstep) {
    const yy = yH(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/><text x="${mL - 12}" y="${(+yy + 5).toFixed(1)}" fill="${HOLD}" font-size="23" text-anchor="end" font-family="sans-serif">${fK(v)}</text>`;
  }
  const pticks = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2].filter(v => v >= pmin && v <= pmax);
  for (const p of pticks) grid += `<text x="${W - mR + 12}" y="${(yP(p) + 5).toFixed(1)}" fill="${PRICE}" font-size="23" font-family="sans-serif">${fPrice(p)}</text>`;
  let xlab = "";
  for (const r of rows.filter((_, i) => i % Math.ceil(rows.length / 5) === 0 || i === rows.length - 1))
    xlab += `<text x="${x(r.ts).toFixed(1)}" y="${H - 40}" fill="#64748b" font-size="22" text-anchor="middle" font-family="sans-serif">${new Date(r.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>`;

  const hPts = rows.map(r => [x(r.ts), yH(r.holders)]);
  const hPath = smooth(hPts);
  const base = (mT + pH).toFixed(1);
  const hArea = `${hPath} L${x(rows.at(-1).ts).toFixed(1)},${base} L${x(rows[0].ts).toFixed(1)},${base} Z`;
  const pPath = smooth(rows.map(r => [x(r.ts), yP(r.price)]));

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <linearGradient id="hgFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${HOLD}" stop-opacity="0.30"/><stop offset="100%" stop-color="${HOLD}" stop-opacity="0"/></linearGradient>
 <filter id="hgG" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="hgV" cx="20%" cy="0%" r="90%"><stop offset="0%" stop-color="${HOLD}" stop-opacity="0.12"/><stop offset="60%" stop-color="${HOLD}" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#hgV)"/>
${grid}${xlab}
<path d="${pPath}" fill="none" stroke="${PRICE}" stroke-width="4.5" stroke-opacity="0.95" stroke-linejoin="round"/>
<path d="${hArea}" fill="url(#hgFill)"/>
<path d="${hPath}" fill="none" stroke="${HOLD}" stroke-width="12" stroke-opacity="0.22" filter="url(#hgG)"/>
<path d="${hPath}" fill="none" stroke="${HOLD}" stroke-width="6" stroke-linejoin="round"/>
<circle cx="${x(cur.ts).toFixed(1)}" cy="${yH(cur.holders).toFixed(1)}" r="8" fill="${HOLD}" stroke="#05050e" stroke-width="2"/>
<text x="64" y="50" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDER GROWTH</text>
<text x="${W - 60}" y="46" fill="${HOLD}" font-size="28" font-weight="800" font-family="sans-serif" text-anchor="end">${grew >= 0 ? "+" : ""}${grew.toLocaleString()} wallets</text>
<text x="64" y="86" fill="#94a3b8" font-size="22" font-family="sans-serif">Holder base over ~${ndays}d vs price (${first.holders.toLocaleString()} → ${cur.holders.toLocaleString()}) — is the crowd accumulating?</text>
<text x="64" y="${H - 16}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · <tspan fill="${HOLD}">holders</tspan> · <tspan fill="${PRICE}">price</tspan> · from the daily on-chain snapshot</text>
</svg>`;
}

export function renderHolderGrowthCard(stats, opts = {}) {
  const svg = holderGrowthSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
