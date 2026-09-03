// SPX6900 — "what the whales did" card.
//
// This exists because HODL waves cannot answer the question people actually ask of
// them. Waves say 56% of supply has not moved in a year; they say nothing about WHO
// is holding it. Supply can sit perfectly still while it changes hands from a handful
// of large wallets to tens of thousands of small ones, and that is exactly what has
// happened here.
//
// Whale = a wallet holding at least 0.1% of holder supply. Defined by SIZE, not by
// rank: top-10 and top-100 are a fixed headcount, so their share falling can only ever
// say "concentration eased". A size threshold lets the count and the share move
// independently — and the gap between them is the finding. The count has sat near 150
// to 200 the whole time while the share fell from 86% to 65%.
//
// Excludes the tagged exchange, LP, bridge and burn addresses, same as every other
// holder metric here — otherwise Wormhole and the CEX hot wallets ARE the whales.
//
// Data: public/onchain.json → whaleN / whalePct (weekly, from the FIFO reconstruction).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const WH = "#fb923c";      // whale share — the line that moved
const HOLD = "#38bdf8";    // holder count — the line that exploded
const fK = n => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));

export function whalesSvg(stats, opts = {}) {
  const src = stats?.onchain || [];
  // Early weeks have a few hundred holders and a threshold that means nothing; wait
  // until the base is real before drawing a share.
  const rows = src
    .filter(r => r?.whalePct > 0 && r?.holders > 1000)
    .map(r => ({ t: Date.parse(r.d), pct: r.whalePct, n: r.whaleN, h: r.holders }))
    .filter(r => Number.isFinite(r.t));
  if (rows.length < 40) return null;

  const cur = rows.at(-1);
  const peak = rows.reduce((a, b) => (b.pct > a.pct ? b : a));

  const W = opts.W ?? 1200, H = opts.H ?? 800;
  const mL = 104, mR = 104, mT = 196, mB = 92;
  const pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  const pMax = 100;
  const y = v => mT + (1 - v / pMax) * pH;
  const hMax = Math.max(...rows.map(r => r.h)) * 1.08;
  const yh = v => mT + (1 - v / hMax) * pH;

  let grid = "";
  for (let v = 0; v <= 100; v += 25) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="${F}">${v}%</text>`;
  }
  // Right axis for the holder count — a genuinely different unit, so it gets its own
  // labelled scale rather than being crammed onto the percentage axis.
  for (const v of [0, 25000, 50000].filter(v => v <= hMax)) {
    grid += `<text x="${W - mR + 12}" y="${(yh(v) + 7).toFixed(1)}" fill="${HOLD}" font-size="22" font-family="${F}">${fK(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  const whaleLine = rows.map(r => `${x(r.t).toFixed(1)},${y(r.pct).toFixed(1)}`).join(" ");
  const holdLine = rows.map(r => `${x(r.t).toFixed(1)},${yh(r.h).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${whaleLine} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const px = x(peak.t), py = y(peak.pct), cx = x(cur.t), cy = y(cur.pct);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="whbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#100c16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="whf" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="${WH}" stop-opacity="0.34"/><stop offset="100%" stop-color="${WH}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#whbg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — WHAT THE WHALES DID</text>
<text x="60" y="100" fill="#94a3b8" font-size="22" font-family="${F}">${esc(`Wallets holding 0.1%+ of supply. Still ${cur.n} of them — the same cohort, a smaller slice.`)}</text>
<text x="60" y="148" fill="${WH}" font-size="34" font-weight="700" font-family="${F}">${esc(`Whales hold ${cur.pct.toFixed(0)}% — down from ${peak.pct.toFixed(0)}%`)}</text>
${grid}${xlab}
<polygon points="${area}" fill="url(#whf)"/>
<polyline points="${holdLine}" fill="none" stroke="${HOLD}" stroke-width="3" stroke-opacity="0.9" stroke-dasharray="7 6"/>
<polyline points="${whaleLine}" fill="none" stroke="${WH}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="${WH}" stroke="#05050e" stroke-width="3"/>
<text x="${px.toFixed(1)}" y="${(py - 22).toFixed(1)}" fill="${WH}" font-size="21" font-weight="700" text-anchor="middle" font-family="${F}">peak ${peak.pct.toFixed(0)}%</text>
<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="${WH}" stroke="#05050e" stroke-width="3"/>
<text x="${(mL + pW - 14)}" y="${(mT + 34)}" fill="${HOLD}" font-size="21" font-weight="700" text-anchor="end" font-family="${F}">holders (right) — ${fK(rows[0].h)} to ${fK(cur.h)}</text>
<text x="60" y="${H - 20}" fill="#5b6577" font-size="21" font-family="${F}">${esc("whale = 0.1%+ of holder supply · exchanges, LP, bridge and burn excluded")}</text>
</svg>`;
}

export function renderWhalesCard(stats, opts = {}) {
  const svg = whalesSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
