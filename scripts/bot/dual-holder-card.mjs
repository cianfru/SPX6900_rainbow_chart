// "Cross-chain maxis" — wallets holding ≥5k SPX on BOTH Ethereum and Base (they share EVM address
// space, so this is computable — nobody else does it for SPX). The most committed multi-chain
// believers. Reads ETH_SOL_2026.dual { n, ethHeld, baseHeld, top:[[addr,eth,base]] }.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const ETH = "#98a2b7", BASE = "#3b82f6";
const fM = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "k";

export function dualHolderData() { const d = ETH_SOL_2026; return d?.dual?.n ? d.dual : null; }

export function dualHolderSvg(dual, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const rows = dual.top.slice(0, 6).map((r, i) => {
    const yy = 300 + i * 46;
    return `<text x="80" y="${yy}" fill="#e2e8f0" font-size="20" font-family="monospace">${esc(r[0].slice(0, 10))}…</text>`
      + `<rect x="360" y="${yy - 17}" width="${Math.min(320, r[1] / 12e6 * 320).toFixed(0)}" height="20" rx="3" fill="${ETH}"/><text x="${360 + Math.min(320, r[1] / 12e6 * 320) + 8}" y="${yy}" fill="#98a2b7" font-size="17" font-family="sans-serif">${fM(r[1])}</text>`
      + `<rect x="740" y="${yy - 17}" width="${Math.min(320, r[2] / 12e6 * 320).toFixed(0)}" height="20" rx="3" fill="${BASE}"/><text x="${740 + Math.min(320, r[2] / 12e6 * 320) + 8}" y="${yy}" fill="#7fb0ff" font-size="17" font-family="sans-serif">${fM(r[2])}</text>`;
  }).join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="dhbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#dhbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — THE CROSS-CHAIN MAXIS</text>
<text x="60" y="104" fill="#7fb0ff" font-size="32" font-weight="800" font-family="sans-serif">${dual.n} wallets hold 5k+ SPX on BOTH Ethereum and Base</text>
<text x="60" y="146" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`the same people, doubling down across chains — ${fM(dual.ethHeld)} on Ethereum + ${fM(dual.baseHeld)} on Base between them`)}</text>
<text x="80" y="230" fill="#cbd5e1" font-size="20" font-weight="700" font-family="sans-serif">Top cross-chain holders</text>
<text x="360" y="230" fill="#98a2b7" font-size="18" font-weight="700" font-family="sans-serif">Ethereum</text>
<text x="740" y="230" fill="#7fb0ff" font-size="18" font-weight="700" font-family="sans-serif">Base</text>
<line x1="80" y1="248" x2="${W - 60}" y2="248" stroke="rgba(255,255,255,0.1)"/>
${rows}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ≥5k SPX self-custody on each chain · Ethereum & Base share address space")}</text>
</svg>`;
}
export function renderDualHolderCard(_stats, opts = {}) { const d = dualHolderData(); return d ? png(dualHolderSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
