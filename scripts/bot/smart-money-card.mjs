// "Smart Money" card — the live cohort of proven top-timers (ROI ≥5×, real capital in, still holding),
// aggregated. SPX held over time (gold) vs price (pale): they accumulated cheap and distributed into
// the run-up. NO wallet is ever named — pure aggregate, nothing to follow. Headline is flow-aware:
// it reads "sitting tight / trimming / accumulating" straight from the cohort's recent net-flow, so
// it tells the truth on the day (right now: holding, not buying).
// Data: stats.smartMoney (public/smart-money.json).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GOLD = "#f6a23c";
const fmtM = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M" : (v / 1e3).toFixed(0) + "k";
const usd = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + (v / 1e3).toFixed(0) + "k";
const fmtP = v => v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);

export function smartMoneySvg(stats, opts = {}) {
  const S = stats.smartMoney;
  if (!S?.weeks?.length || !S.cohortSize) return null;
  const rows = S.weeks.map(([d, held, , p]) => ({ t: Date.parse(d), held, p })).filter(r => Number.isFinite(r.t));
  if (rows.length < 20) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 675, mL = 92, mR = 92, mT = 200, mB = 70, pW = W - mL - mR, pH = H - mT - mB, F = FONT[0] || "sans-serif";
  const t0 = rows[0].t, t1 = rows.at(-1).t, x = t => mL + ((t - t0) / (t1 - t0)) * pW;
  const maxH = Math.max(...rows.map(r => r.held)), maxHM = Math.max(10, Math.ceil(maxH / 1e6 / 20) * 20);
  const yH = v => mT + (1 - v / (maxHM * 1e6)) * pH;
  const pFloor = Math.min(...rows.map(r => r.p));
  const pMin = Math.max(0.0015, pFloor * 0.85), pMax = Math.max(...rows.map(r => r.p)) * 1.15, lg = v => Math.log(Math.max(v, pMin));
  const yP = v => mT + (1 - (lg(v) - lg(pMin)) / (lg(pMax) - lg(pMin))) * pH;

  let grid = "";
  for (let v = 0; v <= maxHM; v += maxHM / 4) { const yy = yH(v * 1e6).toFixed(1); grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/><text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#e0a94b" font-size="20" text-anchor="end" font-family="${F}">${v}M</text>`; }
  for (const v of [0.01, 0.1, 1]) { if (v < pMin || v > pMax) continue; const yy = yP(v).toFixed(1); grid += `<text x="${mL + pW + 12}" y="${(+yy + 6).toFixed(1)}" fill="#8592a6" font-size="19" font-family="${F}">$${v}</text>`; }
  let xlab = "";
  for (let yr = 2024; yr <= new Date(t1).getUTCFullYear(); yr++) { const tx = x(Date.UTC(yr, 0, 1)); if (tx < mL || tx > mL + pW) continue; grid += `<line x1="${tx.toFixed(1)}" y1="${mT}" x2="${tx.toFixed(1)}" y2="${mT + pH}" stroke="rgba(255,255,255,0.05)"/>`; xlab += `<text x="${tx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="middle" font-family="${F}">${yr}</text>`; }

  const area = `${mL},${(mT + pH).toFixed(1)} ` + rows.map(r => `${x(r.t).toFixed(1)},${yH(r.held).toFixed(1)}`).join(" ") + ` ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const holdLine = rows.map(r => `${x(r.t).toFixed(1)},${yH(r.held).toFixed(1)}`).join(" ");
  const priceLine = rows.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${yP(r.p).toFixed(1)}`).join(" ");
  const pkX = x(Date.parse(S.peakDate)).toFixed(1), pkY = yH(S.peak).toFixed(1);

  // flow-aware second line
  const f = S.flow.w12;
  const verb = f > 2 ? "And they're accumulating again — net buyers this quarter." : f < -1 ? "Sitting tight: trimming slightly, not buying." : "Sitting tight: holding steady, not yet buying.";
  const verbColor = f > 2 ? "#4ade80" : "#94a3b8";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="smbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="smf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GOLD}" stop-opacity="0.55"/><stop offset="100%" stop-color="${GOLD}" stop-opacity="0.05"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#smbg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="39" font-weight="800" font-family="${F}" letter-spacing="0.5">SPX6900 — SMART MONEY</text>
<text x="60" y="98" fill="#94a3b8" font-size="21" font-family="${F}">SPX held by the proven top-timers (real capital in, sold 5×+, still holding), vs price.</text>
<text x="60" y="150" fill="${GOLD}" font-size="31" font-weight="700" font-family="${F}">${esc(`${S.cohortSize} wallets banked ${usd(S.realizedTotal)} at ${S.medianRoi}× — and still hold ${usd(S.heldUsd)}.`)}</text>
<text x="60" y="186" fill="${verbColor}" font-size="23" font-weight="700" font-family="${F}">${esc(verb)}</text>
<!-- legend, inside the plot's empty upper-right -->
<circle cx="${mL + pW - 210}" cy="${mT + 22}" r="8" fill="${GOLD}"/><text x="${mL + pW - 195}" y="${mT + 28}" fill="#94a3b8" font-size="19" font-family="${F}">smart-money SPX held</text>
<line x1="${mL + pW - 218}" y1="${mT + 50}" x2="${mL + pW - 202}" y2="${mT + 50}" stroke="#aab6cc" stroke-width="3"/><text x="${mL + pW - 195}" y="${mT + 56}" fill="#94a3b8" font-size="19" font-family="${F}">price</text>
${grid}
<polygon points="${area}" fill="url(#smf)"/>
<polyline points="${holdLine}" fill="none" stroke="${GOLD}" stroke-width="3"/>
<path d="${priceLine}" fill="none" stroke="#aab6cc" stroke-width="2.2" stroke-opacity="0.9"/>
<circle cx="${pkX}" cy="${pkY}" r="6" fill="${GOLD}" stroke="#05050e" stroke-width="2"/>
<text x="${pkX}" y="${(+pkY - 12).toFixed(1)}" fill="${GOLD}" font-size="19" font-weight="700" text-anchor="middle" font-family="${F}">peak ${fmtM(S.peak)} @ ${fmtP(S.peakPrice)}</text>
${xlab}
<text x="60" y="${H - 18}" fill="#5b6577" font-size="18" font-family="${F}">${esc(`${S.cohortSize} live wallets · invested ≥ $25k, realized ROI ≥ 5×, still hold ≥ 50k · recomputed daily · avg-cost proxy · not a signal`)}</text>
</svg>`;
}

export function renderSmartMoneyCard(stats, opts = {}) {
  const svg = smartMoneySvg(stats, opts);
  return svg ? png(svg, opts.width ?? 1200) : null;
}
