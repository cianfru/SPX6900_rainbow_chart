// "MVRV vs Bitcoin" card — SPX6900's on-chain valuation (MVRV = price ÷ realized price)
// against Bitcoin's ~decade of MVRV. MVRV is unitless, so it's directly comparable across
// coins. The glanceable read: SPX6900 is at the ~2nd percentile of Bitcoin's entire
// history — as cheap as BTC was only at its 2011/2015/2018 cycle bottoms (magenta dots).
// Data: stats.btcMvrv (public/btc-mvrv.json, banked monthly) + SPX MVRV from price ÷ be.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

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

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 92, mT = 150, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = pts[0].ts, t1 = pts.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const spxVals = (stats.mvrvSeries || []).map(r => r.mvrv).filter(v => v > 0);
  const ymin = Math.min(sorted[0], spxMvrv, ...(spxVals.length ? [Math.min(...spxVals)] : [])) * 0.9;
  const ymax = Math.max(sorted.at(-1), ...(spxVals.length ? [Math.max(...spxVals)] : [])) * 1.05;
  const y = v => mT + ((Math.log(ymax) - Math.log(Math.max(v, 1e-9))) / ((Math.log(ymax) - Math.log(ymin)) || 1)) * pH;
  const btcLine = pts.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
  // SPX6900's own MVRV history, drawn on Bitcoin's timeline at its real dates. The card
  // used to show only a marker for today, which cannot answer "how does its history
  // compare" — the question it actually gets asked. MVRV is unitless, which is what
  // makes putting three years next to fifteen a fair comparison rather than a scale trick.
  const WEEK = 7 * 86400000;
  const spxRaw = (stats.mvrvSeries || [])
    .map(r => ({ ts: r.ts, v: r.mvrv }))
    .filter(r => Number.isFinite(r.ts) && r.v > 0 && r.ts >= t0 && r.ts <= t1)
    .sort((a, b) => a.ts - b.ts);
  const buckets = new Map();
  for (const r of spxRaw) {
    const k = Math.floor(r.ts / WEEK);
    (buckets.get(k) || buckets.set(k, []).get(k)).push(r.v);
  }
  const spxPts = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, vs]) => {
    const srt = vs.slice().sort((a, b) => a - b);
    return { ts: k * WEEK + WEEK / 2, v: srt[srt.length >> 1] }; // weekly median
  });
  const spxLine = spxPts.length > 30
    ? spxPts.map(r => `${x(r.ts).toFixed(1)},${y(Math.min(Math.max(r.v, ymin), ymax)).toFixed(1)}`).join(" ")
    : null;

  // Zones (BTC's own quantiles) — shade the cheap end where the story lives.
  // Vivid colours at ~0.24 opacity so the bands POP (was a very dim 0.10).
  const zband = (v1, v2, fill, o = 0.24) => (v1 != null && v2 != null && v2 > v1)
    ? `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${fill}" fill-opacity="${o}"/>` : "";
  const zones = zband(q(0.95), ymax, "#fb7185") + zband(q(0.80), q(0.95), "#fbbf24")
    + zband(q(0.50), q(0.80), "#4ade80") + zband(q(0.15), q(0.50), "#38bdf8") + zband(ymin, q(0.15), "#818cf8");

  let grid = "";
  for (const v of [0.5, 1, 2, 3, 5, 7].filter(v => v >= ymin && v <= ymax)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.12)"/><text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${fMvrv(v)}</text>`;
  }
  let xlab = "";
  for (let yr = fYr(t0); yr <= fYr(t1); yr += 2) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xlab += `<text x="${x(t).toFixed(1)}" y="${H - 50}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`; }

  // SPX marker band + line, and the match dots on BTC's line.
  const dots = hits.map(r => `<circle cx="${x(r.ts).toFixed(1)}" cy="${y(r.v).toFixed(1)}" r="7" fill="${MATCH_C}" stroke="#05050e" stroke-width="1.5"/>`).join("");
  const spxY = y(spxMvrv);

  const yearStr = years.length ? andList(years.map(String)) : null;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="mv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#mv)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="56" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — MVRV vs BITCOIN</text>
