// "SPX6900 — long-term holder supply by chain" — the store-of-value headline. Each chain's ≥5k supply
// split by holding TENURE (HODL-wave bands, fresh→old), with the long-term-holder share (wallets that
// have held a ≥5k position >155d, the Glassnode LTH threshold) called out. NOTE: this is TENURE (time
// since a wallet first crossed 5k), NOT coin dormancy — a long-tenure wallet may still trade within the
// tier. 90-97% on every chain (Base highest: whale + old holders). Reads ETH_SOL_2026 (waves[] + illiquid).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [{ key: "eth", label: "Ethereum" }, { key: "sol", label: "Solana" }, { key: "base", label: "Base" }];
// HODL-wave age colours: fresh (warm) → old (cyan diamond)
const BAND_COL = ["#fb7185", "#fb923c", "#fbbf24", "#34d399", "#22d3ee"];
const BAND_LBL = ["0-1m", "1-3m", "3-6m", "6-12m", "1y+"];

export function chainIlliquidData() {
  const d = ETH_SOL_2026;
  return d && CHAINS.every(c => d[c.key]?.waves?.length === 5 && d[c.key]?.illiquid != null) ? d : null;
}

export function chainIlliquidSvg(d, opts = {}) {
  const chains = CHAINS.map(c => ({ ...c, ...d[c.key] }));
  const W = opts.W ?? 1200, H = opts.H ?? 630, mT = 200, mB = 150, pH = H - mT - mB;
  const bw = 150, slot = (W - 120) / chains.length, x0 = 60;
  const y = pct => mT + pH * (1 - pct / 100);

  let bars = "";
  chains.forEach((c, ci) => {
    const bx = x0 + slot * ci + (slot - bw) / 2;
    let acc = 0;
    c.waves.forEach((v, bi) => {
      const yTop = y(acc + v), h = y(acc) - y(acc + v); acc += v;
      bars += `<rect x="${bx}" y="${yTop.toFixed(1)}" width="${bw}" height="${Math.max(0, h).toFixed(1)}" fill="${BAND_COL[bi]}"/>`;
      if (v >= 6) bars += `<text x="${bx + bw / 2}" y="${(yTop + h / 2 + 6).toFixed(1)}" fill="#0b0b16" font-size="18" font-weight="800" text-anchor="middle" font-family="sans-serif">${v.toFixed(0)}%</text>`;
    });
    // illiquid callout above the bar + chain label below
    bars += `<text x="${bx + bw / 2}" y="${mT - 46}" fill="#22d3ee" font-size="40" font-weight="800" text-anchor="middle" font-family="sans-serif">${c.illiquid.toFixed(0)}%</text>`
      + `<text x="${bx + bw / 2}" y="${mT - 22}" fill="#8ea3b8" font-size="17" text-anchor="middle" font-family="sans-serif">held 155d+</text>`
      + `<text x="${bx + bw / 2}" y="${(mT + pH + 34).toFixed(1)}" fill="#e2e8f0" font-size="23" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(c.label)}</text>`
      + `<text x="${bx + bw / 2}" y="${(mT + pH + 58).toFixed(1)}" fill="#8592a6" font-size="16" text-anchor="middle" font-family="sans-serif">${(c.held / 1e6).toFixed(0)}M · ${c.n.toLocaleString()} wallets</text>`;
  });
  // age legend (right side)
  let ly = mT + 6; const legend = BAND_LBL.map((l, i) => { const s = `<rect x="${W - 150}" y="${ly}" width="16" height="16" rx="3" fill="${BAND_COL[4 - i]}"/><text x="${W - 128}" y="${ly + 13}" fill="#cbd5e1" font-size="18" font-family="sans-serif">${esc(BAND_LBL[4 - i])}</text>`; ly += 30; return s; }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="ilbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#ilbg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — LONG-TERM HOLDER SUPPLY BY CHAIN</text>
<text x="60" y="98" fill="#22d3ee" font-size="27" font-weight="800" font-family="sans-serif">90-97% of supply sits with long-term holders — on every chain</text>
${bars}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · self-custody holders · infra (LP/CEX) excluded")}</text>
</svg>`;
}

export function renderChainIlliquidCard(_stats, opts = {}) {
  const d = chainIlliquidData();
  return d ? png(chainIlliquidSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
