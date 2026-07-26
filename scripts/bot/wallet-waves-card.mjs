// SPX6900 — WALLET-SIZE WAVES. HODL waves cut by how much a wallet holds instead of
// how long it has held.
//
// The whale card answers "did the big wallets shed supply" with one threshold and one
// number: 86% to 65%. This answers the question that follows — where did it GO. The 1M+
// tier shed 24 points from launch (86% to 62%); 11 of them landed in 10k-100k wallets
// and 8 in 100k-1M, while everything under 1k took 0.7. Supply walked down the ladder,
// it did not scatter into dust.
//
// Absolute bands rather than a share of float, because "holds a million SPX" is a thing
// a person can picture, and it is how Bitcoin's own wallet-size waves are cut. The
// tradeoff is honest and worth stating: a band is a fixed number of coins while the coin
// price moved roughly a hundredfold, so a 1M+ wallet meant something very different in
// 2023 than it does now. These bands measure ownership of the SUPPLY, not wealth.
//
// Data: public/onchain.json → tiers[] (weekly, from the FIFO reconstruction).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";

// Small (fresh, warm) at the bottom → largest (cool) at the top, matching the HODL-waves
// convention where the band you want people to watch sits at the top of the stack.
const BANDS = [
  { k: "<1k", c: "#fb7185" },
  { k: "1k–10k", c: "#f59e0b" },
  { k: "10k–100k", c: "#84cc16" },
  { k: "100k–1M", c: "#22d3ee" },
  { k: "1M+", c: "#818cf8" },
];

export function walletWavesSvg(stats, opts = {}) {
  const rows = (stats?.onchain || [])
    .filter(r => Array.isArray(r?.tiers) && r.tiers.length === 5 && r.holders > 1000)
    .map(r => ({ t: Date.parse(r.d), v: r.tiers }))
    .filter(r => Number.isFinite(r.t));
  if (rows.length < 40) return null;

  const first = rows[0].v, cur = rows.at(-1).v;
  const W = opts.W ?? 1200, H = opts.H ?? 800;
  const mL = 96, mR = 196, mT = 196, mB = 88;
  const pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH;

  let grid = "";
  for (let v = 0; v <= 100; v += 25) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="${F}">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 42}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  // Stack bottom-up: cumulative tops per band, then each ribbon closes over the one below.
  const tops = rows.map(r => { const o = []; let a = 0; for (const v of r.v) { a += v; o.push(a); } return o; });
  let ribbons = "", legend = "", lastLegendY = null;
  for (let b = BANDS.length - 1; b >= 0; b--) {
    const upper = rows.map((r, i) => `${x(r.t).toFixed(1)},${y(tops[i][b]).toFixed(1)}`);
    const lower = rows.map((r, i) => `${x(r.t).toFixed(1)},${y(b === 0 ? 0 : tops[i][b - 1]).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${upper.concat(lower).join(" ")}" fill="${BANDS[b].c}" fill-opacity="0.88"/>`;
    // Legend at each band's right-edge midpoint, so it labels the ribbon it sits on.
    // Thin bands share almost the same midpoint, so their labels printed on top of each
    // other. Walk up from the bottom keeping a line-height between them.
    const mid = ((b === 0 ? 0 : tops.at(-1)[b - 1]) + tops.at(-1)[b]) / 2;
    let ly = Math.max(mT + 16, Math.min(mT + pH - 8, y(mid)));
    if (lastLegendY != null && lastLegendY - ly < 28) ly = lastLegendY - 28;
    lastLegendY = ly;
    legend += `<rect x="${mL + pW + 14}" y="${(ly - 9).toFixed(1)}" width="13" height="13" rx="3" fill="${BANDS[b].c}"/>`
      + `<text x="${mL + pW + 34}" y="${(ly + 2).toFixed(1)}" fill="#cbd5e1" font-size="20" font-family="${F}">${esc(BANDS[b].k)} ${cur[b].toFixed(0)}%</text>`;
  }

  const drop = first[4] - cur[4];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wwbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wwbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — WALLET-SIZE WAVES</text>
<text x="60" y="100" fill="#94a3b8" font-size="22" font-family="${F}">Who owns the supply, by how much they hold. HODL waves cut by size, not age.</text>
<text x="60" y="148" fill="#818cf8" font-size="34" font-weight="700" font-family="${F}">${esc(`Million-coin wallets hold ${cur[4].toFixed(0)}% — down ${drop.toFixed(0)} points`)}</text>
${ribbons}${grid}${xlab}${legend}
<text x="60" y="${H - 18}" fill="#5b6577" font-size="21" font-family="${F}">${esc("share of holder supply by wallet size in tokens · exchanges, LP, bridge and burn excluded")}</text>
</svg>`;
}

export function renderWalletWavesCard(stats, opts = {}) {
  const svg = walletWavesSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
