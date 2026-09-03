// "Cross-chain maxis" — wallets holding ≥5k SPX on BOTH Ethereum and Base (they share EVM address
// space, so this is computable — nobody else does it for SPX). The most committed multi-chain
// believers. Reads ETH_SOL_2026.dual { n, ethHeld, baseHeld, top:[[addr,eth,base]] }.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg, cardDepth} from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const ETH = "#98a2b7", BASE = "#3b82f6";
const fM = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "k";

export function dualHolderData() { const d = ETH_SOL_2026; return d?.dual?.n ? d.dual : null; }

export function dualHolderSvg(dual, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, F = FONT[0] || "sans-serif";
  // ONE bar per wallet = its COMBINED cross-chain stack (Ethereum grey + Base blue), ranked by total.
  // The old two-column table of tiny bars left the bottom half empty; a single ranked stacked bar per
  // wallet fills the frame and reads as "these people are all-in on both chains."
  const items = dual.top.map(r => ({ a: r[0], eth: r[1], base: r[2], sum: r[1] + r[2] }))
    .sort((x, y) => y.sum - x.sum).slice(0, 9);
  const maxSum = Math.max(1, ...items.map(it => it.sum));
  const mT = 236, footY = H - 52, rowH = (footY - mT) / items.length;
  const barH = Math.min(34, rowH * 0.58);
  const bx0 = 328, barMaxW = W - 46 - 100 - bx0;   // reserve ~100px on the right for the total label
  let rows = "";
  items.forEach((it, i) => {
    const cy = mT + rowH * i + rowH / 2, by = cy - barH / 2;
    const bw = Math.max(3, it.sum / maxSum * barMaxW);
    const ew = it.eth / it.sum * bw, bwb = bw - ew;
    rows += `<text x="80" y="${(cy + 7).toFixed(1)}" fill="#cbd5e1" font-size="21" font-family="monospace">${esc(it.a.slice(0, 8))}…</text>`
      + `<rect x="${bx0}" y="${by.toFixed(1)}" width="${ew.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${ETH}"/>`
      + `<rect x="${(bx0 + ew).toFixed(1)}" y="${by.toFixed(1)}" width="${bwb.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${BASE}"/>`
      + `<text x="${(bx0 + bw + 12).toFixed(1)}" y="${(cy + 7).toFixed(1)}" fill="#e6edf7" font-size="20" font-weight="700" font-family="${F}">${fM(it.sum)}</text>`;
  });
  // ETH / Base legend, top-right of the bar area
  const lx = W - 300, ly = 210;
  const legend = `<rect x="${lx}" y="${ly}" width="16" height="16" rx="3" fill="${ETH}"/><text x="${lx + 22}" y="${ly + 13}" fill="#98a2b7" font-size="19" font-family="${F}">Ethereum</text>`
    + `<rect x="${lx + 140}" y="${ly}" width="16" height="16" rx="3" fill="${BASE}"/><text x="${lx + 162}" y="${ly + 13}" fill="#7fb0ff" font-size="19" font-family="${F}">Base</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="dhbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#dhbg)"/>
${auraBg("#3b82f6", W, H, { accent2: "#98a2b7" })}
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — THE CROSS-CHAIN MAXIS</text>
<text x="60" y="104" fill="#7fb0ff" font-size="32" font-weight="800" font-family="sans-serif">${dual.n} wallets hold 5k+ SPX on BOTH Ethereum and Base</text>
<text x="60" y="146" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`the same people, all-in across chains — ${fM(dual.ethHeld)} on Ethereum + ${fM(dual.baseHeld)} on Base, ${fM(dual.ethHeld + dual.baseHeld)} combined`)}</text>
<text x="80" y="${mT - 24}" fill="#cbd5e1" font-size="20" font-weight="700" font-family="sans-serif">Biggest cross-chain holders · combined stack</text>
${legend}
${rows}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · self-custody on each chain · Ethereum & Base share address space")}</text>
</svg>`;
}
export function renderDualHolderCard(_stats, opts = {}) { const d = dualHolderData(); return d ? png(dualHolderSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
