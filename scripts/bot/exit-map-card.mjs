// "How holders left" card — the mirror of survivorship + cost-basis. Of the ~21k wallets that
// dropped below the 5,000-SPX bar, WHEN did they leave and did they leave in profit or at a loss?
// Two panels sharing a time axis: the real price curve on top (the "where / at what price" context)
// and, below, the count of departures per quarter split green (sold in profit) / red (sold at a loss).
// The honest, counterintuitive finding: the churn was overwhelmingly PROFIT-TAKING, not capitulation
// — 71% left green, and the loss-exits only cluster in the recent drawdown. NOT NUPL (that's the
// unrealized P/L of who's STILL here); this is the realized exit of who's GONE.
//
// Data: stats.cohorts.exits (public/cohort-survival.json — per-quarter profit/loss departure counts),
//       stats.drawn (price history) and stats.price (spot). Profit = exit price ≥ entry price, both
//       ≈ the price when the wallet crossed the 5k line (a proxy for realized P/L — stated on-card).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GRN = "#4ade80", RED = "#f43f5e";
const fmtP = p => p == null ? "" : p < 0.01 ? "$" + p.toFixed(4) : "$" + p.toFixed(2);
const fmtN = n => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);

export function exitMapSvg(stats, opts = {}) {
  const flow = stats.exitFlow;
  const ov = flow?.overall ?? stats.cohorts?.exits;
  if (!flow?.days?.length || !ov?.left) return null;
  const line = (stats.drawn || []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  if (line.length < 20) return null;
  const now = stats.price;

  const W = opts.W ?? 1200, H = opts.H ?? 675, mL = 90, mR = 58, F = FONT[0] || "sans-serif";
  // raw per-period departures — one stacked bar each (green profit / red loss); NO smoothing
  const daily = flow.res === "daily";
  const pts = flow.days.map(([d, pr, ls]) => ({ t: Date.parse(d), pr, ls })).filter(r => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);

  const t0 = line[0].t, t1 = Math.max(line.at(-1).t, pts.at(-1).t);
  const pW = W - mL - mR, x = t => mL + ((t - t0) / (t1 - t0)) * pW;

  const aT = 214, aH = 236, aB = aT + aH;                 // price panel
  const bT = aB + 52, bH = 150, bB = bT + bH;             // exits panel
  const pFloor = Math.min(...line.map(r => r.p));
  const pMin = Math.max(0.0005, pFloor * 0.85), pMax = Math.max(...line.map(r => r.p), now) * 1.15;
  const lg = v => Math.log(Math.max(v, pMin));
  const yP = v => aT + (1 - (lg(v) - lg(pMin)) / (lg(pMax) - lg(pMin))) * aH;
  const maxN = Math.max(...pts.map(r => r.pr + r.ls), 1);
  const yB = n => bB - (n / maxN) * bH;

  // price gridlines
  let grid = "";
  for (const v of [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2]) {
    if (v < pMin || v > pMax) continue;
    const yy = yP(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="19" text-anchor="end" font-family="${F}">$${v}</text>`;
  }
  // exit-count gridline (mid + top)
  for (const f of [0.5, 1]) {
    const yy = (bB - f * bH).toFixed(1), val = Math.round(f * maxN);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="18" text-anchor="end" font-family="${F}">${fmtN(val)}</text>`;
  }
  // year ticks
  let xlab = "";
  for (let yr = 2024; yr <= new Date(t1).getUTCFullYear(); yr++) {
    const tx = x(Date.UTC(yr, 0, 1)); if (tx < mL || tx > mL + pW) continue;
    grid += `<line x1="${tx.toFixed(1)}" y1="${aT}" x2="${tx.toFixed(1)}" y2="${aB}" stroke="rgba(255,255,255,0.05)"/>`;
    xlab += `<text x="${tx.toFixed(1)}" y="${(bB + 30).toFixed(1)}" fill="#64748b" font-size="19" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  // price line + now marker
  const path = line.map((r, i) => `${i ? "L" : "M"}${x(r.t).toFixed(1)} ${yP(r.p).toFixed(1)}`).join(" ");
  const yn = yP(now).toFixed(1);
  const priceEls = `<path d="${path}" fill="none" stroke="#aab6cc" stroke-width="2.2" stroke-opacity="0.92"/>`
    + `<line x1="${mL}" y1="${yn}" x2="${mL + pW}" y2="${yn}" stroke="#e2e8f0" stroke-width="1.4" stroke-dasharray="2 6" opacity="0.55"/>`
    + `<text x="${mL + pW + 6}" y="${(+yn + 5).toFixed(1)}" fill="#e2e8f0" font-size="18" font-family="${F}">${fmtP(now)}</text>`;

  // departure bars — one stacked bar per period: green (profit) from the baseline, red (loss) on top
  const bw = Math.max(daily ? 0.8 : 3, (pW / pts.length) * 0.84);
  let waves = "";
  for (const p of pts) {
    const cx = x(p.t), yProf = yB(p.pr), yTot = yB(p.pr + p.ls);
    waves += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${yProf.toFixed(1)}" width="${bw.toFixed(2)}" height="${(bB - yProf).toFixed(1)}" fill="${GRN}" fill-opacity="0.85"/>`;
    if (p.ls > 0) waves += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${yTot.toFixed(1)}" width="${bw.toFixed(2)}" height="${(yProf - yTot).toFixed(1)}" fill="${RED}" fill-opacity="0.88"/>`;
  }

  const panelLab = daily ? "wallets leaving each day" : "wallets leaving each week";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="exbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#exbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — HOW HOLDERS LEFT</text>
<text x="60" y="98" fill="#94a3b8" font-size="22" font-family="${F}">Every wallet that dropped below 5,000 SPX — when it left, and whether it sold green or red.</text>
<text x="60" y="150" fill="#4ade80" font-size="33" font-weight="700" font-family="${F}">${esc(`${ov.profitPct}% of the ${fmtN(ov.left)} wallets that left sold in profit.`)}</text>
<text x="60" y="188" fill="#f87171" font-size="24" font-weight="700" font-family="${F}">Profit-taking, not capitulation — red exits swell only in the drawdown.</text>
<text x="${mL}" y="${aT - 8}" fill="#8592a6" font-size="18" font-family="${F}">price</text>
<!-- legend, top-right of the exits panel -->
<rect x="${mL + pW - 156}" y="${bT + 8}" width="15" height="15" rx="3" fill="${GRN}" fill-opacity="0.85"/><text x="${mL + pW - 134}" y="${bT + 21}" fill="#94a3b8" font-size="19" font-family="${F}">left in profit</text>
<rect x="${mL + pW - 156}" y="${bT + 36}" width="15" height="15" rx="3" fill="${RED}" fill-opacity="0.85"/><text x="${mL + pW - 134}" y="${bT + 49}" fill="#94a3b8" font-size="19" font-family="${F}">left at a loss</text>
<text x="${mL}" y="${bT - 8}" fill="#8592a6" font-size="18" font-family="${F}">${panelLab}</text>
${grid}${priceEls}${waves}${xlab}
<text x="60" y="${H - 18}" fill="#5b6577" font-size="18" font-family="${F}">${esc("departures = wallets that fell below 5,000 SPX · profit/loss ≈ price when they crossed the bar · self-custody · not a forecast")}</text>
</svg>`;
}

export function renderExitMapCard(stats, opts = {}) {
  const svg = exitMapSvg(stats, opts);
  return svg ? png(svg, opts.width ?? 1200) : null;
}
