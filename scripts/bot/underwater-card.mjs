// "Underwater" card — the drawdown-from-all-time-high curve (red area, % below the
// running ATH) with the price line (blue, log) for context. The recurring deep-dip →
// new-ATH rhythm at a glance: every time red returns to 0% is a fresh high. Honest
// pain-side counterpart to the aspirational cards. Self-contained from stats.drawn.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { drawdownSummary } from "../../src/models.js";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fPct0 = v => Math.round(v * 100) + "%";
const fPrice = p => (p >= 1 ? "$" + p.toFixed(2) : p >= 0.01 ? "$" + p.toFixed(3) : "$" + p.toFixed(4));

export function underwaterSvg(stats, opts = {}) {
  // Use the true ATH high-water mark (stats.ath folds in the intraday high the weekly
  // bundle misses) so the drawdown depth + "-N% from ATH" match the real all-time high.
  const { series: dd, current, deepest, athCount } = drawdownSummary(stats.drawn || [], stats.ath > 0 ? { price: stats.ath, date: stats.athDate } : null);
  if (dd.length < 2) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 94, mR = 96, mT = 118, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = dd[0].ts, t1 = dd.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yD = v => mT + (-v) * pH;                 // v in [-1,0] → [mT+pH .. mT]
  let pMin = Infinity, pMax = -Infinity;
  for (const r of dd) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; }
  pMin *= 0.8; pMax *= 1.3;
  const yP = p => mT + ((Math.log(pMax) - Math.log(Math.max(p, 1e-9))) / ((Math.log(pMax) - Math.log(pMin)) || 1)) * pH;

  let grid = "";
  for (const v of [0, -0.25, -0.5, -0.75, -1]) {
    const yy = yD(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${v === 0 ? 0.35 : 0.06})"${v === 0 ? ' stroke-dasharray="6 6"' : ""}/>`;
    grid += `<text x="${mL - 10}" y="${(+yy + 6).toFixed(1)}" fill="#f87171" font-size="24" text-anchor="end" font-family="sans-serif">${fPct0(v)}</text>`;
  }
  for (const t of [0.001, 0.01, 0.1, 1, 10].filter(v => v >= pMin && v <= pMax)) {
    grid += `<text x="${W - mR + 12}" y="${(yP(t) + 6).toFixed(1)}" fill="#38bdf8" font-size="24" font-family="sans-serif">$${t < 1 ? t : t.toLocaleString()}</text>`;
  }
  let xlab = "";
  for (let y = new Date(t0).getUTCFullYear(); y <= new Date(t1).getUTCFullYear(); y++) {
    const t = Date.UTC(y, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 40}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${y}</text>`;
  }

  const top = yD(0);
  const area = dd.map(r => `${x(r.ts).toFixed(1)},${yD(r.dd).toFixed(1)}`).join(" ");
  const areaPoly = `${x(dd[0].ts).toFixed(1)},${top.toFixed(1)} ${area} ${x(dd.at(-1).ts).toFixed(1)},${top.toFixed(1)}`;
  const priceLine = dd.map(r => `${x(r.ts).toFixed(1)},${yP(r.price).toFixed(1)}`).join(" ");
  const cx = x(dd.at(-1).ts), cyD = yD(current);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <linearGradient id="uw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.55"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.08"/></linearGradient>
 <filter id="ug" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="uwV" cx="50%" cy="100%" r="90%"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.12"/><stop offset="60%" stop-color="#ef4444" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#uwV)"/>
${cardDepth(W, H)}${brandStripe(H)}
${grid}${xlab}
<polygon points="${areaPoly}" fill="url(#uw)"/>
<polyline points="${priceLine}" fill="none" stroke="#38bdf8" stroke-width="4.2" stroke-linejoin="round"/>
<polyline points="${area}" fill="none" stroke="#ef4444" stroke-width="4.8" stroke-linejoin="round"/>
<circle cx="${cx.toFixed(1)}" cy="${cyD.toFixed(1)}" r="7" fill="#ef4444" stroke="#05050e" stroke-width="2"/>
<text x="64" y="50" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — UNDERWATER</text>
<text x="${W - 60}" y="46" fill="#f87171" font-size="30" font-weight="800" font-family="sans-serif" text-anchor="end">NOW ${fPct0(current)}</text>
<text x="64" y="86" fill="#94a3b8" font-size="22" font-family="sans-serif">% below the running ATH (${fPrice(stats.ath)}) · deepest valley ${fPct0(deepest)} · ${athCount} fresh highs</text>
<text x="64" y="${H - 16}" fill="#64748b" font-size="19" font-family="sans-serif">${esc("spx6900rainbow.xyz · ")}<tspan fill="#f87171" font-weight="700">drawdown from ATH</tspan> · <tspan fill="#38bdf8" font-weight="700">price (log)</tspan></text>
</svg>`;
}

export function renderUnderwaterCard(stats, opts = {}) {
  const svg = underwaterSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
