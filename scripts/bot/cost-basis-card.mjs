// "Cost Basis Distribution" card — holders' entry prices as a percentile rainbow over time, with
// price woven through. The rainbow's on-chain cousin: the bands are the REAL prices people paid
// (FIFO lot cost of currently-held supply), p50 the median, price above the top bands ≈ everyone in
// profit. Reuses the site's ladder math (src/cost-basis-ladder.js) so the card and the chart can't
// drift. Square 1:1 for the X feed. Data: public/urpd-history.json (daily).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";
import { buildLadder, shareInProfit, meanOf, LADDER_PCTS, ladderColor } from "../../src/cost-basis-ladder.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const usd = v => !(v > 0) ? "—" : v >= 1000 ? "$" + Math.round(v).toLocaleString() : v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(3) : "$" + v.toFixed(5);
const PCT_KEYS = LADDER_PCTS.map(p => "p" + p);
const COLORS = LADDER_PCTS.map((_, i) => ladderColor(i, LADDER_PCTS.length));

export function costBasisSvg(hist, opts = {}) {
  const field = opts.field === "cointime" ? "pctCoin" : "pct";
  const lad = buildLadder(hist, { field });
  if (!lad || lad.rows.length < 20) return null;
  const rows = lad.rows;
  // Progressive reveal for the time-lapse video: `upTo` (0..1) draws the chart only up to that point
  // in time; the AXES stay pinned to the full range so the frame doesn't rescale — the rainbow just
  // grows left→right. upTo omitted / 1 = the finished static card. `cur` is the revealed frontier, so
  // the hero, the value ladder and the "now" marker settle as the story builds.
  const t0 = rows[0].ts, t1 = rows.at(-1).ts;
  const frac = Math.min(1, Math.max(0.001, opts.upTo ?? opts.reveal ?? 1));
  const cutoff = t0 + frac * (t1 - t0);
  const vis = rows.filter(r => r.ts <= cutoff);
  if (vis.length < 1) vis.push(rows[0]);
  const cur = vis.at(-1);
  const wk = hist.weeks.find(w => w.d === new Date(cur.ts).toISOString().slice(0, 10)) || hist.weeks.at(-1);
  const prof = shareInProfit(hist.edges, wk[field] || wk.pct, cur.spot);
  const realized = meanOf(hist.edges, wk[field] || wk.pct); // mean cost basis = realized price (MVRV's number)

  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const mL = 128, mR = 196, mT = 232, mB = 104, pW = W - mL - mR, pH = H - mT - mB;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  // log price domain across every percentile + price
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) { for (const k of PCT_KEYS) { const v = r[k]; if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; } } if (r.spot > 0) { if (r.spot < lo) lo = r.spot; if (r.spot > hi) hi = r.spot; } }
  lo *= 0.9; hi *= 1.12;
  const lL = Math.log(lo), lH = Math.log(hi);
  const y = v => mT + (1 - (Math.log(Math.max(v, lo)) - lL) / ((lH - lL) || 1)) * pH;

  // y grid ($ ticks, 1·2·5 × 10^k)
  let grid = "";
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v < lo || v > hi) continue; const yy = y(v).toFixed(1);
      grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
        + `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#8592a6" font-size="21" text-anchor="end" font-family="sans-serif">${esc(usd(v))}</text>`; }
  // x years
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 64}" fill="#8592a6" font-size="21" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // percentile rainbow polylines + the price line — drawn over the REVEALED rows (vis) so the video
  // builds left→right; a full card just has vis === rows.
  const poly = (key, stroke, w, op = 1) => `<polyline points="${vis.map(r => r[key] > 0 ? `${x(r.ts).toFixed(1)},${y(r[key]).toFixed(1)}` : "").filter(Boolean).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const bands = PCT_KEYS.map((k, i) => poly(k, COLORS[i], 3.1)).join("");
  const priceLine = poly("spot", "#ffffff", 4.4);
  const nowY = y(cur.spot).toFixed(1);
  // frontier sweep line while the video is building (hidden on the finished card)
  const frontX = x(cur.ts).toFixed(1);
  const sweep = frac < 0.999
    ? `<line x1="${frontX}" y1="${mT}" x2="${frontX}" y2="${mT + pH}" stroke="#ffffff" stroke-width="2" stroke-opacity="0.5"/><circle cx="${frontX}" cy="${nowY}" r="9" fill="#ffffff"/>`
    : "";

  // right-edge value ladder — evenly spaced coloured pills, p95 (top) → p20 (bottom), like the reference
  const px = mL + pW + 18, pwid = mR - 34, ph = 34, gap = (pH - LADDER_PCTS.length * ph) / (LADDER_PCTS.length - 1);
  const pills = LADDER_PCTS.map((p, i) => {
    const py = mT + i * (ph + gap);
    return `<rect x="${px}" y="${py.toFixed(1)}" width="${pwid}" height="${ph}" rx="6" fill="${COLORS[i]}"/>`
      + `<text x="${(px + pwid / 2).toFixed(1)}" y="${(py + 24).toFixed(1)}" fill="#0a0b12" font-size="21" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(usd(cur["p" + p]))}</text>`;
  }).join("");

  const heroPct = prof != null ? Math.round(prof * 100) : null;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="cbBg" cx="50%" cy="-6%" r="95%"><stop offset="0%" stop-color="#161a2b"/><stop offset="46%" stop-color="#0b0d18"/><stop offset="100%" stop-color="#05060d"/></radialGradient>
<linearGradient id="cbRb" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ef4444"/><stop offset="20%" stop-color="#f59e0b"/><stop offset="42%" stop-color="#84cc16"/><stop offset="62%" stop-color="#06b6d4"/><stop offset="82%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#d946ef"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#cbBg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="76" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="0.4">SPX6900 — COST BASIS DISTRIBUTION</text>
<text x="60" y="120" fill="#c8d1de" font-size="24" font-family="sans-serif">Where every holder bought — a percentile ladder, price woven through.</text>
<rect x="60" y="150" width="${W - 120}" height="4" rx="2" fill="url(#cbRb)"/>
<text x="60" y="200" fill="#f8fafc" font-size="25" font-weight="800" font-family="sans-serif">price ${esc(usd(cur.spot))}</text>
${realized > 0 ? `<text x="278" y="200" fill="#fbbf24" font-size="25" font-weight="800" font-family="sans-serif">realized ${esc(usd(realized))}</text>` : ""}
<text x="540" y="200" fill="#7dd3fc" font-size="25" font-weight="800" font-family="sans-serif">median ${esc(usd(cur.p50))}</text>
${heroPct != null ? `<text x="775" y="200" fill="${heroPct >= 50 ? "#4ade80" : "#fb7185"}" font-size="25" font-weight="800" font-family="sans-serif">${heroPct}% in profit</text>` : ""}
${grid}${xlab}
${bands}
<line x1="${mL}" y1="${nowY}" x2="${mL + pW}" y2="${nowY}" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.45" stroke-dasharray="5 6"/>
${realized > 0 ? `<line x1="${mL}" y1="${y(realized).toFixed(1)}" x2="${mL + pW}" y2="${y(realized).toFixed(1)}" stroke="#fbbf24" stroke-width="1.6" stroke-opacity="0.7" stroke-dasharray="2 6"/><text x="${mL + 8}" y="${(y(realized) - 7).toFixed(1)}" fill="#fbbf24" font-size="18" font-weight="700" font-family="sans-serif">realized price (avg) ${esc(usd(realized))}</text>` : ""}
${priceLine}
${sweep}
${pills}
<text x="60" y="${H - 26}" fill="#8592a6" font-size="16" font-family="sans-serif">${esc("spx6900rainbow.xyz · realized = average cost basis (what MVRV uses); the median sits lower · not financial advice")}</text>
</svg>`;
}

export function renderCostBasisCard(hist, opts = {}) {
  const svg = costBasisSvg(hist, opts);
  return svg ? png(svg, opts.W ?? 1080) : null;
}