<text x="60" y="92" fill="#94a3b8" font-size="22" font-family="sans-serif">Is SPX as cheap as Bitcoin was at its cycle bottoms?</text>
<text x="60" y="134" fill="${SPX_C}" font-size="26" font-weight="800" font-family="sans-serif">SPX6900 ${fMvrv(spxMvrv)} — ${spxMvrv >= 1 ? "avg holder in profit" : "avg holder underwater"}</text>
<text x="${W - 60}" y="58" fill="${MATCH_C}" font-size="40" font-weight="800" font-family="sans-serif" text-anchor="end">${ordinal(pct)} %ile</text>
<text x="${W - 60}" y="90" fill="#94a3b8" font-size="19" font-family="sans-serif" text-anchor="end">cheaper than ${cheaperThan}% of BTC history</text>
${zones}${grid}${xlab}
<rect x="${mL}" y="${y(hi).toFixed(1)}" width="${pW}" height="${(y(lo) - y(hi)).toFixed(1)}" fill="${SPX_C}" fill-opacity="0.16"/>
${spxLine ? `<polyline points="${spxLine}" fill="none" stroke="${SPX_C}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
<polyline points="${btcLine}" fill="none" stroke="${BTC_C}" stroke-width="2.8" stroke-linejoin="round"/>
<line x1="${mL}" y1="${spxY.toFixed(1)}" x2="${W - mR}" y2="${spxY.toFixed(1)}" stroke="${SPX_C}" stroke-width="3.2" stroke-opacity="0.95"/>
<text x="${W - mR - 6}" y="${(spxY - 12).toFixed(1)}" fill="${SPX_C}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">SPX today ${fMvrv(spxMvrv)}</text>
${dots}
<text x="60" y="${H - 22}" fill="#475569" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ")}<tspan fill="${BTC_C}">Bitcoin MVRV</tspan> · <tspan fill="${SPX_C}">SPX6900 MVRV</tspan> · <tspan fill="${MATCH_C}">BTC at SPX's level ●</tspan>${yearStr ? ` <tspan fill="#64748b">(${esc(yearStr)} bottoms)</tspan>` : ""}</text>
</svg>`;
}

// ── AGE-ALIGNED overlay: SPX6900 vs Bitcoin MVRV on one axis of YEARS SINCE EACH LAUNCH ──
// Age 0 is each asset's FIRST on-chain MVRV reading — i.e. when it first had a market price to
// measure against. SPX's is its launch (Aug 2023); Bitcoin's is ~2010-07 (its first market price —
// MVRV is undefined before a price existed, so there is nothing earlier to plot). Anchoring BTC at
// its first reading rather than the 2009 genesis is the honest symmetric comparison: both lines start
// from "the first day the asset could be valued", so BTC's line runs the full width with no 1.5y gap.
// This matches the site chart (MvrvContextChart) exactly. Answers "does SPX's early MVRV cycle rhyme
// with Bitcoin's?" directly, which the calendar overlay (SPX squeezed at the right) can't show.
const YR = 365.25 * 86400000;
const fAgeC = a => (a === Math.round(a) ? a + "y" : a.toFixed(1) + "y");

