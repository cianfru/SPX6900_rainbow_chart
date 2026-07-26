// "Net Realized Profit/Loss" card. When coins move on-chain, how much profit or loss did
// holders actually LOCK IN that week — in dollars? SOPR is the ratio (did they sell at a
// profit); this is the SIZE. Green bars above zero = net profit-taking, red below = net
// losses realized (capitulation). Straight from the LOCAL FIFO per-lot engine: for every
// spend, realized value − cost, split into gains and losses. Data: stats.fifo (nrpl per
// weekly window). A behaviour POSITION, not a signal. House-style edge-bright zones.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GRN = "#34d399", RED = "#fb7185";
const money = n => { const a = Math.abs(n); const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`; return n < 0 ? `−${s}` : s; };

export function nrplSvg(stats, opts = {}) {
  const raw = (stats.fifo || []).filter(r => Number.isFinite(r.nrpl) && r.d)
    .map(r => ({ ts: Date.parse(r.d), v: r.nrpl })).sort((a, b) => a.ts - b.ts);
  if (raw.length < 50) return null;
  const cur = raw.at(-1);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 40, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  // symmetric scale off a high percentile of |value| so the typical week fills the panel and
  // rare capitulation/euphoria spikes clip at the edge rather than flattening everything.
  const mags = raw.map(r => Math.abs(r.v)).sort((a, b) => a - b);
  const cap = mags[Math.floor(mags.length * 0.94)] || Math.max(...mags) || 1;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const zeroY = mT + pH / 2;
  const y = v => zeroY - (Math.max(-cap, Math.min(cap, v)) / cap) * (pH / 2);
  const bw = Math.max(1.5, pW / raw.length - 0.6);

  const zones = `<rect x="${mL}" y="${mT}" width="${pW}" height="${(zeroY - mT).toFixed(1)}" fill="url(#nrG)"/>`
    + `<rect x="${mL}" y="${zeroY.toFixed(1)}" width="${pW}" height="${(mT + pH - zeroY).toFixed(1)}" fill="url(#nrR)"/>`;
  const zoneLabels =
    `<text x="${W - mR - 8}" y="${(mT + 30).toFixed(1)}" fill="#6ee7b7" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">profit taken</text>`
    + `<text x="${W - mR - 8}" y="${(mT + pH - 14).toFixed(1)}" fill="#fecdd3" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">losses realized</text>`;

  let grid = "";
  for (const v of [cap, cap / 2, 0, -cap / 2, -cap]) {
    const yy = y(v).toFixed(1), is0 = v === 0;
    grid += `<text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${v > 0 ? "+" : v < 0 ? "−" : ""}${v === 0 ? "0" : money(Math.abs(v)).replace("$", "$")}</text>`;
    if (!is0) grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const bars = raw.map(r => {
    const yy = y(r.v), h = Math.abs(yy - zeroY);
    return `<rect x="${(x(r.ts) - bw / 2).toFixed(1)}" y="${Math.min(yy, zeroY).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" fill="${r.v >= 0 ? GRN : RED}" opacity="0.92"/>`;
  }).join("");

  const col = cur.v >= 0 ? GRN : RED;
  const state = cur.v >= 0 ? "net profit-taking last week" : "net losses realized last week";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="nrbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="nrG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.34"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0.02"/></linearGradient>
<linearGradient id="nrR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${RED}" stop-opacity="0.02"/><stop offset="100%" stop-color="${RED}" stop-opacity="0.34"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#nrbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — NET REALIZED PROFIT / LOSS</text>
<text x="60" y="92" fill="#aab6c8" font-size="22" font-family="sans-serif">How much profit or loss holders actually locked in when coins moved, in dollars, each week.</text>
<text x="60" y="130" fill="${col}" font-size="32" font-weight="800" font-family="sans-serif">${money(cur.v)} — ${state}</text>
${zones}${grid}${xlab}${zoneLabels}${bars}
<line x1="${mL}" y1="${zeroY.toFixed(1)}" x2="${W - mR}" y2="${zeroY.toFixed(1)}" stroke="#f8fafc" stroke-width="2.5"/>
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · realized value − cost of coins that moved, weekly (FIFO per-lot)")}</text>
</svg>`;
}

export function renderNrplCard(stats, opts = {}) {
  const svg = nrplSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
