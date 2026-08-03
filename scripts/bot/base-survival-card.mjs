// "Base survivorship" — of every wallet that ever held ≥5k SPX on Base, how many are left, and when
// the rest walked. The mirror of the diamond-hands story: massive churn, a small iron core. Reads
// ETH_SOL_2026.baseSurv { holders, exited, survivalPct, exitTimeline:[[month,count]] }.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

export function baseSurvData() { const d = ETH_SOL_2026?.baseSurv; return d?.exitTimeline?.length ? d : null; }

export function baseSurvSvg(s, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 80, mR = 44, mT = 200, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const tl = s.exitTimeline, maxC = Math.max(1, ...tl.map(t => t[1]));
  const bw = pW / tl.length, y = v => mT + pH * (1 - v / maxC);
  let bars = "", xlab = "";
  tl.forEach((t, i) => {
    const bx = mL + bw * i, h = pH * (t[1] / maxC);
    bars += `<rect x="${(bx + 1).toFixed(1)}" y="${y(t[1]).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="#f87171"/>`;
    if (t[0].endsWith("-01") || i === 0) xlab += `<text x="${bx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#94a3b8" font-size="18" text-anchor="middle" font-family="sans-serif">${t[0].slice(0, 4)}</text>`;
  });
  let grid = "";
  for (let g = 0; g <= maxC; g += Math.max(10, Math.ceil(maxC / 4 / 10) * 10)) { const yy = y(g).toFixed(1); grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/><text x="${mL - 10}" y="${(+yy + 6).toFixed(1)}" fill="#94a3b8" font-size="18" text-anchor="end" font-family="sans-serif">${g}</text>`; }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bsbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bsbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 ON BASE — WHO'S STILL HERE</text>
<text x="60" y="104" fill="#f87171" font-size="31" font-weight="800" font-family="sans-serif">${(100 - s.survivalPct).toFixed(0)}% of ever-5k Base wallets left — ${s.survivalPct.toFixed(0)}% held on</text>
<text x="60" y="146" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`${s.exited.toLocaleString()} of ${(s.holders + s.exited).toLocaleString()} wallets that ever held 5k+ SPX on Base have since dropped below — the bars show when they left`)}</text>
<text x="${mL}" y="${mT - 12}" fill="#8ea3b8" font-size="17" font-family="sans-serif">wallets exiting the 5k+ tier per month</text>
${grid}${bars}${xlab}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · exit = an ever-≥5k wallet now below the bar · survivorship, not capitulation")}</text>
</svg>`;
}
export function renderBaseSurvCard(_stats, opts = {}) { const d = baseSurvData(); return d ? png(baseSurvSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
