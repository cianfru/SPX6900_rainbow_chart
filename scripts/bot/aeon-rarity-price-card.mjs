// PROJECT AEON — "does rarity price this collection?" card.
//
// The answer is mostly no, and that is the point of the card. Fitted across 17,040
// realized sales with the market trend divided out, a token's rarity rank explains
// about 5% of what it sold for (r² = 0.054). The rarest piece did set the record, but
// below the very top rank and price come apart almost completely.
//
// Every NFT project sells rarity as value, so the honest version of this chart is the
// one nobody publishes. It prints the r² on the card rather than burying it, and draws
// the fitted line faintly — it is a real fit, it just does not explain much.
//
// Data: public/aeon-market.json → salesScatter (sampled realized sales), fairModel.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

const TIERS = [
  { name: "Legendary", max: 0.01, c: "#f59e0b" },
  { name: "Epic", max: 0.05, c: "#a855f7" },
  { name: "Rare", max: 0.15, c: "#3b82f6" },
  { name: "Uncommon", max: 0.40, c: "#22d3ee" },
  { name: "Common", max: 1.01, c: "#64748b" },
];
const tierOf = (rank, total) => TIERS.find(t => rank / total <= t.max) || TIERS.at(-1);

export function aeonRarityPriceSvg(market, opts = {}) {
  const pts = (market?.salesScatter || []).filter(s => s?.rank > 0 && s?.price > 0);
  const fm = market?.fairModel;
  if (pts.length < 60 || !fm) return null;
  const total = 3333;

  const W = opts.W ?? 1200, H = opts.H ?? 1200;
  const mL = 116, mR = 72, mT = 196, mB = 108;
  const pW = W - mL - mR, pH = H - mT - mB;

  // Rank on a log axis — statistical rarity is heavy-tailed, so a linear rank axis
  // crushes the whole Legendary/Epic end into the left edge. Price is log too: sales
  // run from about 0.05Ξ to 20Ξ.
  const rMin = 1, rMax = total;
  const prices = pts.map(s => s.price).sort((a, b) => a - b);
  const pMin = Math.max(0.02, prices[0] * 0.85), pMax = prices.at(-1) * 1.15;
  const x = r => mL + (Math.log(Math.max(r, rMin)) - Math.log(rMin)) / (Math.log(rMax) - Math.log(rMin)) * pW;
  const y = p => mT + (Math.log(pMax) - Math.log(Math.max(p, 1e-6))) / (Math.log(pMax) - Math.log(pMin)) * pH;

  let grid = "";
  for (const p of [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20].filter(v => v >= pMin && v <= pMax)) {
    const yy = y(p).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="${F}">${fEth(p)}</text>`;
  }
  let xlab = "";
  for (const r of [1, 10, 100, 1000, 3333]) {
    xlab += `<text x="${x(r).toFixed(1)}" y="${H - 60}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="${F}">${r === 1 ? "#1" : "#" + r.toLocaleString()}</text>`;
  }

  // The fitted rarity factor, drawn faint: it is a real fit that explains very little,
  // and drawing it boldly would claim more than the r² supports.
  const ranks = pts.map(s => s.rank).sort((a, b) => a - b);
  const fitLo = ranks[0], fitHi = ranks.at(-1);
  const fit = [];
  for (let i = 0; i <= 60; i++) {
    const r = Math.exp(Math.log(fitLo) + (Math.log(fitHi) - Math.log(fitLo)) * (i / 60));
    const v = fm.level * (fm.a * Math.pow(r / total, fm.b));
    if (v > 0) fit.push(`${x(r).toFixed(1)},${y(v).toFixed(1)}`);
  }

  const dots = pts.map(s => {
    const t = tierOf(s.rank, total);
    return `<circle cx="${x(s.rank).toFixed(1)}" cy="${y(s.price).toFixed(1)}" r="6" fill="${t.c}" fill-opacity="0.72"/>`;
  }).join("");

  const legend = TIERS.map((t, i) => {
    const lx = mL + 14 + i * 168, ly = mT + 32;
    return `<circle cx="${lx}" cy="${ly - 6}" r="7" fill="${t.c}"/>`
      + `<text x="${lx + 15}" y="${ly}" fill="#cbd5e1" font-size="20" font-family="${F}">${t.name}</text>`;
  }).join("");

  const pctExplained = Math.round(fm.r2 * 100);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("rp", ["#f59e0b", "#a855f7"])}</defs>
${aeonBgRects(W, H, "rp")}
${aeonHeader("PROJECT AEON — DOES RARITY SET THE PRICE?",
  `Every realized sale by rarity rank. Rarest on the left, priciest at the top.`,
  `Barely — rarity explains ${pctExplained}% of what a piece sells for`, "#fbbf24", F)}
${grid}${xlab}
<polyline points="${fit.join(" ")}" fill="none" stroke="#f8fafc" stroke-width="2.4" stroke-opacity="0.4" stroke-dasharray="7 7"/>
${dots}
${legend}
<text x="${mL + 14}" y="${mT + 66}" fill="#94a3b8" font-size="20" font-family="${F}">${esc(`dashed = the fitted rarity premium · r² ${fm.r2.toFixed(3)} across ${fm.n.toLocaleString()} sales`)}</text>
<text x="${x(60).toFixed(1)}" y="${mT + pH - 20}" fill="#7c8a9e" font-size="20" text-anchor="middle" font-family="${F}">the rare end barely trades</text>
<text x="60" y="${H - 22}" fill="#6b7688" font-size="19" font-family="${F}">${esc(`rarity rank (log) vs realized sale price (log) · market trend divided out · a sample of ${pts.length} sales is plotted`)}</text>
</svg>`;
}

export function renderAeonRarityPriceCard(market, opts = {}) {
  const svg = aeonRarityPriceSvg(market, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
