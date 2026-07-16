// "Am I Cheap?" convergence dashboard — the capstone. Reads N independent valuation
// lenses (rainbow band, MVRV cost basis, supply-in-profit, Pi Cycle trend, Fear &
// Greed) and shows how many agree SPX is cheap right now. The CORROBORATION is the
// point: one metric can mislead, several aligning is stronger AND honest. Each lens is
// a plain-word chip ("Fire Sale", "underwater", "deep accumulation", "fear"). It's a
// valuation-POSITION read (where we sit), NEVER a buy signal or "bottom is in" call.
import { Resvg } from "@resvg/resvg-js";
import { lenses } from "./valuation-lenses.mjs";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const COL = { cheap: "#4ade80", neutral: "#fbbf24", rich: "#f87171" };

export function amICheapSvg(stats, opts = {}) {
  const g = lenses(stats);
  if (g.length < 4) return null; // need a meaningful panel
  const cheap = g.filter(x => x.state === "cheap").length;
  const rich = g.filter(x => x.state === "rich").length;
  const verdict = cheap > rich && cheap >= g.length / 2 ? "cheap" : rich > cheap ? "rich" : "neutral";
  const vCol = COL[verdict];
  const vWord = verdict === "cheap" ? "CHEAP" : verdict === "rich" ? "RICH" : "MIXED";

  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const rowsTop = 196, rowsBot = H - 74, rowH = (rowsBot - rowsTop) / g.length, mL = 60, mR = 60, rowGap = 10;

  let rows = "";
  g.forEach((x, i) => {
    const y = rowsTop + i * rowH, h = rowH - rowGap, c = COL[x.state], midY = y + h / 2;
    rows += `<rect x="${mL}" y="${y.toFixed(1)}" width="${W - mL - mR}" height="${h.toFixed(1)}" rx="12" fill="${c}" fill-opacity="0.08"/>`
      + `<rect x="${mL}" y="${y.toFixed(1)}" width="8" height="${h.toFixed(1)}" rx="4" fill="${c}"/>`
      + `<text x="${mL + 32}" y="${(midY + 11).toFixed(1)}" fill="#e2e8f0" font-size="32" font-weight="700" font-family="sans-serif">${esc(x.name)}</text>`
      + `<text x="${W - mR - 28}" y="${(midY + 11).toFixed(1)}" fill="${c}" font-size="31" font-weight="800" text-anchor="end" font-family="sans-serif">${esc(x.phrase)}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="acbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#acbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — AM I CHEAP?</text>
<text x="60" y="96" fill="#94a3b8" font-size="22" font-family="sans-serif">Where it sits across independent valuation lenses</text>
<text x="60" y="160" fill="${vCol}" font-size="40" font-weight="800" font-family="sans-serif">${cheap} of ${g.length} lenses say ${vWord}</text>
${rows}
<text x="60" y="${H - 22}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · a valuation POSITION across lenses, not a timing call or a bottom")}</text>
</svg>`;
}

export function renderAmICheapCard(stats, opts = {}) {
  const svg = amICheapSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
