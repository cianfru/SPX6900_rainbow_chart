// "MVRV vs Bitcoin" card — SPX6900's on-chain valuation (MVRV = price ÷ realized price)
// against Bitcoin's ~decade of MVRV. MVRV is unitless, so it's directly comparable across
// coins. The glanceable read: SPX6900 is at the ~2nd percentile of Bitcoin's entire
// history — as cheap as BTC was only at its 2011/2015/2018 cycle bottoms (magenta dots).
// Data: stats.btcMvrv (public/btc-mvrv.json, banked monthly) + SPX MVRV from price ÷ be.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMvrv = v => v.toFixed(2) + "×";
const fYr = t => new Date(t).getUTCFullYear();
const ordinal = n => { const v = n % 100; return n + (["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"); };
const andList = xs => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(" · ") + " · " + xs.at(-1);
const BTC_C = "#f7931a", SPX_C = "#a78bfa", MATCH_C = "#e879f9";
const MATCH_BAND = 0.12;

export function mvrvBtcSvg(stats, opts = {}) {
  const pts = (stats.btcMvrv || []).map(([d, v]) => ({ ts: Date.parse(d + "T00:00:00Z"), v }))
    .filter(r => Number.isFinite(r.ts) && r.v > 0).sort((a, b) => a.ts - b.ts);
  if (pts.length < 100) return null; // needs the real BTC history bundle
  const be = stats.supply?.breakEven, price = stats.price;
  if (!(be > 0) || !(price > 0)) return null;
  const spxMvrv = price / be;

  const sorted = pts.map(r => r.v).sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const below = sorted.filter(v => v <= spxMvrv).length;
  const pct = Math.round((below / sorted.length) * 100);
  const cheaperThan = 100 - pct;

  // "We've been here": BTC weeks within ±band of SPX today, clustered into periods → years.
  const lo = spxMvrv * (1 - MATCH_BAND), hi = spxMvrv * (1 + MATCH_BAND);
  const hits = pts.filter(r => r.v >= lo && r.v <= hi);
  const periods = [];
  for (const r of hits) { const last = periods.at(-1); if (!last || r.ts - last.end > 120 * 86400000) periods.push({ start: r.ts, end: r.ts }); else last.end = r.ts; }
  const years = [...new Set(periods.map(p => fYr(p.start)))];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 92, mT = 150, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = pts[0].ts, t1 = pts.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const ymin = Math.min(sorted[0], spxMvrv) * 0.9, ymax = sorted.at(-1) * 1.05;
  const y = v => mT + ((Math.log(ymax) - Math.log(Math.max(v, 1e-9))) / ((Math.log(ymax) - Math.log(ymin)) || 1)) * pH;
  const btcLine = pts.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");

  // Zones (BTC's own quantiles) — shade the cheap end where the story lives.
  const zband = (v1, v2, fill) => (v1 != null && v2 != null && v2 > v1)
    ? `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${fill}" fill-opacity="0.10"/>` : "";
  const zones = zband(q(0.95), ymax, "#f87171") + zband(q(0.80), q(0.95), "#fbbf24")
    + zband(q(0.50), q(0.80), "#4ade80") + zband(q(0.15), q(0.50), "#38bdf8") + zband(ymin, q(0.15), "#818cf8");

  let grid = "";
  for (const v of [0.5, 1, 2, 3, 5, 7].filter(v => v >= ymin && v <= ymax)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/><text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">${fMvrv(v)}</text>`;
  }
  let xlab = "";
  for (let yr = fYr(t0); yr <= fYr(t1); yr += 2) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xlab += `<text x="${x(t).toFixed(1)}" y="${H - 54}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}</text>`; }

  // SPX marker band + line, and the match dots on BTC's line.
  const dots = hits.map(r => `<circle cx="${x(r.ts).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="7" fill="${MATCH_C}" stroke="#05050e" stroke-width="1.5"/>`).join("");
  const spxY = y(spxMvrv);

  const yearStr = years.length ? andList(years.map(String)) : null;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="mv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#mv)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — MVRV vs BITCOIN</text>
<text x="60" y="92" fill="#94a3b8" font-size="22" font-family="sans-serif">On-chain valuation across Bitcoin's decade of MVRV</text>
<text x="60" y="134" fill="${SPX_C}" font-size="26" font-weight="800" font-family="sans-serif">SPX6900 ${fMvrv(spxMvrv)} — ${spxMvrv >= 1 ? "avg holder in profit" : "avg holder underwater"}</text>
<text x="${W - 60}" y="58" fill="${MATCH_C}" font-size="40" font-weight="800" font-family="sans-serif" text-anchor="end">${ordinal(pct)} %ile</text>
<text x="${W - 60}" y="90" fill="#94a3b8" font-size="19" font-family="sans-serif" text-anchor="end">cheaper than ${cheaperThan}% of BTC history</text>
${zones}${grid}${xlab}
<rect x="${mL}" y="${y(hi).toFixed(1)}" width="${pW}" height="${(y(lo) - y(hi)).toFixed(1)}" fill="${SPX_C}" fill-opacity="0.16"/>
<polyline points="${btcLine}" fill="none" stroke="${BTC_C}" stroke-width="2.8" stroke-linejoin="round"/>
<line x1="${mL}" y1="${spxY.toFixed(1)}" x2="${W - mR}" y2="${spxY.toFixed(1)}" stroke="${SPX_C}" stroke-width="3.2" stroke-opacity="0.95"/>
<text x="${W - mR - 6}" y="${(spxY - 12).toFixed(1)}" fill="${SPX_C}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">SPX today ${fMvrv(spxMvrv)}</text>
${dots}
<text x="60" y="${H - 22}" fill="#475569" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ")}<tspan fill="${BTC_C}">Bitcoin MVRV</tspan> · <tspan fill="${MATCH_C}">BTC at SPX's level ●</tspan>${yearStr ? ` <tspan fill="#64748b">(${esc(yearStr)} bottoms)</tspan>` : ""}</text>
</svg>`;
}

export function renderMvrvBtcCard(stats, opts = {}) {
  const svg = mvrvBtcSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
