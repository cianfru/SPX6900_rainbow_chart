// "SPX6900 — long-term holder supply by chain" — the store-of-value headline. Each chain's ≥5k supply
// split by holding TENURE (HODL-wave bands, fresh→old), with the long-term-holder share (wallets that
// have held a ≥5k position >155d, the Glassnode LTH threshold) called out. NOTE: this is TENURE (time
// since a wallet first crossed 5k), NOT coin dormancy — a long-tenure wallet may still trade within the
// tier. 90-97% on every chain (Base highest: whale + old holders). Reads ETH_SOL_2026 (waves[] + illiquid).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg, cardDepth} from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [{ key: "eth", label: "Ethereum" }, { key: "sol", label: "Solana" }, { key: "base", label: "Base" }];
const ILLIQ = "#22d3ee", LIQ = "#475569";   // held long-term (cyan) vs the liquid remainder (slate)

export function chainIlliquidData() {
  const d = ETH_SOL_2026;
  return d && CHAINS.every(c => d[c.key]?.illiquid != null && d[c.key]?.held > 0) ? d : null;
}

export function chainIlliquidSvg(d, opts = {}) {
  // ic = share of each chain's CIRCULATING supply held long-term (self-custody >155d), so the
  // denominator INCLUDES exchanges + LP. This is the honest number — the old card divided by
  // self-custody only (excluding CEX), which flattered it to 90-97%. Falls back to that if the
  // bundle predates `circ`.
  const chains = CHAINS.map(c => ({ ...c, ...d[c.key] }))
    .map(c => ({ ...c, ic: c.circ > 0 ? (c.held * c.illiquid / 100) / c.circ * 100 : c.illiquid }));
  const W = opts.W ?? 1200, H = opts.H ?? 630, mT = 226, mB = 152, pH = H - mT - mB;
  const bw = 150, slot = (W - 120) / chains.length, x0 = 60;
  const y = pct => mT + pH * (1 - pct / 100);
  const ics = chains.map(c => c.ic), lo = Math.round(Math.min(...ics)), hi = Math.round(Math.max(...ics));

  let bars = "";
  chains.forEach((c, ci) => {
    const bx = x0 + slot * ci + (slot - bw) / 2;
    const yBase = y(0), yBound = y(c.ic), yTop = y(100);
    // liquid remainder (bottom, slate) + held-long-term (top, cyan)
    bars += `<rect x="${bx}" y="${yBound.toFixed(1)}" width="${bw}" height="${(yBase - yBound).toFixed(1)}" fill="${LIQ}"/>`
      + `<rect x="${bx}" y="${yTop.toFixed(1)}" width="${bw}" height="${(yBound - yTop).toFixed(1)}" fill="${ILLIQ}"/>`;
    // segment % — the held-long-term share always; the liquid share when it has room
    bars += `<text x="${bx + bw / 2}" y="${(yTop + (yBound - yTop) / 2 + 8).toFixed(1)}" fill="#04222c" font-size="25" font-weight="800" text-anchor="middle" font-family="sans-serif">${c.ic.toFixed(0)}%</text>`;
    if (100 - c.ic >= 12) bars += `<text x="${bx + bw / 2}" y="${(yBound + (yBase - yBound) / 2 + 6).toFixed(1)}" fill="#cbd5e1" font-size="18" font-weight="700" text-anchor="middle" font-family="sans-serif">${(100 - c.ic).toFixed(0)}%</text>`;
    // callout above + chain label + circulating supply below
    bars += `<text x="${bx + bw / 2}" y="${mT - 46}" fill="${ILLIQ}" font-size="40" font-weight="800" text-anchor="middle" font-family="sans-serif">${c.ic.toFixed(0)}%</text>`
      + `<text x="${bx + bw / 2}" y="${mT - 22}" fill="#8ea3b8" font-size="17" text-anchor="middle" font-family="sans-serif">held long-term</text>`
      + `<text x="${bx + bw / 2}" y="${(mT + pH + 34).toFixed(1)}" fill="#e2e8f0" font-size="23" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(c.label)}</text>`
      + `<text x="${bx + bw / 2}" y="${(mT + pH + 58).toFixed(1)}" fill="#8592a6" font-size="16" text-anchor="middle" font-family="sans-serif">${(c.circ / 1e6).toFixed(0)}M circulating</text>`;
  });
  // horizontal legend under the headline
  const legend = `<rect x="60" y="120" width="15" height="15" rx="3" fill="${ILLIQ}"/><text x="81" y="132" fill="#cbd5e1" font-size="18" font-family="sans-serif">held 155d+</text>`
    + `<rect x="228" y="120" width="15" height="15" rx="3" fill="${LIQ}"/><text x="249" y="132" fill="#cbd5e1" font-size="18" font-family="sans-serif">exchanges + recent buyers</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="ilbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#ilbg)"/>
${auraBg("#22d3ee", W, H)}
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HELD LONG-TERM, BY CHAIN</text>
<text x="60" y="98" fill="#22d3ee" font-size="26" font-weight="800" font-family="sans-serif">${esc(`${lo}–${hi}% of circulating supply is held long-term`)}</text>
${legend}${bars}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · share of each chain's circulating supply · exchanges & LP = liquid")}</text>
</svg>`;
}

export function renderChainIlliquidCard(_stats, opts = {}) {
  const d = chainIlliquidData();
  return d ? png(chainIlliquidSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
