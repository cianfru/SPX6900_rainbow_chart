// "Long vs Short-Term Holders — Supply in Profit/Loss" card. Splits every held coin two
// ways at once, from the LOCAL FIFO per-lot engine: by AGE (long-term = held >155d (Glassnode LTH standard) = the
// diamond base, vs short-term) and by whether it's in PROFIT or LOSS vs spot. Four stacked
// bands over the full history. The on-brand read: the long-term block dominates AND much of
// it sits underwater yet unmoved = conviction, not capitulation. Data: stats.fifo
// (lthProfit/lthLoss/sthProfit/sthLoss, src/spx-onchain.js). A holder-behaviour POSITION, not a
// signal. Clean/colourful in the HODL-waves house style the owner favours.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// stacking order, bottom → top: LTH block (the diamond base) first, then STH on top.
const BANDS = [
  { k: "lthProfit", label: "long-term · profit", c: "#16a34a" },
  { k: "lthLoss", label: "long-term · loss", c: "#dc2626" },
  { k: "sthProfit", label: "short-term · profit", c: "#86efac" },
  { k: "sthLoss", label: "short-term · loss", c: "#fca5a5" },
];

export function lthSthSvg(stats, opts = {}) {
  const rows = (stats.fifo || []).filter(r => Number.isFinite(r.lthProfit) && Number.isFinite(r.sthLoss) && r.d)
    .map(r => ({ ts: Date.parse(r.d), v: BANDS.map(b => r[b.k]) })).sort((a, b) => a.ts - b.ts);
  if (rows.length < 50) return null;
  const cur = rows.at(-1);
  const lth = cur.v[0] + cur.v[1], underwater = cur.v[1] + cur.v[3];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 102, mR = 254, mT = 150, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH;
  const cum = (v, i) => { let s = 0; for (let k = 0; k <= i; k++) s += v[k]; return s; };

  let ribbons = "";
  for (let i = 0; i < BANDS.length; i++) {
    const top = rows.map(r => `${x(r.ts).toFixed(1)},${y(cum(r.v, i)).toFixed(1)}`);
    const bot = rows.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : cum(r.v, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${BANDS[i].c}" fill-opacity="0.9" stroke="#05050e" stroke-width="0.4"/>`;
  }

  let grid = "";
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = y(v).toFixed(1);
    grid += `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#e2e8f0" font-size="24" font-weight="600" text-anchor="end" font-family="sans-serif">${v}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#cbd5e1" font-size="24" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  // legend (right gutter), top → bottom mirrors visual stack (STH on top)
  let legend = "";
  for (let i = BANDS.length - 1, j = 0; i >= 0; i--, j++) {
    const ly = mT + 24 + j * 40;
    legend += `<rect x="${W - mR + 18}" y="${(ly - 16).toFixed(1)}" width="19" height="19" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${W - mR + 44}" y="${ly.toFixed(1)}" fill="#e2e8f0" font-size="18" font-weight="600" font-family="sans-serif">${esc(BANDS[i].label)}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="lsbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#lsbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="37" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — LONG vs SHORT-TERM HOLDERS</text>
<text x="60" y="92" fill="#aab6c8" font-size="22" font-family="sans-serif">Long-term = held 155 days+ (Glassnode standard) · split by profit vs loss</text>
<text x="60" y="130" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif"><tspan fill="#4ade80">${lth.toFixed(0)}% held long-term</tspan> · ${underwater.toFixed(0)}% underwater and holding</text>
${grid}${xlab}${ribbons}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · % of ETH-native supply by holder age and on-chain profit/loss (FIFO)")}</text>
</svg>`;
}

export function renderLthSthCard(stats, opts = {}) {
  const svg = lthSthSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
