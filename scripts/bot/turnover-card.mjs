// SUPPLY TURNOVER card — a HODL-waves-style STACKED AREA of SPX6900's held supply split by how recently
// each coin last moved, bottom (just traded, hot) → top (dormant, cool), on a FLUO ramp for maximum
// punch on X. The tweet twin of the site's Supply Turnover chart; mirror of HODL waves read as velocity.
// Uses the finer 7-band split once every row carries ageFine, else the coarse 5-band age. From stats.onchain.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { turnoverOf, turnoverStack } from "../../src/turnover.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// FLUO ramps, warm (just moved) → cool (dormant). Independent of the site's calmer palette — the card
// wants max contrast on a black feed. 5 for the coarse age bands, 7 once the sub-week buckets land.
const FLUO_5 = ["#ff2d55", "#ff9500", "#ffe600", "#00e5ff", "#b14dff"];
const FLUO_7 = ["#ff0055", "#ff2d95", "#ff9d00", "#ffe600", "#39ff14", "#00e5ff", "#b14dff"];
const LABEL_5 = ["< 1 month", "1–3 months", "3–6 months", "6–12 months", "1 year+"];
const LABEL_7 = ["< 1 day", "1–7 days", "1–4 weeks", "1–3 months", "3–6 months", "6–12 months", "1 year+"];

export function turnoverCardStats(stats) {
  const oc = (stats.onchain || []).filter(r => (Array.isArray(r.ageFine) && r.ageFine.length === 7) || (Array.isArray(r.age) && r.age.length === 5));
  if (oc.length < 20) return null;
  return turnoverOf(oc.at(-1));
}

// downsample a long series to ~maxN points for a clean, light SVG (always keep the last point)
function sample(arr, maxN = 170) {
  if (arr.length <= maxN) return arr;
  const step = Math.ceil(arr.length / maxN), out = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  if (out.at(-1) !== arr.at(-1)) out.push(arr.at(-1));
  return out;
}

export function turnoverCardSvg(stats, opts = {}) {
  const s = turnoverCardStats(stats);
  const stack = turnoverStack(stats.onchain);
  if (!s || !stack) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 60, mR = 58;
  const fluo = stack.fine ? FLUO_7 : FLUO_5;
  const labels = stack.fine ? LABEL_7 : LABEL_5;
  const data = sample(stack.data);
  const n = data.length;

  // plot geometry — yBot tracks H so the waves fill the card on ANY aspect (landscape 1200×630,
  // square 1080×1080, portrait …); the header stays pinned to the top, ticks/legend/footer to the bottom.
  const x0 = mL, x1 = W - mR, yTop = 150, yBot = H - 100, plotW = x1 - x0, plotH = yBot - yTop;
  const xAt = i => x0 + (n < 2 ? 0 : (i / (n - 1)) * plotW);
  const yAt = v => yBot - (Math.max(0, Math.min(100, v)) / 100) * plotH;

  // stacked polygons, bottom band first
  const cum = data.map(() => 0);
  let areas = "";
  stack.bands.forEach((b, k) => {
    const upper = data.map((d, i) => cum[i] + (d[b.key] || 0));
    let top = "", bot = "";
    for (let i = 0; i < n; i++) top += (i ? "L" : "M") + xAt(i).toFixed(1) + "," + yAt(upper[i]).toFixed(1);
    for (let i = n - 1; i >= 0; i--) bot += "L" + xAt(i).toFixed(1) + "," + yAt(cum[i]).toFixed(1);
    areas += `<path d="${top}${bot}Z" fill="${fluo[k]}" fill-opacity="0.95"/>`;
    for (let i = 0; i < n; i++) cum[i] = upper[i];
  });

  // year ticks along the bottom
  let ticks = "", lastYr = null;
  for (let i = 0; i < n; i++) {
    const yr = new Date(data[i].ts).getUTCFullYear();
    if (yr !== lastYr) { lastYr = yr; ticks += `<text x="${xAt(i).toFixed(1)}" y="${yBot + 26}" fill="#7c8aa0" font-size="17" font-family="sans-serif" text-anchor="middle">${yr}</text>`; }
  }
  // % gridline labels
  const grid = [0, 50, 100].map(v => `<line x1="${x0}" y1="${yAt(v).toFixed(1)}" x2="${x1}" y2="${yAt(v).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.08"/><text x="${x0 - 8}" y="${(yAt(v) + 5).toFixed(1)}" fill="#7c8aa0" font-size="16" font-family="sans-serif" text-anchor="end">${v}%</text>`).join("");

  // legend, warm → cool
  const legN = labels.length, legW = (x1 - x0) / legN;
  const legend = labels.map((lb, i) =>
    `<rect x="${(x0 + i * legW).toFixed(1)}" y="${yBot + 44}" width="13" height="13" rx="3" fill="${fluo[i]}"/>`
    + `<text x="${(x0 + i * legW + 19).toFixed(1)}" y="${yBot + 55}" fill="#c3cedd" font-size="15.5" font-family="sans-serif">${esc(lb)}</text>`
  ).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="tobg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#07070f"/><stop offset="100%" stop-color="#04040a"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#tobg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">HOW SPX6900 CHANGES HANDS</text>
<text x="60" y="98" fill="#39ff14" font-size="27" font-weight="800" font-family="sans-serif">~${Math.round(s.m1)}% moves in a month · ${Math.round(s.dormant)}% dormant a year+</text>
<text x="60" y="132" fill="#a5b4c8" font-size="20" font-family="sans-serif">${esc("Held supply by how recently it last moved — hot = just traded, cool = dormant. Held ≠ frozen.")}</text>
${grid}
${areas}
${ticks}
${legend}
<text x="${W - mR}" y="${H - 16}" fill="#8592a6" font-size="16" font-family="sans-serif" text-anchor="end">${esc("spx6900rainbow.xyz · ETH-native · reconstructed on-chain · reproducible")}</text>
</svg>`;
}

export function renderTurnoverCard(stats, opts = {}) {
  const svg = turnoverCardSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