export function mvrvAgeSvg(stats, opts = {}) {
  const btc = (stats.btcMvrv || []).map(([d, v]) => ({ ts: Date.parse(d + "T00:00:00Z"), v }))
    .filter(r => Number.isFinite(r.ts) && r.v > 0).sort((a, b) => a.ts - b.ts);
  if (btc.length < 100) return null;
  const be = stats.supply?.breakEven, price = stats.price;
  if (!(be > 0) || !(price > 0)) return null;
  const spxMvrv = price / be;

  // SPX MVRV path, weekly-median bucketed (same as the calendar card)
  const WEEK = 7 * 86400000;
  const spxRaw = (stats.mvrvSeries || []).map(r => ({ ts: r.ts, v: r.mvrv }))
    .filter(r => Number.isFinite(r.ts) && r.v > 0).sort((a, b) => a.ts - b.ts);
  if (spxRaw.length < 20) return null;
  const bk = new Map();
  for (const r of spxRaw) { const k = Math.floor(r.ts / WEEK); (bk.get(k) || bk.set(k, []).get(k)).push(r.v); }
  const spxW = [...bk.entries()].sort((a, b) => a[0] - b[0]).map(([k, vs]) => {
    const s = vs.slice().sort((a, b) => a - b); return { ts: k * WEEK + WEEK / 2, v: s[s.length >> 1] };
  });
  const spxInception = spxW[0].ts;
  const spxAge = spxW.map(r => ({ age: (r.ts - spxInception) / YR, v: r.v }));
  const spxMaxAge = spxAge.at(-1).age;
  const xMax = Math.max(5, Math.ceil(spxMaxAge) + 1);
  const btcInception = btc[0].ts;   // BTC's FIRST MVRV reading → its age 0 (no genesis gap; matches the site)
  const btcAge = btc.map(r => ({ age: (r.ts - btcInception) / YR, v: r.v })).filter(r => r.age >= 0 && r.age <= xMax);

  // percentile of SPX today on BTC's whole history (for the header stat)
  const sorted = btc.map(r => r.v).sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const pct = Math.round((sorted.filter(v => v <= spxMvrv).length / sorted.length) * 100);
  const cheaperThan = 100 - pct;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 60, mT = 150, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const x = a => mL + (a / xMax) * pW;
  const allV = [...spxAge.map(r => r.v), ...btcAge.map(r => r.v), spxMvrv];
  const ymin = Math.min(...allV) * 0.9, ymax = Math.max(...allV) * 1.05;
  const y = v => mT + ((Math.log(ymax) - Math.log(Math.max(v, 1e-9))) / ((Math.log(ymax) - Math.log(ymin)) || 1)) * pH;

  const zband = (v1, v2, fill, o = 0.22) => (v1 != null && v2 != null && v2 > v1)
    ? `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${fill}" fill-opacity="${o}"/>` : "";
  const zones = zband(q(0.95), ymax, "#fb7185") + zband(q(0.80), q(0.95), "#fbbf24")
    + zband(q(0.50), q(0.80), "#4ade80") + zband(q(0.15), q(0.50), "#38bdf8") + zband(ymin, q(0.15), "#818cf8");

  let grid = "";
  for (const v of [0.5, 1, 2, 3, 5, 7].filter(v => v >= ymin && v <= ymax)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.12)"/><text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${fMvrv(v)}</text>`;
  }
  let xlab = "";
  for (let a = 0; a <= xMax; a++) xlab += `<text x="${x(a).toFixed(1)}" y="${H - 50}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${fAgeC(a)}</text>`;

  const line = (pts, col, w) => `<polyline points="${pts.map(r => `${x(r.age).toFixed(1)},${y(Math.min(Math.max(r.v, ymin), ymax)).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const spxMarkX = x(spxMaxAge);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="mv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#mv)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="56" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 vs BITCOIN — MVRV BY AGE</text>
<text x="60" y="92" fill="#94a3b8" font-size="22" font-family="sans-serif">Same age since first price — does the early cycle rhyme?</text>
<text x="60" y="134" fill="${SPX_C}" font-size="26" font-weight="800" font-family="sans-serif">SPX6900 ${fMvrv(spxMvrv)} — ${spxMvrv >= 1 ? "avg holder in profit" : "avg holder underwater"}</text>
<text x="${W - 60}" y="58" fill="${MATCH_C}" font-size="40" font-weight="800" font-family="sans-serif" text-anchor="end">${ordinal(pct)} %ile</text>
<text x="${W - 60}" y="90" fill="#94a3b8" font-size="19" font-family="sans-serif" text-anchor="end">cheaper than ${cheaperThan}% of BTC history</text>
${zones}${grid}${xlab}
<line x1="${mL}" y1="${y(1).toFixed(1)}" x2="${W - mR}" y2="${y(1).toFixed(1)}" stroke="rgba(255,255,255,0.45)" stroke-dasharray="6 6"/>
<line x1="${spxMarkX.toFixed(1)}" y1="${mT}" x2="${spxMarkX.toFixed(1)}" y2="${mT + pH}" stroke="${SPX_C}" stroke-dasharray="4 4" stroke-opacity="0.6"/>
<text x="${(spxMarkX - 6).toFixed(1)}" y="${mT + 22}" fill="${SPX_C}" font-size="18" font-family="sans-serif" text-anchor="end">SPX today ${fAgeC(spxMaxAge)}</text>
${line(btcAge, BTC_C, 2.8)}
${line(spxAge, SPX_C, 3.6)}
<text x="60" y="${H - 22}" fill="#475569" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · years since first price (BTC from mid-2010) · ")}<tspan fill="${SPX_C}">SPX6900 MVRV</tspan> · <tspan fill="${BTC_C}">Bitcoin MVRV</tspan></text>
</svg>`;
}

export function renderMvrvBtcCard(stats, opts = {}) {
  // Default to the age-aligned overlay (the "does the early cycle rhyme" read); fall back to the
  // calendar overlay if the age version can't build (e.g. too little SPX MVRV history).
  const svg = mvrvAgeSvg(stats, { W: opts.W, H: opts.H }) || mvrvBtcSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
