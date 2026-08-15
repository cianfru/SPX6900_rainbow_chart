// PROJECT AEON — "who's buying, who's selling" tornado card.
// Net marketplace trades over the last 30 days: the biggest net buyers (green, right) and net
// sellers (red, left), around a centre axis. Same numbers as the AeonFlowChart site page — both
// read the shared aeonFlow() so a card and its chart can never disagree.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader, AEON_MT } from "./aeon-card-bg.mjs";
import { aeonFlow } from "../../src/aeon-flow.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const GREEN = "#34d399", RED = "#fb7185";

// sales = aeon-sales.json (needs .trades), onchain = aeon-onchain.json (needs .holders, for exited flag)
export function renderAeonFlowCard(sales, onchain, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const trades = sales?.trades;
  if (!Array.isArray(trades) || trades.length < 6) return null;
  const flow = aeonFlow(trades, onchain?.holders, { days: 30, topN: 6 });
  const a0 = flow.accum[0], d0 = flow.distrib[0];
  if (!a0 && !d0) return null;

  // Accumulators on top (biggest first), distributors below (biggest seller at the bottom).
  const rows = [
    ...flow.accum,
    ...flow.distrib.slice().sort((x, y) => y.net - x.net),   // closest-to-zero first → biggest seller last
  ];
  const maxD = Math.max(1, ...rows.map(r => Math.abs(r.net))) + 0.6;

  const cx = 580, halfW = 330;                 // centre axis + max bar reach
  const top = AEON_MT + 118, bottom = H - 150, rowH = (bottom - top) / rows.length;
  const X = net => cx + (net / maxD) * halfW;

  const axis = `<line x1="${cx}" y1="${top - 10}" x2="${cx}" y2="${bottom}" stroke="rgba(255,255,255,0.34)" stroke-width="2"/>` +
    `<text x="${cx + 10}" y="${top - 16}" fill="${GREEN}" font-size="17" font-weight="700" font-family="${F}">BUYING →</text>` +
    `<text x="${cx - 10}" y="${top - 16}" fill="${RED}" font-size="17" font-weight="700" font-family="${F}" text-anchor="end">← SELLING</text>`;

  const bars = rows.map((r, i) => {
    const cyTop = top + i * rowH + 6, barH = rowH - 12, cyMid = top + i * rowH + rowH * 0.5 + 6;
    const xEnd = X(r.net), x = Math.min(cx, xEnd), w = Math.abs(xEnd - cx);
    const col = r.net > 0 ? GREEN : RED;
    const rect = `<rect x="${x.toFixed(1)}" y="${cyTop.toFixed(1)}" width="${Math.max(2, w).toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${col}" fill-opacity="${r.exited ? 0.4 : 0.92}"${r.exited ? ` stroke="${RED}" stroke-width="2" stroke-dasharray="5 4"` : ""}/>`;
    const label = `<text x="44" y="${cyMid}" fill="#cbd5e1" font-size="18" font-family="${F}">${r.exited ? "⊗ " : ""}${esc(short(r.a))}</text>`;
    const val = r.net > 0
      ? `<text x="${(xEnd + 12).toFixed(1)}" y="${cyMid}" fill="#f4f7fc" font-size="19" font-weight="700" font-family="${F}">+${r.net}</text>`
      : `<text x="${(xEnd - 12).toFixed(1)}" y="${cyMid}" fill="#f4f7fc" font-size="19" font-weight="700" font-family="${F}" text-anchor="end">${r.net}</text>`;
    return label + rect + val;
  }).join("");

  const heroTxt = a0
    ? `Top buyer +${a0.net} AEON${a0.usdIn ? " · $" + Math.round(a0.usdIn).toLocaleString("en-US") : ""}`
    : `Top seller ${d0.net} AEON`;
  const foot = `net buys − sells · marketplace only · ⊗ = sold to zero & left · reproducible from the public sale log`;

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("afl", [GREEN, "#7c3aed"])}</defs>
${aeonBgRects(W, H, "afl")}
${aeonHeader("PROJECT AEON — BUYING vs SELLING", "Net marketplace trades · last 30 days · who's stacking, who's leaving", heroTxt, GREEN, F)}
${axis}
${bars}
<text x="60" y="${H - 28}" fill="#6b7688" font-size="18" font-family="${F}">${esc(foot)}</text></svg>`;
  return png(svg, W);
}
