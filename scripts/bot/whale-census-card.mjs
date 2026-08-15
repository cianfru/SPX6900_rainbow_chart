// "The Whale Census" — the city's population, broken down by size cohort: how many wallets in each
// tier, how much they hold, how long they've held, and whether they're accumulating or distributing.
// The 2D companion to the 3D whale city / "Whales Watching". Answers "how many whales, who is what."
// Data: public/whales.json (per-wallet {a, bal, days, d7, d30}). A distribution POSITION, not a signal.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const TIERS = [[5e3, 25e3, "5–25k"], [25e3, 1e5, "25–100k"], [1e5, 25e4, "100–250k"], [25e4, 1e6, "250k–1M"], [1e6, 5e6, "1–5M"], [5e6, 1e12, "5M+"]];
// warm (small) → cyan (mega) so size reads as colour, like the city
const TIER_COL = ["#fb7185", "#fb923c", "#fbbf24", "#a3e635", "#34d399", "#22d3ee"];

export function whaleCensus(wallets) {
  return TIERS.map(([lo, hi, lbl], i) => {
    const t = wallets.filter(w => w.bal >= lo && w.bal < hi);
    const supply = t.reduce((s, w) => s + w.bal, 0);
    const ages = t.map(w => w.days).sort((a, b) => a - b);
    return { lbl, col: TIER_COL[i], n: t.length, supply,
      medAge: ages.length ? ages[Math.floor(ages.length / 2)] : 0,
      accum: t.filter(w => w.d30 > 0).length, distrib: t.filter(w => w.d30 < 0).length };
  });
}

function loadWhales() {
  try { return JSON.parse(readFileSync(new URL("../../public/whales.json", import.meta.url), "utf8")); } catch { return null; }
}

export function whaleCensusSvg(doc, opts = {}) {
  const rows = whaleCensus(doc.wallets);
  const totSup = rows.reduce((s, r) => s + r.supply, 0), totN = rows.reduce((s, r) => s + r.n, 0);
  const mega = rows.slice(-2).reduce((a, r) => ({ n: a.n + r.n, s: a.s + r.supply }), { n: 0, s: 0 });
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 150, mR = 260, mT = 176, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const maxS = Math.max(...rows.map(r => r.supply));
  const rowH = pH / rows.length, bh = rowH * 0.6;
  let bars = "";
  rows.forEach((r, i) => {
    const yy = mT + rowH * i + (rowH - bh) / 2, bw = (r.supply / maxS) * pW;
    bars += `<text x="${mL - 14}" y="${(yy + bh / 2 + 7).toFixed(1)}" fill="#e2e8f0" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">${esc(r.lbl)}</text>`
      + `<rect x="${mL}" y="${yy.toFixed(1)}" width="${Math.max(2, bw).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${r.col}"/>`
      + `<text x="${(mL + bw + 12).toFixed(1)}" y="${(yy + bh / 2 - 2).toFixed(1)}" fill="#f1f5f9" font-size="19" font-weight="800" font-family="sans-serif">${(r.supply / 1e6).toFixed(0)}M</text>`
      + `<text x="${(mL + bw + 12).toFixed(1)}" y="${(yy + bh / 2 + 18).toFixed(1)}" fill="#93a3b8" font-size="15" font-family="sans-serif">${r.n.toLocaleString()} wallets · ${Math.round(r.medAge / 30)}mo held</text>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wcbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wcbg)"/>
${auraBg("#2dd4bf", W, H)}
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — THE WHALE CENSUS</text>
<text x="60" y="100" fill="#22d3ee" font-size="31" font-weight="800" font-family="sans-serif">${mega.n} wallets hold ${(mega.s / 1e6).toFixed(0)}M — ${(mega.s / totSup * 100).toFixed(0)}% of whale supply</text>
<text x="60" y="140" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`${totN.toLocaleString()} wallets by size · supply concentrates in the few — and the biggest have held the longest`)}</text>
${bars}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ETH-native, self-custody · infra excluded · bar = SPX held by the tier")}</text>
</svg>`;
}

export function renderWhaleCensusCard(_stats, opts = {}) {
  const doc = loadWhales();
  return doc?.wallets?.length ? png(whaleCensusSvg(doc, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}

// Memoized census summary for the post copy (no Resvg import needed by posts.mjs).
let _cache;
export function whaleCensusStats() {
  if (_cache !== undefined) return _cache;
  const doc = loadWhales();
  if (!doc?.wallets?.length) return (_cache = null);
  const rows = whaleCensus(doc.wallets);
  const totSup = rows.reduce((s, r) => s + r.supply, 0), totN = rows.reduce((s, r) => s + r.n, 0);
  const mega = rows.slice(-2).reduce((a, r) => ({ n: a.n + r.n, s: a.s + r.supply }), { n: 0, s: 0 });
  return (_cache = { rows, totSup, totN, mega });
}
