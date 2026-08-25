// "Whale Mosaic" — every wallet holding ≥100k SPX as ONE square, coloured by net flow: green for
// accumulating, red for distributing, dark neutral for flat. Sorted biggest-buyer → flat → biggest-
// seller, so the field reads as a gradient. Stripped to the one thing that matters — who is moving,
// which way — across all three chains. Data: public/whales.json (ETH d30), base-onchain.json,
// solana-onchain.json (per-wallet flow). The rotation-card twin of the live Whales Watching mosaic.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const jsonW = f => { try { return JSON.parse(readFileSync(new URL(`../../public/${f}`, import.meta.url), "utf8")); } catch { return null; } };

// diverging colour: dark→bright green for buys, dark→bright red for sells, dark slate for flat.
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function flowColor(net, bal) {
  const dust = Math.max(1000, bal * 0.005);
  if (!net || Math.abs(net) < dust) return "#161d2e";
  const t = Math.max(0.24, Math.min(1, Math.abs(net) / (bal * 0.12 || 1)));
  return net > 0
    ? `rgb(${lerp(20, 34, t)},${lerp(83, 197, t)},${lerp(45, 94, t)})`     // #14532d → #22c55e
    : `rgb(${lerp(69, 239, t)},${lerp(10, 68, t)},${lerp(10, 68, t)})`;    // #450a0a → #ef4444
}

let _cache;
export function whaleMosaicStats() {
  if (_cache !== undefined) return _cache;
  const eth = jsonW("whales.json"), base = jsonW("base-onchain.json"), sol = jsonW("solana-onchain.json");
  const rows = [];
  // The address (a) is never drawn — the mosaic is squares by balance/flow — and ETH's whales.json is
  // now address-stripped (the data wall), so filter on balance only, not on `a`.
  for (const w of eth?.wallets || []) if (w && w.bal >= 1e5) rows.push({ chain: "eth", bal: w.bal, net: w.d30 || 0 });
  for (const w of base?.wallets || []) if (w && w.bal >= 1e5) rows.push({ chain: "base", bal: w.bal, net: w.flow || 0 });
  for (const w of sol?.wallets || []) if (w && w.bal >= 1e5) rows.push({ chain: "sol", bal: w.bal, net: w.flow || 0 });
  if (!rows.length) return (_cache = null);
  const dust = r => Math.max(1000, r.bal * 0.005);
  let buy = 0, sell = 0, flat = 0;
  for (const r of rows) { const d = dust(r); if (r.net > d) buy++; else if (r.net < -d) sell++; else flat++; }
  // The mosaic shows the wallets that MOVED, biggest buyer → biggest seller, so it reads as a clean
  // green→red gradient. Flat wallets (the quiet majority) are counted in the header, not drawn as a
  // grey block that swamps the colour. `movers` is the grid; `total`/buy/sell/flat feed the readout.
  const movers = rows.filter(r => Math.abs(r.net) >= dust(r)).sort((a, b) => b.net - a.net);
  return (_cache = { movers, buy, sell, flat, total: rows.length, updated: eth?.updated });
}

export function whaleMosaicSvg(stats, opts = {}) {
  const { movers, buy, sell, flat, total } = stats;
  const W = opts.W ?? 1200, H = opts.H ?? 1200;             // a mosaic reads best square
  const mX = 60, top = Math.round(H * 0.175), bottom = 62;
  const PW = W - mX * 2, PH = H - top - bottom;
  const n = Math.max(1, movers.length);
  // pack the movers into PW×PH: fewer movers → bigger squares (up to a cap so they don't get silly).
  let cell = Math.min(130, Math.max(14, Math.floor(Math.sqrt((PW * PH) / n))));
  let cols = Math.max(1, Math.floor(PW / cell)), rowsN = Math.ceil(n / cols);
  while (rowsN * cell > PH && cell > 8) { cell--; cols = Math.floor(PW / cell); rowsN = Math.ceil(n / cols); }
  const gap = Math.max(2, Math.round(cell * 0.16)), sq = cell - gap;
  const gridW = Math.min(cols, n) * cell - gap, gridH = rowsN * cell - gap;
  const ox = mX + (PW - gridW) / 2, oy = top + Math.max(0, (PH - gridH) / 2);
  const rx = Math.min(4, sq * 0.2).toFixed(1);

  let cells = "";
  movers.forEach((r, i) => {
    const x = ox + (i % cols) * cell, y = oy + Math.floor(i / cols) * cell;
    cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sq}" height="${sq}" rx="${rx}" fill="${flowColor(r.net, r.bal)}"/>`;
  });
  if (!movers.length) cells = `<text x="${W / 2}" y="${top + PH / 2}" fill="#5b6675" font-size="26" text-anchor="middle" font-family="sans-serif">no whale moved a coin in 30 days — all holding</text>`;

  const cW = W < 1100 ? 0.86 : 1;                            // scale header type down on the smaller square
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wmbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wmbg)"/>
${brandStripe(H)}
<text x="${mX}" y="${Math.round(66 * cW)}" fill="#f8fafc" font-size="${Math.round(33 * cW)}" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 · WHALE MOSAIC</text>
<text x="${mX}" y="${Math.round(120 * cW)}" fill="#f1f5f9" font-size="${Math.round(46 * cW)}" font-weight="800" font-family="sans-serif">${total.toLocaleString()} wallets hold &gt;100k SPX</text>
<text x="${mX}" y="${Math.round(166 * cW)}" fill="#22c55e" font-size="${Math.round(25 * cW)}" font-weight="800" font-family="sans-serif">${buy} accumulating</text>
<text x="${mX + Math.round(300 * cW)}" y="${Math.round(166 * cW)}" fill="#f43f5e" font-size="${Math.round(25 * cW)}" font-weight="800" font-family="sans-serif">${sell} selling</text>
<text x="${mX + Math.round(500 * cW)}" y="${Math.round(166 * cW)}" fill="#93a3b8" font-size="${Math.round(25 * cW)}" font-weight="800" font-family="sans-serif">${flat.toLocaleString()} flat</text>
${cells}
<text x="${mX}" y="${H - 24}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("each square is a whale that moved · green accumulating · red selling · the rest are holding · spx6900rainbow.xyz")}</text>
</svg>`;
}

export function renderWhaleMosaicCard(_stats, opts = {}) {
  const s = whaleMosaicStats();
  return s ? png(whaleMosaicSvg(s, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
