// "SPX6900 on exchanges: flow vs price" — the behavioural card. Weekly net flow to/from
// exchanges vs price. The honest twist: the biggest "inflows" were LISTING fills (a new
// exchange wallet going zero→millions in days), NOT traders depositing to sell. We strip
// those out (grey ticks mark the listing weeks) and plot only ORGANIC flow — and once the
// listings are removed, SPX has seen NET WITHDRAWAL off exchanges (self-custody / accumulation),
// the opposite of the naive "supply piling onto exchanges" read. Data: src/cex-flow.js (Dune).
// One cycle of data — a behaviour read, not a forecast.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { CEX_FLOW } from "../../src/cex-flow.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
// Prefer the CI-refreshed public/cex-flow.json (Dune baseline + daily snapshot-forward); fall back
// to the frozen bundle. [d, cexBal, lpBal, custBal, org, onb, price] — DAILY. A thin token's daily
// flow is pure noise, so we plot a 7-DAY ROLLING organic net (a clean daily pulse), listings stripped.
const ROLL = 7;
function cexDays() {
  try { const o = JSON.parse(readFileSync(new URL("../../public/cex-flow.json", import.meta.url), "utf8")); if (o?.days?.length) return o.days; } catch { /* fall back */ }
  return CEX_FLOW.days;
}
const ALL = cexDays().map(r => ({ t: Date.parse(r[0]), org: r[4], onb: r[5], p: r[6] }));
// 7-day rolling sums of organic + onboarding (each day = sum of the trailing week)
for (let i = 0; i < ALL.length; i++) {
  let ro = 0, rn = 0; for (let j = Math.max(0, i - ROLL + 1); j <= i; j++) { ro += ALL[j].org; rn += ALL[j].onb; }
  ALL[i].rOrg = ro; ALL[i].rOnb = rn;
}
// Crop to the exchange era — SPX had zero CEX balance until listings (~2024-10); before that
// there's no flow and the launch-era price (~$0.001) would blow out the log axis.
const START = Math.max(0, ALL.findIndex(r => r.onb !== 0 || r.org !== 0) - 7);
const WK = ALL.slice(START);
const ONB_MARK = 3e6; // a rolling week with >3M onboarding = a listing/distribution event

export function cexFlowStats() {
  const org = ALL.reduce((a, r) => a + r.org, 0);
  const onb = ALL.reduce((a, r) => a + r.onb, 0);
  // count distinct listing episodes (rolling onboarding crossing the mark, de-duped by gaps)
  let listings = 0, inEp = false;
  for (const r of WK) { const hot = r.rOnb > ONB_MARK; if (hot && !inEp) listings++; inEp = hot; }
  return { organicNet: org, onboarding: onb, listings };
}

