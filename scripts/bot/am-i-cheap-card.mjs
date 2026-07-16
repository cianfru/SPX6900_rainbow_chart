// "Am I Cheap?" convergence dashboard — the capstone. Reads N independent valuation
// lenses (rainbow band, MVRV cost basis, supply-in-profit, Pi Cycle trend, alt-market
// over/under, Fear & Greed) and shows how many agree SPX is cheap right now. The
// CORROBORATION is the point: one metric can mislead, several aligning is stronger AND
// honest. Each lens is a plain-word chip + a 1–10 cheapness meter (10 squares filled by
// score). A valuation-POSITION read (where we sit), NEVER a buy signal or "bottom is in".
import { Resvg } from "@resvg/resvg-js";
import { lenses, grade } from "./valuation-lenses.mjs";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const COL = { cheap: "#4ade80", neutral: "#fbbf24", rich: "#f87171" };

export function amICheapSvg(stats, opts = {}) {
  const g = lenses(stats);
  if (g.length < 4) return null; // need a meaningful panel
  const cheap = g.filter(x => x.state === "cheap").length;
  const gr = grade(g);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 60, mR = 60;

  // ── GENERAL SIGNAL: the aggregate gauge (Cheap ↔ Expensive) ──
  const bX = 110, bW = W - 2 * bX, bY = 214, bH = 40, mk = bX + gr.pos * bW;
  const gauge =
    `<text x="${W / 2}" y="140" fill="${gr.color}" font-size="66" font-weight="800" text-anchor="middle" font-family="sans-serif" letter-spacing="1">${esc(gr.label.toUpperCase())}</text>`
    + `<text x="${W / 2}" y="182" fill="#94a3b8" font-size="23" text-anchor="middle" font-family="sans-serif">${cheap} of ${g.length} lenses agree · cheapness ${gr.avg.toFixed(1)}/10</text>`
    + `<rect x="${bX}" y="${bY}" width="${bW}" height="${bH}" rx="20" fill="url(#acgauge)" fill-opacity="0.92"/>`
    + `<text x="${bX}" y="${bY + bH + 26}" fill="#f87171" font-size="20" font-weight="700" font-family="sans-serif">Expensive</text>`
    + `<text x="${bX + bW}" y="${bY + bH + 26}" fill="#4ade80" font-size="20" font-weight="700" text-anchor="end" font-family="sans-serif">Cheap</text>`
    + `<polygon points="${(mk - 15).toFixed(1)},${bY - 15} ${(mk + 15).toFixed(1)},${bY - 15} ${mk.toFixed(1)},${bY + 5}" fill="#f8fafc"/>`
    + `<circle cx="${mk.toFixed(1)}" cy="${bY + bH / 2}" r="14" fill="#f8fafc" stroke="#05050e" stroke-width="3"/>`;

  // ── the six lenses as the evidence: name + phrase + a 10-square cheapness meter ──
  const rowsTop = 302, rowsBot = H - 66, rowH = (rowsBot - rowsTop) / g.length, rowGap = 8;
  const SQ = 20, GAP = 5, STEP = SQ + GAP, N = 10, METER_W = N * STEP - GAP;
  const meterEndX = W - mR - 14, meterX = meterEndX - METER_W;
  let rows = "";
  g.forEach((x, i) => {
    const y = rowsTop + i * rowH, h = rowH - rowGap, c = COL[x.state], midY = y + h / 2;
    rows += `<rect x="${mL}" y="${y.toFixed(1)}" width="${W - mL - mR}" height="${h.toFixed(1)}" rx="10" fill="${c}" fill-opacity="0.08"/>`
      + `<rect x="${mL}" y="${y.toFixed(1)}" width="7" height="${h.toFixed(1)}" rx="3.5" fill="${c}"/>`
      + `<text x="${mL + 28}" y="${(midY + 8).toFixed(1)}" fill="#e2e8f0" font-size="25" font-weight="700" font-family="sans-serif">${esc(x.name)}</text>`
      + `<text x="${(meterX - 22).toFixed(1)}" y="${(midY + 7).toFixed(1)}" fill="${c}" font-size="19" font-weight="600" text-anchor="end" font-family="sans-serif">${esc(x.phrase)}</text>`;
    const sqY = midY - SQ / 2;
    for (let j = 0; j < N; j++) {
      const filled = j < x.score;
      rows += `<rect x="${(meterX + j * STEP).toFixed(1)}" y="${sqY.toFixed(1)}" width="${SQ}" height="${SQ}" rx="4" fill="${filled ? c : "#ffffff"}" fill-opacity="${filled ? 0.95 : 0.07}"${filled ? "" : ` stroke="${c}" stroke-opacity="0.25"`}/>`;
    }
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="acbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="acgauge" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f87171"/><stop offset="50%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#4ade80"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#acbg)"/>
<text x="60" y="58" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — AM I CHEAP?</text>
${gauge}${rows}
<text x="60" y="${H - 20}" fill="#6b7688" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · a valuation POSITION across lenses, not a timing call or a bottom")}</text>
</svg>`;
}

export function renderAmICheapCard(stats, opts = {}) {
  const svg = amICheapSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
