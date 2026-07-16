// "Wallet Growth" card — multi-chain holder headcount over time (ETH + Base + Solana),
// stacked to show the total climbing from ~1,400 at launch to ~230k across three chains.
// Headcount is legitimately multi-chain (holders ≠ value — Base/Solana dominate wallets,
// ETH dominates value). The story: adoption kept compounding through the whole cycle.
// Data: stats.chainWallets. Brand colours: ETH grey, Base blue, Solana purple.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fK = n => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n);
// bottom → top of the stack
const CH = [
  { key: "eth", label: "Ethereum", c: "#98a2b7" },
  { key: "base", label: "Base", c: "#3b82f6" },
  { key: "sol", label: "Solana", c: "#9945ff" },
];

export function walletGrowthSvg(stats, opts = {}) {
  const raw = (stats.chainWallets || []).map(r => ({ ts: Date.parse(r.d), eth: r.eth || 0, base: r.base || 0, sol: r.sol || 0 }))
    .filter(r => Number.isFinite(r.ts));
  if (raw.length < 50) return null;
  raw.sort((a, b) => a.ts - b.ts);
  const cur = raw.at(-1), total = cur.eth + cur.base + cur.sol, first = raw[0];
  const startTotal = first.eth + first.base + first.sol;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 182, mT = 128, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yMax = Math.ceil((total * 1.06) / 25000) * 25000; // headroom, round to 25k
  const y = v => mT + (1 - v / yMax) * pH;
  const stackTop = (r, i) => { let s = 0; for (let k = 0; k <= i; k++) s += r[CH[k].key]; return s; };

  let ribbons = "";
  for (let i = 0; i < CH.length; i++) {
    const top = raw.map(r => `${x(r.ts).toFixed(1)},${y(stackTop(r, i)).toFixed(1)}`);
    const bot = raw.map(r => `${x(r.ts).toFixed(1)},${y(i === 0 ? 0 : stackTop(r, i - 1)).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${CH[i].c}" fill-opacity="0.85" stroke="#05050e" stroke-width="0.6"/>`;
  }

  let grid = "";
  for (let v = 0; v <= yMax; v += yMax / 4) {
    grid += `<line x1="${mL}" y1="${y(v).toFixed(1)}" x2="${W - mR}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(y(v) + 7).toFixed(1)}" fill="#a3aec0" font-size="22" text-anchor="end" font-family="sans-serif">${fK(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  // right-edge legend: current per-chain count at its band mid-height
  let legend = "";
  for (let i = CH.length - 1; i >= 0; i--) {
    const mid = (i === 0 ? 0 : stackTop(cur, i - 1)) + cur[CH[i].key] / 2;
    const yy = Math.max(mT + 12, Math.min(mT + pH - 6, y(mid)));
    legend += `<rect x="${W - mR + 14}" y="${(yy - 9).toFixed(1)}" width="14" height="14" rx="3" fill="${CH[i].c}"/>`
      + `<text x="${W - mR + 34}" y="${(yy + 3).toFixed(1)}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${esc(CH[i].label + " " + fK(cur[CH[i].key]))}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wgbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wgbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — WALLET GROWTH</text>
<text x="60" y="102" fill="#4ade80" font-size="28" font-weight="800" font-family="sans-serif">${total.toLocaleString("en-US")} wallets across 3 chains — from ${startTotal.toLocaleString("en-US")} at launch</text>
${grid}${ribbons}${xlab}${legend}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · wallets holding SPX on Ethereum, Base & Solana · wallets, not people")}</text>
</svg>`;
}

export function renderWalletGrowthCard(stats, opts = {}) {
  const svg = walletGrowthSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