export function cexFlowSvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 104, mR = 96;
  const pT = 168, pB = H - 100, pW = W - mL - mR;
  // two stacked panels sharing the x-axis: price (top) + flow bars (bottom)
  const gap = 30;
  const priceTop = pT, priceBot = pT + 0.40 * (pB - pT);
  const flowTop = priceBot + gap, flowBot = pB;
  const t0 = WK[0].t, t1 = WK.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  // Scale the flow panel to ~the 94th percentile of |rolling net|, NOT the max — a couple of
  // extreme listing-era spikes would otherwise flatten the whole oscillator into an empty strip.
  // The handful of bigger moves clip at the panel edge (yN clamps), still reading as "maxed out".
  const absR = WK.map(r => Math.abs(r.rOrg)).sort((a, b) => a - b);
  const orgMax = Math.max(1, (absR[Math.floor(absR.length * 0.94)] || 1) * 1.35);
  const y0 = (flowTop + flowBot) / 2, half = (flowBot - flowTop) / 2;
  const yN = v => y0 - (Math.max(-orgMax, Math.min(orgMax, v)) / orgMax) * half;

  // 7-day rolling organic net as a signed area: red above zero (deposits), green below (withdrawals).
  const pts = WK.map(r => `${x(r.t).toFixed(1)},${yN(r.rOrg).toFixed(1)}`).join(" ");
  const areaUp = `M ${x(WK[0].t).toFixed(1)},${y0.toFixed(1)} L ${pts} L ${x(WK.at(-1).t).toFixed(1)},${y0.toFixed(1)} Z`;
  let flow = `<defs>
<clipPath id="cfabove"><rect x="${mL}" y="${flowTop}" width="${pW}" height="${(y0 - flowTop).toFixed(1)}"/></clipPath>
<clipPath id="cfbelow"><rect x="${mL}" y="${y0.toFixed(1)}" width="${pW}" height="${(flowBot - y0).toFixed(1)}"/></clipPath></defs>
<path d="${areaUp}" fill="#fb7185" fill-opacity="0.5" clip-path="url(#cfabove)"/>
<path d="${areaUp}" fill="#4ade80" fill-opacity="0.5" clip-path="url(#cfbelow)"/>
<polyline points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="2.4" stroke-opacity="0.85" stroke-linejoin="round"/>`;

  // listing episodes: shade the date span where rolling onboarding is hot (grey), so viewers see
  // the big fills were listings (excluded from the organic line above).
  let marks = ""; let epStart = null;
  for (let i = 0; i <= WK.length; i++) {
    const hot = i < WK.length && WK[i].rOnb > ONB_MARK;
    if (hot && epStart == null) epStart = WK[i].t;
    if (!hot && epStart != null) { marks += `<rect x="${x(epStart).toFixed(1)}" y="${flowTop}" width="${Math.max(2, x(WK[i - 1].t) - x(epStart)).toFixed(1)}" height="${(flowBot - flowTop).toFixed(1)}" fill="#64748b" fill-opacity="0.16"/>`; epStart = null; }
  }
  const ps = WK.map(r => r.p).filter(Boolean); const pmin = Math.min(...ps), pmax = Math.max(...ps);
  const yP = v => { const lo = Math.log(pmin * 0.9), hi = Math.log(pmax * 1.1); return priceBot - ((Math.log(v) - lo) / (hi - lo)) * (priceBot - priceTop); };
  const pl = WK.filter(r => r.p).map(r => `${x(r.t).toFixed(1)},${yP(r.p).toFixed(1)}`).join(" ");

  // price panel axis (right) + flow panel axis (left, ± around zero)
  let ax = `<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`;
  for (const v of [orgMax * 0.66, -orgMax * 0.66]) ax += `<text x="${mL - 14}" y="${(yN(v) + 8).toFixed(1)}" fill="#cbd5e1" font-size="21" text-anchor="end" font-family="sans-serif" font-weight="600">${v >= 0 ? "+" : "−"}${Math.abs(v / 1e6).toFixed(0)}M</text>`;
  for (const pv of [0.05, 0.1, 0.2, 0.5, 1, 2, 3]) { if (pv < pmin * 0.9 || pv > pmax * 1.1) continue; ax += `<text x="${W - mR + 12}" y="${(yP(pv) + 7).toFixed(1)}" fill="#fbbf24" font-size="21" font-family="sans-serif" font-weight="700">$${pv}</text>`; }
  let xl = "";
  for (let yr = 2024; yr <= 2026; yr++) for (const mo of [1, 7]) { const t = Date.UTC(yr, mo - 1, 1); if (t < t0 || t > t1) continue; xl += `<line x1="${x(t).toFixed(1)}" y1="${priceTop}" x2="${x(t).toFixed(1)}" y2="${flowBot}" stroke="rgba(255,255,255,0.05)"/><text x="${x(t).toFixed(1)}" y="${(flowBot + 40).toFixed(1)}" fill="#94a3b8" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}-${String(mo).padStart(2, "0")}</text>`; }

  const sw = (cx, c) => `<rect x="${cx}" y="120" width="26" height="14" rx="3" fill="${c}"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="cfbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171f42"/><stop offset="52%" stop-color="#0c1122"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
<radialGradient id="cfacc" cx="18%" cy="4%" r="78%"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.10"/><stop offset="46%" stop-color="#4ade80" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#cfbg)"/><rect width="${W}" height="${H}" fill="url(#cfacc)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="0.5"><tspan fill="#4ade80">SPX6900</tspan><tspan fill="#f1f5f9"> ON EXCHANGES — FLOW vs PRICE</tspan></text>
<text x="60" y="98" font-size="20" font-family="sans-serif" fill="#94a3b8">7-day rolling net flow, one-time listing fills stripped out (grey bands = listing periods)</text>
${sw(60, "#fb7185")}<text x="94" y="132" fill="#fb7185" font-size="21" font-weight="700" font-family="sans-serif">deposits (sell-side)</text>
${sw(360, "#4ade80")}<text x="394" y="132" fill="#4ade80" font-size="21" font-weight="700" font-family="sans-serif">withdrawals (accumulation)</text>
${sw(742, "#64748b")}<text x="776" y="132" fill="#94a3b8" font-size="21" font-weight="700" font-family="sans-serif">listing</text>
<line x1="880" y1="127" x2="916" y2="127" stroke="#fbbf24" stroke-width="4"/><text x="924" y="132" fill="#fbbf24" font-size="21" font-weight="700" font-family="sans-serif">price</text>
${ax}${xl}${marks}${flow}<polyline points="${pl}" fill="none" stroke="#fbbf24" stroke-width="3.2"/>
<text x="60" y="${H - 22}" fill="#94a3b8" font-size="17" font-family="sans-serif" textLength="${W - 96}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · on-chain (Dune) · organic net = flow minus listing fills · known exchange addresses · one cycle of data — behaviour, not a forecast`)}</text>
</svg>`;
}

export function renderCexFlowCard(opts = {}) {
  return png(cexFlowSvg(opts), opts.W ?? 1200);
}
