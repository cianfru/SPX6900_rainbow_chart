// "Where the float came from" card — the SPX6900 supply held TODAY, grouped by the era each holder
// first bought. The honest companion to survivorship: the old wallets left, so the coins held now
// are mostly NOT launch bags — 74% was accumulated after the launch year, the biggest waves in the
// 2024 recovery and the 2025 run. Not a "bought the bottom" story (2025 buyers came in near the
// top); a "the float turned over" story, which is the true one.
//
// Data: stats.cohorts (public/cohort-survival.json — supplyNow + medPrice per arrival era).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return `#${[0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("")}`; };
const vintage = (i, n) => mix("#22d3ee", "#f6a23c", n <= 1 ? 0 : i / (n - 1));
const shortLab = l => l.replace("20", "'");
const fmtM = v => v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : (v / 1e3).toFixed(0) + "k";
const fmtP = p => p == null ? "" : p < 0.01 ? "$" + p.toFixed(4) : p < 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(2);

export function supplyEraSvg(stats, opts = {}) {
  const S = stats.cohorts;
  if (!S?.cohorts) return null;
  const cohorts = S.cohorts.filter(c => c.arrived > 0 && c.supplyNow > 0);
  const nC = cohorts.length;
  if (nC < 4) return null;
  const total = cohorts.reduce((s, c) => s + c.supplyNow, 0);
  // launch-era = the first two half-year cohorts (the launch year); the rest arrived later
  const launchSupply = cohorts.slice(0, 2).reduce((s, c) => s + c.supplyNow, 0);
  const launchPct = Math.round(100 * launchSupply / total);
  const afterPct = 100 - launchPct;

  const W = opts.W ?? 1200, H = opts.H ?? 675, mL = 88, mR = 40, mT = 244, mB = 118, pW = W - mL - mR, pH = H - mT - mB;
  const maxS = Math.max(...cohorts.map(c => c.supplyNow));
  const slot = pW / nC, bw = slot * 0.62;
  const F = FONT[0] || "sans-serif";

  let bars = "", grid = "";
  const yMax = Math.ceil(maxS / 1e6 / 25) * 25 * 1e6;      // round to 25M
  const y = v => mT + (1 - v / yMax) * pH;
  for (let v = 0; v <= yMax; v += yMax / 4) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="${F}">${fmtM(v)}</text>`;
  }
  cohorts.forEach((c, i) => {
    const cx = mL + slot * i + slot / 2, top = y(c.supplyNow), col = vintage(i, nC);
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(mT + pH - top).toFixed(1)}" rx="6" fill="${col}" fill-opacity="0.92"/>`
      // supply on top
      + `<text x="${cx.toFixed(1)}" y="${(top - 12).toFixed(1)}" fill="#f1f5f9" font-size="24" font-weight="700" text-anchor="middle" font-family="${F}">${fmtM(c.supplyNow)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${(top - 34).toFixed(1)}" fill="${col}" font-size="18" text-anchor="middle" font-family="${F}">${Math.round(100 * c.supplyNow / total)}%</text>`
      // era + price below
      + `<text x="${cx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#cbd5e1" font-size="21" text-anchor="middle" font-family="${F}">${esc(shortLab(c.label))}</text>`
      + `<text x="${cx.toFixed(1)}" y="${(mT + pH + 54).toFixed(1)}" fill="#64748b" font-size="18" text-anchor="middle" font-family="${F}">${esc(c.medPrice != null ? "~" + fmtP(c.medPrice) : "")}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sebg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — WHERE THE FLOAT CAME FROM</text>
<text x="60" y="100" fill="#94a3b8" font-size="22" font-family="${F}">The supply held today, grouped by the era each holder first bought — and the price back then.</text>
<text x="60" y="152" fill="#818cf8" font-size="33" font-weight="700" font-family="${F}">${esc(`Just ${launchPct}% of the coins held today are launch-era bags.`)}</text>
<text x="60" y="190" fill="#22d3ee" font-size="25" font-weight="700" font-family="${F}">${esc(`The other ${afterPct}% was accumulated across the cycle — the float turned over.`)}</text>
${grid}${bars}
<text x="60" y="${H - 20}" fill="#5b6577" font-size="20" font-family="${F}">${esc("coins held by current ≥5,000-SPX holders, by first-buy era · price = era median · self-custody · not a forecast")}</text>
</svg>`;
}

export function renderSupplyEraCard(stats, opts = {}) {
  const svg = supplyEraSvg(stats, opts);
  return svg ? png(svg, opts.width ?? 1200) : null;
}
