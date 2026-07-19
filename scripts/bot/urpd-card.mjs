// "Cost Basis Distribution" (URPD) card — WHERE the held supply was bought, as a histogram
// of per-lot acquisition price from the LOCAL FIFO engine (previously impossible: it needs
// the full cost-basis distribution, not just the aggregate break-even). Each bar = % of
// currently-held supply acquired in that price range; green = in profit (bought below spot),
// red = underwater (bought above). A vertical spot line splits the two. "Where are the bags?"
// — the walls of supply that become support/resistance. Data: stats.urpd (src/spx-urpd.js).
// A holder-cost POSITION, not a signal. Clean/colourful in the HODL-waves house style.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GRN = "#34d399", RED = "#fb7185";
const fp = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);

export function urpdSvg(stats, opts = {}) {
  const u = stats.urpd;
  if (!u || !Array.isArray(u.buckets) || u.buckets.length < 8) return null;
  const b = u.buckets, spot = u.spot;
  const inProfit = b.filter(x => x.inProfit).reduce((a, x) => a + x.pct, 0);
  // biggest wall
  let wall = b[0]; for (const x of b) if (x.pct > wall.pct) wall = x;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 80, mR = 56, mT = 150, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const lo = Math.log(b[0].lo), hi = Math.log(b.at(-1).hi);
  const x = p => mL + ((Math.log(p) - lo) / (hi - lo || 1)) * pW;
  const maxPct = Math.max(...b.map(z => z.pct)) || 1;
  const y = pct => mT + (1 - pct / (maxPct * 1.08)) * pH;
  const baseY = mT + pH;

  // price gridlines at decade-ish stops within range
  let grid = "";
  const stops = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3].filter(p => p >= b[0].lo && p <= b.at(-1).hi);
  for (const p of stops) {
    const xx = x(p).toFixed(1);
    grid += `<line x1="${xx}" y1="${mT}" x2="${xx}" y2="${baseY}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${xx}" y="${(baseY + 34).toFixed(1)}" fill="#cbd5e1" font-size="24" font-weight="600" text-anchor="middle" font-family="sans-serif">${fp(p)}</text>`;
  }

  // bars
  let bars = "";
  for (const z of b) {
    const x0 = x(z.lo), x1 = x(z.hi), bw = Math.max(x1 - x0 - 1.5, 1);
    const yy = y(z.pct), h = baseY - yy;
    if (h < 0.5) continue;
    bars += `<rect x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${z.inProfit ? "url(#upG)" : "url(#upR)"}"/>`;
  }
  // spot marker (label sits inside the plot top, anchored away from the plot edge; the
  // biggest-wall figure lives in the hero, so no separate over-bar label to collide with)
  const sx = x(spot), sxr = sx > mL + pW * 0.6; // spot on the right half → anchor label left
  const spotMark = `<line x1="${sx.toFixed(1)}" y1="${mT.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${baseY}" stroke="#f8fafc" stroke-width="2.5" stroke-dasharray="6 5"/>`
    + `<text x="${(sx + (sxr ? -10 : 10)).toFixed(1)}" y="${(mT + 26).toFixed(1)}" fill="#f8fafc" font-size="22" font-weight="700" text-anchor="${sxr ? "end" : "start"}" font-family="sans-serif">spot ${fp(spot)}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="upbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="upG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.95"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0.4"/></linearGradient>
<linearGradient id="upR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${RED}" stop-opacity="0.95"/><stop offset="100%" stop-color="${RED}" stop-opacity="0.4"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#upbg)"/>
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — COST BASIS DISTRIBUTION</text>
<text x="60" y="92" fill="#aab6c8" font-size="22" font-family="sans-serif">Where every held coin was bought — green in profit, red underwater. Where are the bags?</text>
<text x="60" y="130" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif"><tspan fill="${GRN}">${inProfit.toFixed(0)}% in profit</tspan> · biggest wall ${fp(wall.lo)}–${fp(wall.hi)} (${wall.pct.toFixed(0)}%)</text>
${grid}${bars}${spotMark}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · % of held supply by on-chain cost basis (FIFO per-lot) · log price")}</text>
</svg>`;
}

export function renderUrpdCard(stats, opts = {}) {
  const svg = urpdSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
