// "Base survivorship" — of every wallet that ever held ≥5k SPX on Base, how many are left, and when
// the rest walked. The mirror of the diamond-hands story: massive churn, a small iron core. Reads
// ETH_SOL_2026.baseSurv { holders, exited, survivalPct, exitTimeline:[[month,count]] }.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const TEAL = "#2dd4bf", ETHC = "#98a2b7", BASEC = "#3b82f6", RED = "#f87171";
const fN = n => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);

export function baseSurvData() { const d = ETH_SOL_2026?.baseSurv; return d?.exitTimeline?.length ? d : null; }

// `eth` (optional) = { everHeld, holdNow } from cohort-survival.json, so the card compares Base's
// survivorship against Ethereum's rather than showing a Base-only slice.
export function baseSurvSvg(s, eth, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 80, mR = 44, F = FONT[0] || "sans-serif";
  const baseEver = s.holders + s.exited, baseSurv = s.survivalPct;
  const ethEver = eth?.everHeld, ethNow = eth?.holdNow, ethSurv = ethEver ? (ethNow / ethEver) * 100 : null;

  // ── cross-chain survival comparison strip: the iron core on each chain we can measure ──
  const chains = [];
  if (ethSurv != null) chains.push({ label: "Ethereum", color: ETHC, pct: ethSurv, now: ethNow, ever: ethEver });
  chains.push({ label: "Base", color: BASEC, pct: baseSurv, now: s.holders, ever: baseEver });
  const cmpT = 178, cmpH = 96, barX = 250, barMaxW = W - mR - 96 - barX;
  let cmp = "";
  chains.forEach((c, i) => {
    const cy = cmpT + i * (cmpH / chains.length) + (cmpH / chains.length) / 2, bh = 26, by = cy - bh / 2;
    const w = Math.max(6, c.pct / 30 * barMaxW);   // scale survival % against a 30% ceiling so the small core reads
    cmp += `<text x="${mL}" y="${(cy + 7).toFixed(1)}" fill="#cbd5e1" font-size="21" font-weight="700" font-family="${F}">${c.label}</text>`
      + `<rect x="${barX}" y="${by.toFixed(1)}" width="${barMaxW}" height="${bh}" rx="6" fill="rgba(255,255,255,0.05)"/>`
      + `<rect x="${barX}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="${bh}" rx="6" fill="${TEAL}"/>`
      + `<text x="${(barX + w + 12).toFixed(1)}" y="${(cy + 7).toFixed(1)}" fill="#e6f7f2" font-size="20" font-weight="800" font-family="${F}">${c.pct.toFixed(0)}%</text>`
      + `<text x="${(barX + w + 74).toFixed(1)}" y="${(cy + 6).toFixed(1)}" fill="#7c8a9e" font-size="16" font-family="${F}">${fN(c.now)} of ${fN(c.ever)}</text>`;
  });

  // ── Base departure timeline (the detail: WHEN the ones who left, left) ──
  const mT = cmpT + cmpH + 46, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const tl = s.exitTimeline, maxC = Math.max(1, ...tl.map(t => t[1]));
  const bw = pW / tl.length, y = v => mT + pH * (1 - v / maxC);
  let bars = "", xlab = "";
  tl.forEach((t, i) => {
    const bx = mL + bw * i, h = pH * (t[1] / maxC);
    bars += `<rect x="${(bx + 1).toFixed(1)}" y="${y(t[1]).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${RED}" fill-opacity="0.9"/>`;
    if (t[0].endsWith("-01") || i === 0) xlab += `<text x="${bx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#94a3b8" font-size="18" text-anchor="middle" font-family="${F}">${t[0].slice(0, 4)}</text>`;
  });
  let grid = "";
  for (let g = 0; g <= maxC; g += Math.max(10, Math.ceil(maxC / 4 / 10) * 10)) { const yy = y(g).toFixed(1); grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/><text x="${mL - 10}" y="${(+yy + 6).toFixed(1)}" fill="#94a3b8" font-size="18" text-anchor="end" font-family="${F}">${g}</text>`; }

  const headline = ethSurv != null
    ? `~1 in 5 ever-holders are still here — ${ethSurv.toFixed(0)}% on Ethereum, ${baseSurv.toFixed(0)}% on Base`
    : `${baseSurv.toFixed(0)}% of ever-5k Base wallets held on — ${(100 - baseSurv).toFixed(0)}% left`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bsbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bsbg)"/>
${auraBg("#2dd4bf", W, H, { accent2: "#3b82f6" })}
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — WHO'S STILL HERE, BY CHAIN</text>
<text x="60" y="102" fill="#2dd4bf" font-size="25" font-weight="800" font-family="sans-serif">${esc(headline)}</text>
<text x="60" y="140" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc("share of every wallet that ever held 5k+ SPX still holding today — high churn, but the survivors held through it all")}</text>
${cmp}
<text x="${mL}" y="${mT - 12}" fill="#8ea3b8" font-size="17" font-family="sans-serif">Base — when the wallets that left the 5k+ tier walked, per month</text>
${grid}${bars}${xlab}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · survivorship, not capitulation · Solana wallet-survival not yet reconstructed")}</text>
</svg>`;
}
export function renderBaseSurvCard(stats, opts = {}) { const d = baseSurvData(); return d ? png(baseSurvSvg(d, stats?.cohorts?.overall, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null; }
