// "Holders across chains" reach card — SPX lives on Ethereum (native), Base and Solana
// (both bridged, e.g. Wormhole). By SUPPLY the bridged chains are only ~6%, but by
// HEADCOUNT they dwarf ETH: the community is several× the ~49.5k we usually post. This
// card tells that reach story — a big honest total (donut centre) + the per-chain split.
// Data-gated: needs the multi-chain snapshot columns (Base banks on the first cron;
// Solana once its key is set). Card writing stays MINIMAL — the tweet carries the copy.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fK = n => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));

const CHAINS = [
  { key: "eth", label: "Ethereum", sub: "native", c: "#8b9dfa" },
  { key: "base", label: "Base", sub: "bridged", c: "#3b82f6" },
  { key: "sol", label: "Solana", sub: "bridged", c: "#14f195" },
];

// Point on the donut circle at a given fraction of the way round (0 = 12 o'clock).
const pt = (cx, cy, r, frac) => {
  const a = frac * 2 * Math.PI - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

export function multichainSvg(stats, opts = {}) {
  const s = stats.supply;
  if (!s) return null;
  const counts = { eth: s.holders, base: s.holdersBase, sol: s.holdersSol };
  // Data-gate: need ETH + at least one bridged chain, else there's no cross-chain story.
  if (!(counts.eth > 0) || !(counts.base > 0 || counts.sol > 0)) return null;
  const rows = CHAINS.map(c => ({ ...c, n: counts[c.key] || 0 })).filter(r => r.n > 0);
  const total = rows.reduce((a, r) => a + r.n, 0);
  const mult = counts.eth ? total / counts.eth : 1;

  const W = opts.W ?? 1200, H = opts.H ?? 630;
  // Donut on the left, legend on the right.
  const cx = 360, cy = 348, rOut = 176, rIn = 104, rMid = (rOut + rIn) / 2, thick = rOut - rIn;

  // Donut arcs — one per chain, as thick stroked arc segments round the ring.
  let arcs = "", acc = 0;
  rows.forEach(r => {
    const f0 = acc / total, f1 = (acc + r.n) / total;
    const gap = 0.006; // small separation between slices
    const [x0, y0] = pt(cx, cy, rMid, f0 + gap);
    const [x1, y1] = pt(cx, cy, rMid, f1 - gap);
    const large = (f1 - f0) > 0.5 ? 1 : 0;
    arcs += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${rMid},${rMid} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${r.c}" stroke-width="${thick}" stroke-linecap="butt"/>`;
    acc += r.n;
  });

  const totText = total >= 1000 ? "~" + fK(total) : String(total);

  // Legend on the right — swatch, chain, big count, sub · %.
  const lx = 650, lyTop = 196, rowH = 118;
  let legend = "";
  rows.forEach((r, i) => {
    const y = lyTop + rowH * i;
    legend += `<rect x="${lx}" y="${y - 24}" width="26" height="26" rx="6" fill="${r.c}"/>`;
    legend += `<text x="${lx + 40}" y="${y - 2}" fill="#e2e8f0" font-size="30" font-weight="700" font-family="sans-serif">${r.label}</text>`;
    legend += `<text x="${W - 64}" y="${y - 2}" fill="#64748b" font-size="26" font-family="sans-serif" text-anchor="end">${r.sub} · ${Math.round((r.n / total) * 100)}%</text>`;
    legend += `<text x="${lx + 40}" y="${y + 46}" fill="${r.c}" font-size="48" font-weight="800" font-family="sans-serif">${r.n.toLocaleString()}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="mcV" cx="30%" cy="0%" r="90%"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.12"/><stop offset="60%" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
 <radialGradient id="mcV2" cx="95%" cy="100%" r="70%"><stop offset="0%" stop-color="#14f195" stop-opacity="0.10"/><stop offset="70%" stop-color="#14f195" stop-opacity="0"/></radialGradient>
 <linearGradient id="mcTot" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8b9dfa"/><stop offset="50%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#14f195"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#mcV)"/>
<rect width="${W}" height="${H}" fill="url(#mcV2)"/>
<text x="64" y="74" fill="#e2e8f0" font-size="33" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDERS ACROSS CHAINS</text>
${arcs}
<text x="${cx}" y="${cy - 6}" fill="url(#mcTot)" font-size="76" font-weight="800" font-family="sans-serif" text-anchor="middle" letter-spacing="-1">${totText}</text>
<text x="${cx}" y="${cy + 38}" fill="#94a3b8" font-size="26" font-family="sans-serif" text-anchor="middle">holders · ${mult.toFixed(1)}× ETH</text>
${legend}
<text x="64" y="${H - 22}" fill="#475569" font-size="17" font-family="sans-serif">spx6900rainbow.xyz · wallets across chains, not people · Base &amp; Solana are bridged</text>
</svg>`;
}

export function renderMultichainCard(stats, opts = {}) {
  const svg = multichainSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
