// "MVRV over time" card — SPX6900's own on-chain valuation across its FULL history
// (price ÷ the crowd's realized cost basis), now that the Dune realized-cost backfill
// gives launch→now MVRV. Distinct from `mvrvbtc` (which positions SPX on Bitcoin's
// decade): this is SPX vs ITS OWN history — zones from its own distribution, a 1×
// break-even reference, and where we sit today. The honest hook: the crowd's cost basis
// barely fell while price crashed (conviction), leaving the average holder underwater at
// a level cheaper than most of SPX6900's own history. Data: stats.mvrvSeries.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMvrv = v => v.toFixed(2) + "×";
const fMon = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const ordinal = n => { const v = n % 100; return n + (["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"); };
const SPX_C = "#a78bfa", HOT_C = "#f87171", COOL_C = "#38bdf8";

export function mvrvTrendSvg(stats, opts = {}) {
  const raw = (stats.mvrvSeries || []).filter(r => r.mvrv > 0 && Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  if (raw.length < 100) return null; // needs the real backfill bundle

  const cur = raw.at(-1), mvrv = cur.mvrv;
  const sorted = raw.map(r => r.mvrv).sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const pct = Math.round(sorted.filter(v => v <= mvrv).length / sorted.length * 100);
  const cheaperThan = 100 - pct;
  const peak = raw.reduce((m, r) => r.mvrv > m.mvrv ? r : m, raw[0]);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 92, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const ymin = Math.min(sorted[0], mvrv) * 0.9, ymax = sorted.at(-1) * 1.05;
  const y = v => mT + ((Math.log(ymax) - Math.log(Math.max(v, 1e-9))) / ((Math.log(ymax) - Math.log(ymin)) || 1)) * pH;

  // Valuation zones from SPX's OWN quantiles — 3 bold, LABELLED bands so the colour
  // reads as meaning at a glance (expensive top / fair middle / cheap bottom).
  const zband = (v1, v2, fill, op) => (v1 != null && v2 != null && v2 > v1)
    ? `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${fill}" fill-opacity="${op}"/>` : "";
  const zHi = q(0.66), zLo = q(0.33);
  const zones = zband(zHi, ymax, "#f87171", 0.20) + zband(zLo, zHi, "#94a3b8", 0.07) + zband(ymin, zLo, "#38bdf8", 0.18);
  // Zone labels pinned to the top of each band on the LEFT (clear of the right-side markers).
  const zlab = (yTop, txt, col) => `<text x="${(mL + 14).toFixed(1)}" y="${(yTop + 30).toFixed(1)}" fill="${col}" font-size="22" font-weight="800" letter-spacing="2" font-family="sans-serif">${txt}</text>`;
  const zoneLabels = zlab(mT, "EXPENSIVE", "#fca5a5") + zlab(y(zHi), "FAIR", "#cbd5e1") + zlab(y(zLo), "CHEAP", "#7dd3fc");

  let grid = "";
  for (const v of [0.25, 0.5, 1, 2, 3, 5].filter(v => v >= ymin && v <= ymax)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/><text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#a3aec0" font-size="23" text-anchor="end" font-family="sans-serif">${fMvrv(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  // MVRV line + area fill (glow underlay for punch, per the card visual-impact pass).
  const line = raw.map(r => `${x(r.ts).toFixed(1)},${y(r.mvrv).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${line} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;

  // 1× break-even reference — above = crowd in profit, below = underwater.
  const beY = y(1).toFixed(1);
  const curX = x(cur.ts), curY = y(mvrv);
  const peakX = x(peak.ts), peakY = y(peak.mvrv);
  const state = mvrv >= 1 ? "avg holder in profit" : "avg holder underwater";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="mtbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="mtfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SPX_C}" stop-opacity="0.32"/><stop offset="60%" stop-color="${SPX_C}" stop-opacity="0.08"/><stop offset="100%" stop-color="${SPX_C}" stop-opacity="0"/></linearGradient>
<filter id="mtglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#mtbg)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — MVRV OVER TIME</text>
<text x="60" y="92" fill="#94a3b8" font-size="22" font-family="sans-serif">Price vs the crowd's on-chain cost basis, since launch</text>
<text x="60" y="134" fill="${SPX_C}" font-size="26" font-weight="800" font-family="sans-serif">${fMvrv(mvrv)} — ${state}</text>
<text x="${W - 60}" y="58" fill="${mvrv >= 1 ? "#4ade80" : COOL_C}" font-size="40" font-weight="800" font-family="sans-serif" text-anchor="end">${ordinal(pct)} %ile</text>
<text x="${W - 60}" y="90" fill="#94a3b8" font-size="19" font-family="sans-serif" text-anchor="end">cheaper than ${cheaperThan}% of its own history</text>
${zones}${grid}${xlab}
<polygon points="${area}" fill="url(#mtfill)"/>
${zoneLabels}
<line x1="${mL}" y1="${beY}" x2="${W - mR}" y2="${beY}" stroke="#4ade80" stroke-width="2" stroke-opacity="0.9" stroke-dasharray="7 6"/>
<text x="${W - mR - 8}" y="${(+beY - 10).toFixed(1)}" fill="#86efac" font-size="20" font-weight="700" text-anchor="end" font-family="sans-serif">break-even 1×</text>
<polyline points="${line}" fill="none" stroke="${SPX_C}" stroke-width="9" stroke-opacity="0.22" stroke-linejoin="round" stroke-linecap="round" filter="url(#mtglow)"/>
<polyline points="${line}" fill="none" stroke="#c4b5fd" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="7" fill="${HOT_C}" stroke="#05050e" stroke-width="1.5"/>
<text x="${peakX.toFixed(1)}" y="${(peakY < mT + 40 ? peakY + 36 : peakY - 16).toFixed(1)}" fill="#fca5a5" font-size="21" font-weight="800" text-anchor="middle" font-family="sans-serif">peak ${fMvrv(peak.mvrv)} · ${esc(fMon(peak.ts))}</text>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="#c4b5fd" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY - 18).toFixed(1)}" fill="#c4b5fd" font-size="24" font-weight="800" text-anchor="end" font-family="sans-serif">today ${fMvrv(mvrv)}</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · MVRV = price ÷ realized cost basis · zones are SPX6900's own quantiles")}</text>
</svg>`;
}

export function renderMvrvTrendCard(stats, opts = {}) {
  const svg = mvrvTrendSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
