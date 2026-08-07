// "SPX6900 — concentration by chain" — how much of each chain's ≥5k supply the biggest wallets hold.
// The finding: Solana is the most DECENTRALISED (its top wallet holds ~4%), Ethereum is middle, and
// Base is whale-DOMINATED — one wallet (an ENS whale) holds ~41% of Base's ≥5k supply. A distribution
// POSITION, not a signal. Reads the shared ETH_SOL_2026 bundle (conc = [top1, top10, top50] %).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [
  { key: "eth", label: "Ethereum", color: "#98a2b7" },
  { key: "sol", label: "Solana", color: "#a78bfa" },
  { key: "base", label: "Base", color: "#3b82f6" },
];
const GROUPS = ["Top wallet", "Top 10", "Top 50"];

export function chainConcData() {
  const d = ETH_SOL_2026;
  return d && CHAINS.every(c => d[c.key]?.conc?.length === 3) ? d : null;
}

export function chainConcSvg(d, opts = {}) {
  const chains = CHAINS.map(c => ({ ...c, ...d[c.key] }));
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 78, mR = 44, mT = 190, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const maxY = 80;
  const y = v => mT + pH * (1 - v / maxY);

  let grid = "";
  for (let g = 0; g <= maxY; g += 20) {
    const yy = y(g).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.1)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="sans-serif">${g}%</text>`;
  }
  const nG = GROUPS.length, gW = pW / nG, nC = chains.length, bW = gW * 0.62 / nC, gap = gW * 0.38 / (nC + 1);
  let bars = "", xlab = "";
  for (let i = 0; i < nG; i++) {
    const x0 = mL + gW * i;
    chains.forEach((c, k) => {
      const v = c.conc[i], bx = x0 + gap * (k + 1) + bW * k;
      bars += `<rect x="${bx.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bW.toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" rx="4" fill="${c.color}"/>`
        + `<text x="${(bx + bW / 2).toFixed(1)}" y="${(y(v) - 9).toFixed(1)}" fill="#cbd5e1" font-size="18" font-weight="700" text-anchor="middle" font-family="sans-serif">${v.toFixed(0)}%</text>`;
    });
    xlab += `<text x="${(x0 + gW / 2).toFixed(1)}" y="${(mT + pH + 34).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(GROUPS[i])}</text>`;
  }
  let lx = W - mR - 400; const legend = chains.map(c => { const s = `<rect x="${lx}" y="${mT - 28}" width="15" height="15" rx="3" fill="${c.color}"/><text x="${lx + 21}" y="${mT - 16}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${c.label}</text>`; lx += 21 + c.label.length * 11 + 24; return s; }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="ccbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#ccbg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — CONCENTRATION BY CHAIN</text>
<text x="60" y="98" fill="#c4b5fd" font-size="29" font-weight="800" font-family="sans-serif">Solana is the most spread — Base rides on one whale</text>
<text x="60" y="130" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`share of each chain's 5k+ supply held by the biggest wallets · Ethereum ${chains[0].conc[0].toFixed(0)}% top wallet, Solana ${chains[1].conc[0].toFixed(0)}%, Base ${chains[2].conc[0].toFixed(0)}%`)}</text>
${grid}${bars}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · self-custody holders · infra (LP/CEX) excluded")}</text>
</svg>`;
}

export function renderChainConcCard(_stats, opts = {}) {
  const d = chainConcData();
  return d ? png(chainConcSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
