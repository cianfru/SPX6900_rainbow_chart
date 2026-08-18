// "Whale Returns by Size" — which whale SIZE band actually made money. Ten vertical bars, height =
// % of that band's wallets in lifetime profit (banked sells + current bag vs everything invested),
// with the typical multiple + wallet count under each. The honest, relatable read: bigger bags have
// better odds — mostly because becoming a whale required buying early and cheap (survivorship). Reads
// the precomputed public/cohort-roi.json (built daily off the timeline). See src/cohort-roi.js.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

let _cache;
export function cohortRoiStats() {
  if (_cache !== undefined) return _cache;
  try {
    const d = JSON.parse(readFileSync(new URL("../../public/cohort-roi.json", import.meta.url), "utf8"));
    const cohorts = (d.cohorts || []).filter(c => c.n > 0);
    if (cohorts.length < 3) return (_cache = null);
    const best = cohorts.reduce((a, b) => (b.pctProfit > a.pctProfit ? b : a), cohorts[0]);
    const worst = cohorts.reduce((a, b) => (b.pctProfit < a.pctProfit ? b : a), cohorts[0]);
    return (_cache = { ...d, cohorts, best, worst });
  } catch { return (_cache = null); }
}

const shade = pct => { const t = Math.max(0, Math.min(1, pct / 100)); return `rgb(${Math.round(30 + (34 - 30) * t)},${Math.round(70 + (197 - 70) * t)},${Math.round(50 + (94 - 50) * t)})`; };

export function cohortRoiSvg(s, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 70, mR = 60, mT = 190, mB = 92;
  const pW = W - mL - mR, pH = H - mT - mB;
  const C = s.cohorts, n = C.length;
  const slot = pW / n, bw = Math.min(slot * 0.62, 74);
  const maxPct = Math.max(50, ...C.map(c => c.pctProfit));

  let bars = "";
  C.forEach((c, i) => {
    const cx = mL + slot * i + slot / 2;
    const h = Math.max(4, (c.pctProfit / maxPct) * pH);
    const y = mT + pH - h;
    const isBest = c === s.best;
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${shade(c.pctProfit)}"${isBest ? ' stroke="#5eead4" stroke-width="2.5"' : ""}/>`
      + `<text x="${cx.toFixed(1)}" y="${(y - 12).toFixed(1)}" fill="#f1f5f9" font-size="24" font-weight="800" text-anchor="middle" font-family="sans-serif">${c.pctProfit.toFixed(0)}%</text>`
      + `<text x="${cx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#cbd5e1" font-size="20" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(c.label)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${(mT + pH + 54).toFixed(1)}" fill="${c.medMult >= 1 ? "#5eead4" : "#8595ab"}" font-size="17" font-weight="700" text-anchor="middle" font-family="sans-serif">${c.medMult}×</text>`;
  });

  const hero = `${s.best.label} whales ${s.best.pctProfit.toFixed(0)}% in profit · ${s.worst.label} only ${s.worst.pctProfit.toFixed(0)}%`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="crbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#crbg)"/>
${auraBg("#5eead4", W, H)}
${brandStripe(H)}
<text x="70" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">WHO ACTUALLY MADE MONEY</text>
<text x="70" y="102" fill="#22d3ee" font-size="30" font-weight="800" font-family="sans-serif">${esc(hero)}</text>
<text x="70" y="142" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`Share of each whale size band in lifetime profit · ${s.total.toLocaleString()} wallets ≥100k SPX · typical multiple below`)}</text>
${bars}
<text x="70" y="${H - 22}" fill="#8592a6" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · a scoreboard of survivors — becoming a whale meant buying early · avg-cost, ETH self-custody · not advice")}</text>
</svg>`;
}

export function renderCohortRoiCard(_stats, opts = {}) {
  const s = cohortRoiStats();
  return s ? png(cohortRoiSvg(s, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
