// "Cost Basis vs Price" card — the card form of the bagsprofile site chart. A volume-profile:
// the SPX6900 price line over time on the right, and WHERE the held supply was bought as horizontal
// bars hugging the left price axis (the URPD cost-basis distribution, rotated so each bag lines up
// with its price level). Green = bought below spot (in profit), red = above (underwater). Spot is a
// dashed line across both. Data: stats.urpd (cost-basis buckets, FIFO per-lot) · stats.drawn (price
// history) · stats.price (live spot). A holder-cost POSITION, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GRN = "#34d399", RED = "#fb7185", LINE = "#aab6cc", SPOT = "#f8fafc";
const fp = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);

export function costBasisProfileSvg(stats, opts = {}) {
  const u = stats.urpd;
  if (!u || !Array.isArray(u.buckets) || u.buckets.length < 8) return null;
  const bkts = (u.bucketsFine?.length ? u.bucketsFine : u.buckets)
    .filter(b => b.hi > 0).map(b => ({ lo: b.lo, hi: b.hi, pct: b.pct, mid: Math.sqrt(b.lo * b.hi) }));
  const spot = Number.isFinite(stats.price) && stats.price > 0 ? stats.price : u.spot;
  bkts.forEach(b => { b.inP = b.mid < spot; });
  const inProfit = bkts.reduce((a, b) => a + (b.inP ? b.pct : 0), 0);
  let wall = bkts[0]; for (const b of bkts) if (b.pct > wall.pct) wall = b;

  const line = (stats.drawn || []).map(r => ({ t: Date.parse(r.date), p: +r.price }))
    .filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  const step = Math.max(1, Math.floor(line.length / 300));
  const lineD = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  if (lineD.length < 10) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 630, F = FONT[0] || "sans-serif";
  const mT = 132, mB = 62, mL = 98, mR = 40, pW = W - mL - mR, pH = H - mT - mB;
  const BW = pW * 0.28, GAP = 18, lineX0 = mL + BW + GAP, lineW = W - mR - lineX0;

  const dMin = Math.min(...bkts.map(b => b.lo), ...lineD.map(r => r.p), spot);
  const dMax = Math.max(...bkts.map(b => b.hi), ...lineD.map(r => r.p), spot);
  const yLo = Math.log(dMin * 0.95), yHi = Math.log(dMax * 1.05);
  const yOf = p => mT + pH * (1 - (Math.log(p) - yLo) / (yHi - yLo));
  const tMin = lineD[0].t, tMax = lineD.at(-1).t;
  const xOf = t => lineX0 + lineW * (tMax > tMin ? (t - tMin) / (tMax - tMin) : 1);
  const maxPct = Math.max(...bkts.map(b => b.pct), 1e-4);
  const barLen = pct => Math.max(pct > 0 ? 2 : 0, (pct / maxPct) * (BW - 4));

  // price gridlines + labels (left axis, shared by bars + line)
  let grid = "";
  for (const v of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3]) {
    if (v < dMin * 0.95 || v > dMax * 1.05) continue;
    const yy = yOf(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`
      + `<text x="${mL - 10}" y="${(+yy + 6).toFixed(1)}" fill="#8b98ad" font-size="20" text-anchor="end" font-family="${F}">${fp(v)}</text>`;
  }
  grid += `<line x1="${(lineX0 - GAP / 2).toFixed(1)}" y1="${mT}" x2="${(lineX0 - GAP / 2).toFixed(1)}" y2="${(mT + pH).toFixed(1)}" stroke="rgba(255,255,255,0.09)"/>`;

  // cost-basis bars (left, at each price level)
  let bars = "";
  for (const b of bkts) {
    const yTop = yOf(b.hi), yBot = yOf(b.lo), h = Math.max(1, yBot - yTop - 0.6), w = barLen(b.pct);
    if (w < 2) continue;
    bars += `<rect x="${mL}" y="${(yTop + 0.3).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${b.inP ? GRN : RED}" fill-opacity="0.86"/>`;
  }
  // price line (right)
  const path = lineD.map((r, i) => `${i ? "L" : "M"}${xOf(r.t).toFixed(1)} ${yOf(r.p).toFixed(1)}`).join(" ");
  // spot line + dot + label
  const sy = yOf(spot).toFixed(1);
  const spotEls = `<line x1="${mL}" y1="${sy}" x2="${W - mR}" y2="${sy}" stroke="${SPOT}" stroke-width="1.7" stroke-dasharray="6 5" stroke-opacity="0.85"/>`
    + `<circle cx="${xOf(tMax).toFixed(1)}" cy="${sy}" r="5.5" fill="${SPOT}"/>`
    + `<text x="${W - mR}" y="${(+sy - 10).toFixed(1)}" fill="${SPOT}" font-size="21" font-weight="700" text-anchor="end" font-family="${F}">spot ${fp(spot)}</text>`;
  // x time labels
  let xlab = "";
  for (let k = 0; k <= 4; k++) { const t = tMin + (tMax - tMin) * k / 4; const d = new Date(t); xlab += `<text x="${xOf(t).toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#8b98ad" font-size="18" text-anchor="middle" font-family="${F}">${d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</text>`; }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="cbpbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0f14"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#cbpbg)"/>
${auraBg("#34d399", W, H, { accent2: "#fb7185" })}
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — COST BASIS vs PRICE</text>
<text x="60" y="100" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif"><tspan fill="${GRN}">${inProfit.toFixed(0)}% of supply in profit</tspan> · heaviest bag bought around ${fp(wall.mid)}</text>
<text x="${mL}" y="${mT - 12}" fill="#8ea3b8" font-size="17" font-family="${F}">← where the held supply was bought · price line →</text>
${grid}${bars}<path d="${path}" fill="none" stroke="${LINE}" stroke-width="2.4" stroke-opacity="0.92"/>${spotEls}${xlab}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · bars = on-chain cost basis (FIFO) · green below spot / red above · log")}</text>
</svg>`;
}

export function renderCostBasisProfileCard(stats, opts = {}) {
  const svg = costBasisProfileSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
