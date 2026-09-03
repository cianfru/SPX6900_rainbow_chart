// "Supply age curve" — the line-chart form of illiquid supply (like the SPX-vs-BTC same-age lines).
// x = holding-age threshold, y = % of each chain's ≥5k supply held AT LEAST that long. Every chain
// starts at 100% and declines; Base stays stickiest, ETH has the longest tail (oldest chain). The
// 155-day LTH / illiquid line is marked. Reads ETH_SOL_2026.curve (% held ≥ i·binDays).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg, cardDepth} from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [{ key: "eth", label: "Ethereum", color: "#98a2b7" }, { key: "sol", label: "Solana", color: "#a78bfa" }, { key: "base", label: "Base", color: "#3b82f6" }];

export function supplyCurveData() { const d = ETH_SOL_2026; return d && CHAINS.every(c => d[c.key]?.curve?.length > 12) ? d : null; }

export function supplyCurveSvg(d, opts = {}) {
  const bin = d.curveDays || d.binDays || 30;
  const chains = CHAINS.map(c => ({ ...c, curve: d[c.key].curve, illiquid: d[c.key].illiquid }));
  const nP = Math.max(...chains.map(c => c.curve.length));
  const maxD = (nP - 1) * bin;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 56, mT = 190, mB = 108, pW = W - mL - mR, pH = H - mT - mB;
  const x = days => mL + (days / maxD) * pW, y = pct => mT + pH * (1 - pct / 100);

  let grid = "";
  for (let g = 0; g <= 100; g += 20) { const yy = y(g).toFixed(1); grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="sans-serif">${g}%</text>`; }
  let xlab = "";
  for (const [dys, l] of [[0, "0"], [180, "6m"], [365, "1y"], [548, "18m"], [730, "2y"], [913, "30m"], [1095, "3y"]]) { if (dys > maxD) continue; xlab += `<line x1="${x(dys).toFixed(1)}" y1="${mT}" x2="${x(dys).toFixed(1)}" y2="${(mT + pH).toFixed(1)}" stroke="rgba(255,255,255,0.05)"/><text x="${x(dys).toFixed(1)}" y="${(mT + pH + 32).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="sans-serif">${l}</text>`; }
  // 155-day LTH / illiquid marker
  const lx = x(155);
  const marker = `<line x1="${lx.toFixed(1)}" y1="${mT}" x2="${lx.toFixed(1)}" y2="${(mT + pH).toFixed(1)}" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="5 5" stroke-opacity="0.7"/><text x="${(lx + 6).toFixed(1)}" y="${(mT + 20).toFixed(1)}" fill="#22d3ee" font-size="16" font-family="sans-serif">155d · long-term</text>`;

  // Each curve ends at the chain's own tenure limit. A young chain (Base, Solana) has NO supply older
  // than the chain itself, so its curve legitimately hits 0 — but drawing the vertical drop to 0 and the
  // flat crawl along the baseline reads as "broken". Trim each line at its last meaningful point (≥0.5%)
  // and cap it with a small dot, so it terminates cleanly at its age rather than diving to zero.
  const lines = chains.map(c => {
    let end = c.curve.length - 1;
    while (end > 0 && c.curve[end] < 0.5) end--;
    const kept = c.curve.slice(0, end + 1);
    const pts = kept.map((v, i) => `${x(i * bin).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const ex = x(end * bin).toFixed(1), ey = y(kept[end]).toFixed(1);
    return `<polyline points="${pts}" fill="none" stroke="${c.color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<circle cx="${ex}" cy="${ey}" r="5" fill="${c.color}" stroke="#05050e" stroke-width="2"/>`;
  }).join("");
  let lgx = W - mR - 400; const legend = chains.map(c => { const s = `<rect x="${lgx}" y="${mT - 28}" width="15" height="15" rx="3" fill="${c.color}"/><text x="${lgx + 21}" y="${mT - 16}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${c.label}</text>`; lgx += 21 + c.label.length * 11 + 24; return s; }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="scbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#scbg)"/>
${auraBg("#3b82f6", W, H, { accent2: "#a78bfa" })}
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — SUPPLY BY HOLDING TENURE</text>
<text x="60" y="98" fill="#22d3ee" font-size="29" font-weight="800" font-family="sans-serif">90-97% of supply is in holders past the 155-day mark — Base longest</text>
<text x="60" y="130" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc("% of each chain's 5k+ supply in wallets that have held the tier at least this long · holding tenure, not dormancy")}</text>
${grid}${xlab}${marker}${lines}${legend}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · self-custody · infra excluded · tenure = time since first appearing")}</text>
</svg>`;
}
export function renderSupplyCurveCard(_stats, opts = {}) { const d = supplyCurveData(); return d ? png(supplyCurveSvg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
