// "SPX6900 on exchanges — by venue" — the CEX supply curve, split by exchange (Kraken vs
// Bybit vs Coinbase …). Same on-chain CEX total as the supply card, but stacked so you see
// which venue holds what, and how that mix shifted as new exchanges listed SPX. Data:
// stats.onchain[].cexVenues (per-venue balances from the FIFO engine). A location map, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMlab = t => t >= 1e6 ? +(t / 1e6).toFixed(t >= 1e7 ? 0 : 1) + "M" : Math.round(t / 1e3) + "K";
// Distinct qualitative palette; last colour is reserved for the "Other" roll-up.
const PAL = ["#f7931a", "#f6465d", "#a78bfa", "#22d3ee", "#4ade80", "#fbbf24", "#60a5fa", "#fb7185", "#94a3b8"];
const TOP = 8; // named venues; the rest fold into "Other"

// → { rows:[{t, parts:{venue:tokens}}], venues:[names in stack order], cur:{venue:tokens}, total }
export function cexVenuesStats(stats) {
  const oc = (stats?.onchain || []).filter(r => r.cexVenues && Object.keys(r.cexVenues).length);
  if (oc.length < 20) return null;
  const cur = oc.at(-1).cexVenues;
  const ranked = Object.entries(cur).sort((a, b) => b[1] - a[1]);
  const named = ranked.slice(0, TOP).map(([k]) => k);
  const hasOther = ranked.length > TOP;
  const venues = hasOther ? [...named, "Other"] : named;
  const rows = oc.map(r => {
    const parts = {}; let other = 0;
    for (const [k, v] of Object.entries(r.cexVenues)) { if (named.includes(k)) parts[k] = v; else other += v; }
    if (hasOther) parts.Other = +other.toFixed(2);
    return { t: Date.parse(r.d), parts };
  });
  const total = Object.values(cur).reduce((a, b) => a + b, 0);
  return { rows, venues, cur, total, top: ranked[0] };
}

export function cexVenuesSvg(stats, opts = {}) {
  const S = cexVenuesStats(stats);
  if (!S) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 120, mR = 40;
  const pW = W - mL - mR;
  const color = i => PAL[Math.min(i, PAL.length - 1)];
  const shareOf = v => S.cur[v] != null ? S.cur[v] : S.rows.at(-1).parts[v] || 0;

  // legend — venue + current share%, flowed over up to 2 rows
  const legFont = Math.max(21, Math.round(W / 46));
  const share = v => `${Math.round(100 * shareOf(v) / S.total)}%`;
  const lbl = v => `${v} ${share(v)}`;
  const swW = 30, swG = 11, itemGap = 40;
  const itemW = v => swW + swG + lbl(v).length * legFont * 0.56;
  const legRows = [[]]; let rw = 0;
  for (const v of S.venues) { const w = itemW(v); if (rw > 0 && rw + w > pW) { legRows.push([]); rw = 0; } legRows.at(-1).push(v); rw += w + itemGap; }
  const rowH = legFont + 18, legTop = 150;
  let legend = "";
  legRows.forEach((row, ri) => {
    const tot = row.reduce((a, v) => a + itemW(v), 0) + itemGap * (row.length - 1);
    let cx = mL + (pW - tot) / 2; const yy = legTop + ri * rowH;
    for (const v of row) {
      const i = S.venues.indexOf(v);
      legend += `<rect x="${cx.toFixed(1)}" y="${(yy - legFont * 0.8).toFixed(1)}" width="${swW}" height="${Math.round(legFont * 0.62)}" rx="4" fill="${color(i)}"/>`
        + `<text x="${(cx + swW + swG).toFixed(1)}" y="${yy.toFixed(1)}" fill="#e2e8f0" font-size="${legFont}" font-weight="700" font-family="sans-serif">${esc(v)}<tspan dx="8" fill="${color(i)}" font-weight="800">${share(v)}</tspan></text>`;
      cx += itemW(v) + itemGap;
    }
  });

  const pT = legTop + legRows.length * rowH + 16, pB = H - 104;
  const t0 = S.rows[0].t, t1 = S.rows.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yMax = Math.max(...S.rows.map(r => Object.values(r.parts).reduce((a, b) => a + b, 0))) * 1.08 || 1;
  const y = v => pB - (v / yMax) * (pB - pT);

  // stacked areas, biggest venue at the bottom
  let base = S.rows.map(() => 0), areas = "";
  S.venues.forEach((v, i) => {
    const top = S.rows.map((r, k) => base[k] + (r.parts[v] || 0));
    const up = S.rows.map((r, k) => `${x(r.t).toFixed(1)},${y(top[k]).toFixed(1)}`).join(" ");
    const dn = S.rows.map((r, k) => `${x(r.t).toFixed(1)},${y(base[k]).toFixed(1)}`).reverse().join(" ");
    areas += `<polygon points="${up} ${dn}" fill="${color(i)}" fill-opacity="0.68"/>`
      + `<polyline points="${up}" fill="none" stroke="${color(i)}" stroke-width="2" stroke-opacity="0.95"/>`;
    base = top;
  });

  let grid = "";
  const step = yMax > 100e6 ? 25e6 : yMax > 40e6 ? 10e6 : 5e6;
  for (let v = 0; v <= yMax; v += step) grid += `<line x1="${mL}" y1="${y(v).toFixed(1)}" x2="${W - mR}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.08)"/><text x="${mL - 14}" y="${(y(v) + 8).toFixed(1)}" fill="#aab6cc" font-size="23" text-anchor="end" font-family="sans-serif" font-weight="600">${fMlab(v)}</text>`;
  let xl = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xl += `<text x="${x(t).toFixed(1)}" y="${pB + 46}" fill="#aab6cc" font-size="24" text-anchor="middle" font-family="sans-serif" font-weight="600">${yr}</text>`; }

  const [topName, topVal] = S.top;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="cvbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171f42"/><stop offset="52%" stop-color="#0c1122"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#cvbg)"/>
${brandStripe(H)}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="0.5"><tspan fill="#f1f5f9">SPX6900 on exchanges — </tspan><tspan fill="${color(0)}">by venue</tspan></text>
<text x="60" y="98" font-size="20" font-family="sans-serif" fill="#94a3b8">${fMlab(S.total)} tokens across ${Object.keys(S.cur).length} venues, and how the mix shifted as listings landed</text>
${grid}${xl}${areas}${legend}
<text x="60" y="${H - 22}" fill="#94a3b8" font-size="16.5" font-family="sans-serif" textLength="${W - 96}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · on-chain supply on tagged exchange wallets (comprehensive Dune sweep) · Ethereum-native only · a location map, not a signal`)}</text>
</svg>`;
}

export function renderCexVenuesCard(stats, opts = {}) {
  const svg = cexVenuesSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
