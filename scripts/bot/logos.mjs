// Shared logo "marks" for card headers + end-of-line tags. Embeds the coin images
// as base64 so cards render with no external dependency, and draws the few assets
// we have no image for (BTC symbol, ETH/SOL/S&P/USD badges). Extracted from
// charts.mjs so standalone card generators (cycle-card, etc.) reuse the SAME logos.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Resolved two ways so it bundles on Vercel too (next to this module, and under
// process.cwd() via vercel.json includeFiles) — same lesson as the bundled font.
const bundledB64 = name => {
  let here = "";
  try { here = dirname(fileURLToPath(import.meta.url)); } catch { /* bundled */ }
  for (const p of [here && join(here, name), join(process.cwd(), "scripts/bot", name)].filter(Boolean)) {
    try { return readFileSync(p).toString("base64"); } catch { /* next */ }
  }
  return null;
};
const SPX_ICON_B64 = bundledB64("spx-logo.png");
const USDC_B64 = bundledB64("usdc-logo.png");
const SPX500_B64 = bundledB64("spx500-logo.png");
const ETH_B64 = bundledB64("eth-logo.png");
const SOL_B64 = bundledB64("sol-logo.png");
// Memecoin coins (owner-provided): round logos with transparent frames, cropped
// to the centred coin. Keyed so the milestone cards can mark each king.
const COIN_IMG = { pepe: bundledB64("pepe-logo.png"), shib: bundledB64("shib-logo.png"), doge: bundledB64("doge-logo.png") };
// Official Bitcoin "₿" mark drawn as paths (white symbol on the orange coin), so
// it's properly centered — a text glyph sits off-centre and lacks the real logo's
// shape. Path is the Bitcoin brand symbol in a 24×24 box (minus the outer disc,
// which we draw as the circle below).
const BTC_SYMBOL = "M17.288 10.291c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.328-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.974.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.18-.24.45-.614.35.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.62c.744.18 3.137.524 2.75 2.07z";

// A logo "mark": the SPX coin (image), the Bitcoin symbol (paths), the memecoin
// coins (images), or a drawn coin/index badge for assets with no usable logo
// (ETH Ξ, SOL ◎, S&P, USD $). Drawn into an x,y,size box.
export function logoMark(kind, x, y, size) {
  const cx = x + size / 2, cy = y + size / 2, r = size / 2, fs = n => (size * n).toFixed(0);
  if (kind === "spx" && SPX_ICON_B64) return `<image href="data:image/png;base64,${SPX_ICON_B64}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
  if (kind === "btc") return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f7931a"/><path transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${(size / 24).toFixed(4)})" fill="#fff" d="${BTC_SYMBOL}"/>`;
  // Memecoin coins (PEPE/SHIB/DOGE): round logos cropped to the centred coin.
  if (COIN_IMG[kind]) return `<image href="data:image/png;base64,${COIN_IMG[kind]}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
  // USD = the real USDC coin logo (owner-provided image).
  if (kind === "usd" && USDC_B64) return `<image href="data:image/png;base64,${USDC_B64}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  // S&P 500 = owner-provided red "500" tile, clipped to a round coin.
  if (kind === "sp500" && SPX500_B64) {
    const id = `spc${Math.round(x)}_${Math.round(y)}`;
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><image href="data:image/png;base64,${SPX500_B64}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  }
  if (kind === "sp500") return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d61f26"/><text x="${cx}" y="${(cy + size * 0.13).toFixed(1)}" fill="#fff" font-size="${fs(0.34)}" font-weight="800" text-anchor="middle" font-family="sans-serif" letter-spacing="-1">500</text>`;
  // ETH = owner-provided round coin (already a disc, fills its square).
  if (kind === "eth" && ETH_B64) return `<image href="data:image/png;base64,${ETH_B64}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  // SOL = owner-provided black-disc logo on a wide frame: crop to the centred coin
  // and add a faint ring so the dark disc reads against the dark card.
  if (kind === "sol" && SOL_B64) {
    const id = `solc${Math.round(x)}_${Math.round(y)}`;
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><image href="data:image/png;base64,${SOL_B64}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/><circle cx="${cx}" cy="${cy}" r="${(r - 0.5).toFixed(1)}" fill="none" stroke="rgba(148,163,184,0.45)" stroke-width="${(size * 0.025).toFixed(1)}"/>`;
  }
  const coin = (fill, glyph, gs = 0.66, rot = 0) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/><text x="${cx}" y="${(cy + size * 0.34).toFixed(1)}" fill="#fff" font-size="${fs(gs)}" font-weight="800" text-anchor="middle" font-family="sans-serif"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ""}>${glyph}</text>`;
  if (kind === "eth") return coin("#627eea", "Ξ", 0.6);
  if (kind === "sol") return coin("#9945ff", "◎", 0.6);
  return coin("#475569", "?");
}
