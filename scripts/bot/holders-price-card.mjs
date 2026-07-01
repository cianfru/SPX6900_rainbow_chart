// "Holders vs price" dual-axis card — holder count (left, green) against SPX
// price (right, blue) over a period. Self-contained (own chrome), so it never
// touches the shared line renderer. spec: { title, headline, accent,
// holders: [[ts,count]], price: [[ts,price]] }.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// Smooth SVG path through screen points (Catmull-Rom → cubic Bézier), so the
// card's lines read smooth like the website's type="monotone" curves, not edgy.
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fNum = n => Math.round(n).toLocaleString("en-US");
const fPx = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.01 ? 4 : p < 0.1 ? 3 : 2));
const HOLDERS = "#4ade80", PRICE = "#38bdf8";
const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function holdersPriceSvg(spec, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 800;
  const holders = (spec.holders || []).filter(p => p[1] != null).sort((a, b) => a[0] - b[0]);
  const price = (spec.price || []).filter(p => p[1] > 0).sort((a, b) => a[0] - b[0]);
  const accent = spec.accent || HOLDERS;
  const mL = 150, mR = 150, mT = 200, mB = 132, pW = W - mL - mR, pH = H - mT - mB;

  const allX = [...holders, ...price].map(p => p[0]);
  const xMin = Math.min(...allX), xMax = Math.max(...allX);
  const X = x => mL + ((x - xMin) / ((xMax - xMin) || 1)) * pW;

  const hv = holders.map(p => p[1]);
  const hlo = Math.min(...hv), hhi = Math.max(...hv), hpad = Math.max((hhi - hlo) * 0.3, 20);
  const HL = hlo - hpad, HH = hhi + hpad;
  const Yh = v => mT + ((HH - v) / ((HH - HL) || 1)) * pH;
  const pv = price.map(p => p[1]);
  const plo = Math.min(...pv), phi = Math.max(...pv), ppad = Math.max((phi - plo) * 0.12, plo * 0.02);
  const PL = plo - ppad, PH2 = phi + ppad;
  const Yp = v => mT + ((PH2 - v) / ((PH2 - PL) || 1)) * pH;

  // gridlines + left (holders, green) / right (price, blue) axis labels
  let grid = "";
  for (let k = 0; k <= 3; k++) {
    const v = HL + (HH - HL) * k / 3, y = Yh(v);
    grid += `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 14}" y="${(y + 9).toFixed(1)}" fill="${HOLDERS}" font-size="26" text-anchor="end" font-family="sans-serif">${fNum(v)}</text>`;
    const pvk = PL + (PH2 - PL) * k / 3;
    grid += `<text x="${W - mR + 14}" y="${(Yp(pvk) + 9).toFixed(1)}" fill="${PRICE}" font-size="26" font-family="sans-serif">${fPx(pvk)}</text>`;
  }
  // x date labels (~5 across)
  let xlab = "";
  const n = Math.max(holders.length, price.length), src = holders.length >= price.length ? holders : price;
  const every = Math.max(1, Math.round(src.length / 5));
  src.forEach((p, i) => { if (i % every === 0 && i <= src.length - 1 - Math.floor(every / 2)) xlab += `<text x="${X(p[0]).toFixed(1)}" y="${H - mB + 38}" fill="#64748b" font-size="26" text-anchor="middle" font-family="sans-serif">${fMon(p[0])}</text>`; });

  const hPts = holders.map(p => [X(p[0]), Yh(p[1])]);
  const pPts = price.map(p => [X(p[0]), Yp(p[1])]);
  const pathH = smoothPath(hPts), pathP = smoothPath(pPts);
  const base = (mT + pH).toFixed(1);
  const areaH = hPts.length >= 2 ? `${pathH} L ${hPts.at(-1)[0].toFixed(1)},${base} L ${hPts[0][0].toFixed(1)},${base} Z` : "";
  const lastH = holders.at(-1);

  const hlFont = spec.headline ? Math.min(52, Math.floor((W - 128) / (spec.headline.length * 0.6))) : 52;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="hpTop" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/><stop offset="55%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  <linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${HOLDERS}" stop-opacity="0.22"/><stop offset="100%" stop-color="${HOLDERS}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#hpTop)"/>
<text x="64" y="52" fill="#94a3b8" font-size="30" font-weight="700" letter-spacing="3" font-family="sans-serif">SPX6900</text>
<text x="${W - 64}" y="52" fill="#475569" font-size="24" text-anchor="end" font-family="sans-serif">${esc(spec.date || "")}</text>
<text x="64" y="112" fill="#e2e8f0" font-size="38" font-weight="700" font-family="sans-serif">${esc(spec.title || "")}</text>
${spec.headline ? `<text x="64" y="166" fill="${accent}" font-size="${hlFont}" font-weight="800" font-family="sans-serif">${esc(spec.headline)}</text>` : ""}
${grid}${xlab}
<path d="${areaH}" fill="url(#hpFill)"/>
<path d="${pathP}" fill="none" stroke="${PRICE}" stroke-width="3" stroke-opacity="0.9" stroke-linejoin="round"/>
<path d="${pathH}" fill="none" stroke="${HOLDERS}" stroke-width="4" stroke-linejoin="round"/>
${lastH ? `<circle cx="${X(lastH[0]).toFixed(1)}" cy="${Yh(lastH[1]).toFixed(1)}" r="8" fill="#fff" stroke="${HOLDERS}" stroke-width="3"/>` : ""}
<g font-family="sans-serif"><rect x="64" y="${H - mB + 74}" width="20" height="6" rx="3" fill="${HOLDERS}"/><text x="92" y="${H - mB + 86}" fill="#cbd5e1" font-size="26">holders (left)</text><rect x="330" y="${H - mB + 74}" width="20" height="6" rx="3" fill="${PRICE}"/><text x="358" y="${H - mB + 86}" fill="#cbd5e1" font-size="26">SPX price (right)</text></g>
<text x="64" y="${H - 22}" fill="#475569" font-size="26" font-family="sans-serif">spx6900rainbow.xyz · not financial advice</text>
</svg>`;
}

export function renderHoldersPriceCard(spec, opts = {}) { return png(holdersPriceSvg(spec, opts), opts.W ?? 1200); }
