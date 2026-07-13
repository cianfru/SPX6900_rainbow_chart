// "Holders across chains" reach card — SPX lives on Ethereum (native), Base and Solana
// (both bridged, e.g. Wormhole). By SUPPLY the bridged chains are only ~6%, but by
// HEADCOUNT they dwarf ETH: the community is ~4.6× the ~49.5k we usually post. This card
// tells that reach story — a big honest total + the per-chain split. Data-gated: needs
// the multi-chain snapshot columns (Base bank on the first cron; Solana once its key is set).
// Honesty rails baked into the copy/subhead: these are WALLETS across chains, not people
// (Base is EVM, so a whale can reuse its ETH address), and reach ≠ the supply-tier math.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fK = n => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));

// Per-chain brand hues. Solana keeps its signature teal→violet, shown as teal here.
const CHAINS = [
  { key: "eth", label: "Ethereum", sub: "native", c: "#8b9dfa" },
  { key: "base", label: "Base", sub: "bridged", c: "#3b82f6" },
  { key: "sol", label: "Solana", sub: "bridged", c: "#14f195" },
];

export function multichainSvg(stats, opts = {}) {
  const s = stats.supply;
  if (!s) return null;
  const counts = { eth: s.holders, base: s.holdersBase, sol: s.holdersSol };
  // Data-gate: need ETH + at least one bridged chain actually banked, or there is no
  // multi-chain story to tell (just the ETH number we already post elsewhere).
  if (!(counts.eth > 0) || !(counts.base > 0 || counts.sol > 0)) return null;
  const rows = CHAINS.map(c => ({ ...c, n: counts[c.key] || 0 })).filter(r => r.n > 0);
  const total = rows.reduce((a, r) => a + r.n, 0);
  const mult = counts.eth ? total / counts.eth : 1;

  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const mL = 64, mR = 64, barW = W - mL - mR;
  const barY = 340, barH = 58;

  // Segmented reach bar — each chain a slice of the total, in chain order.
  let seg = "", acc = 0, ticks = "";
  rows.forEach((r, i) => {
    const w = (r.n / total) * barW;
    const x0 = mL + (acc / total) * barW;
    const r0 = i === 0 ? 12 : 0, r1 = i === rows.length - 1 ? 12 : 0;
    seg += `<rect x="${x0.toFixed(1)}" y="${barY}" width="${Math.max(0, w - 3).toFixed(1)}" height="${barH}" rx="8" fill="${r.c}" fill-opacity="0.92"/>`;
    // in-bar label if the slice is wide enough
    if (w > 130) seg += `<text x="${(x0 + w / 2).toFixed(1)}" y="${barY + 37}" fill="#05050e" font-size="24" font-weight="800" text-anchor="middle" font-family="sans-serif">${fK(r.n)}</text>`;
    acc += r.n;
  });

  // Legend chips under the bar: swatch · chain · count · sub
  const legY = barY + barH + 62;
  let legend = "";
  const colW = barW / rows.length;
  rows.forEach((r, i) => {
    const cx = mL + colW * i + 4;
    legend += `<rect x="${cx}" y="${legY - 20}" width="20" height="20" rx="5" fill="${r.c}"/>`;
    legend += `<text x="${cx + 30}" y="${legY - 3}" fill="#e2e8f0" font-size="26" font-weight="700" font-family="sans-serif">${r.label}</text>`;
    legend += `<text x="${cx + 30}" y="${legY + 30}" fill="${r.c}" font-size="34" font-weight="800" font-family="sans-serif">${r.n.toLocaleString()}</text>`;
    legend += `<text x="${cx + 30}" y="${legY + 58}" fill="#64748b" font-size="20" font-family="sans-serif">${r.sub} · ${Math.round((r.n / total) * 100)}%</text>`;
  });

  const totText = total >= 1000 ? "~" + fK(total) : String(total);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="mcV" cx="50%" cy="-5%" r="95%"><stop offset="0%" stop-color="#14f195" stop-opacity="0.10"/><stop offset="55%" stop-color="#14f195" stop-opacity="0"/></radialGradient>
 <radialGradient id="mcV2" cx="8%" cy="10%" r="60%"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.14"/><stop offset="70%" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
 <linearGradient id="mcTot" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8b9dfa"/><stop offset="50%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#14f195"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#mcV)"/>
<rect width="${W}" height="${H}" fill="url(#mcV2)"/>
<text x="${mL}" y="72" fill="#e2e8f0" font-size="31" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDERS ACROSS CHAINS</text>
<text x="${mL}" y="110" fill="#94a3b8" font-size="23" font-family="sans-serif">Ethereum, Base &amp; Solana wallets combined — the full community, not just the native chain.</text>
<text x="${mL}" y="248" fill="url(#mcTot)" font-size="150" font-weight="800" font-family="sans-serif" letter-spacing="-2">${totText}</text>
<text x="${mL}" y="300" fill="#cbd5e1" font-size="27" font-family="sans-serif">holders across 3 chains · <tspan fill="#14f195" font-weight="700">${mult.toFixed(1)}× the ~${fK(counts.eth)} on Ethereum alone</tspan></text>
${seg}
${legend}
<text x="${mL}" y="${H - 20}" fill="#475569" font-size="16" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · wallets across chains, not people · Base &amp; Solana are bridged</text>
</svg>`;
}

export function renderMultichainCard(stats, opts = {}) {
  const svg = multichainSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
