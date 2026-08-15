// "Do bigger holders hold longer?" — median holding age by balance tier, per chain. The finding: yes,
// monotonically — the biggest wallets have held the longest on every chain. Reads ETH_SOL_2026.tiers
// ([count, medianAgeDays] per band). A distribution POSITION, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [{ key: "eth", label: "Ethereum", color: "#98a2b7" }, { key: "sol", label: "Solana", color: "#a78bfa" }, { key: "base", label: "Base", color: "#3b82f6" }];
const TIERS = ["5-25k", "25-100k", "100k-1M", "1M+"];

export function balanceTierData() {
  const d = ETH_SOL_2026;
  return d && CHAINS.every(c => d[c.key]?.tiers?.length === 4) ? d : null;
}

export function balanceTierSvg(d, opts = {}) {
  const chains = CHAINS.map(c => ({ ...c, tiers: d[c.key].tiers }));
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 44, mT = 190, mB = 108, pW = W - mL - mR, pH = H - mT - mB;
  const maxY = Math.max(700, Math.ceil(Math.max(...chains.flatMap(c => c.tiers.map(t => t[1]))) / 100) * 100);
  const y = v => mT + pH * (1 - v / maxY);
  let grid = "";
  for (let g = 0; g <= maxY; g += 180) { const yy = y(g).toFixed(1); grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.1)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="20" text-anchor="end" font-family="sans-serif">${Math.round(g / 30)}mo</text>`; }
  const nG = TIERS.length, gW = pW / nG, nC = 3, bW = gW * 0.6 / nC, gap = gW * 0.4 / (nC + 1);
  let bars = "", xlab = "";
  for (let i = 0; i < nG; i++) {
    const x0 = mL + gW * i;
    chains.forEach((c, k) => { const v = c.tiers[i][1], bx = x0 + gap * (k + 1) + bW * k; if (!v) return;
      bars += `<rect x="${bx.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bW.toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" rx="4" fill="${c.color}"/>`
        + `<text x="${(bx + bW / 2).toFixed(1)}" y="${(y(v) - 8).toFixed(1)}" fill="#cbd5e1" font-size="16" font-weight="700" text-anchor="middle" font-family="sans-serif">${Math.round(v / 30)}mo</text>`; });
    xlab += `<text x="${(x0 + gW / 2).toFixed(1)}" y="${(mT + pH + 32).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="sans-serif">${esc(TIERS[i])}</text>`;
  }
  let lx = W - mR - 400; const legend = chains.map(c => { const s = `<rect x="${lx}" y="${mT - 28}" width="15" height="15" rx="3" fill="${c.color}"/><text x="${lx + 21}" y="${mT - 16}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${c.label}</text>`; lx += 21 + c.label.length * 11 + 24; return s; }).join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="btbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#btbg)"/>
${auraBg("#818cf8", W, H)}
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — DO BIGGER HOLDERS HOLD LONGER?</text>
<text x="60" y="98" fill="#c4b5fd" font-size="30" font-weight="800" font-family="sans-serif">Mostly yes — conviction climbs with size (clearest on Ethereum &amp; Base)</text>
<text x="60" y="130" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc("median holding age by balance tier · conviction rises with position size")}</text>
${grid}${bars}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · self-custody holders · infra (LP/CEX) excluded")}</text>
</svg>`;
}
export function renderBalanceTierCard(_stats, opts = {}) { const d = balanceTierData(); return d ? png(balanceTierSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
