// "Where SPX6900's tradable supply sits" — the structural card. SPX launched DEX-native
// (all liquidity in the Uniswap LP); as it got listed across exchanges through 2024-25, the
// exchange-held supply ramped while the LP shrank. Stacked area of on-venue supply (LP +
// exchanges + custody) over time, tokens. Data: src/cex-flow.js (Dune, reconciles to the
// FIFO engine). A supply-location map, not a signal.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { CEX_FLOW } from "../../src/cex-flow.js";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMlab = t => t >= 1e6 ? Math.round(t / 1e6) + "M" : Math.round(t / 1e3) + "K";

// Prefer the CI-refreshed public/cex-flow.json (Dune baseline + daily snapshot-forward); fall
// back to the frozen bundle. [d, cexBal, lpBal, custBal, org, onb, price].
function cexDays() {
  try { const o = JSON.parse(readFileSync(new URL("../../public/cex-flow.json", import.meta.url), "utf8")); if (o?.days?.length) return o.days; } catch { /* fall back */ }
  return CEX_FLOW.days;
}
const W_ = cexDays().map(r => ({ t: Date.parse(r[0]), cex: r[1], lp: r[2], cust: r[3] }));

export function cexSupplyStats() {
  const last = W_.at(-1);
  const total = last.cex + last.lp + last.cust;
  return { cex: last.cex, lp: last.lp, cust: last.cust, total };
}

export function cexSupplySvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 120, mR = 40;
  const pW = W - mL - mR;
  // legend (2-row flow, big) — computed first, plot flows under it
  const st = cexSupplyStats();
  const bands = [
    { key: "Exchanges", c: "#fb7185", val: st.cex },
    { key: "Uniswap LP", c: "#38bdf8", val: st.lp },
  ];
  const legFont = Math.max(24, Math.round(W / 40));
  const label = b => `${b.key}  ${fMlab(b.val)}`;
  const swW = 34, swG = 13, itemGap = 46;
  const itemW = b => swW + swG + label(b).length * legFont * 0.57;
  const rows = [[]]; let rw = 0;
  for (const b of bands) { const w = itemW(b); if (rw > 0 && rw + w > pW) { rows.push([]); rw = 0; } rows[rows.length - 1].push(b); rw += w + itemGap; }
  const rowH = legFont + 22, legTop = 138;
  let legend = "";
  rows.forEach((row, ri) => {
    const tot = row.reduce((a, b) => a + itemW(b), 0) + itemGap * (row.length - 1);
    let cx = mL + (pW - tot) / 2; const yy = legTop + ri * rowH;
    for (const b of row) {
      legend += `<line x1="${cx.toFixed(1)}" y1="${(yy - 8).toFixed(1)}" x2="${(cx + swW).toFixed(1)}" y2="${(yy - 8).toFixed(1)}" stroke="${b.c}" stroke-width="6" stroke-linecap="round"/>`
        + `<text x="${(cx + swW + swG).toFixed(1)}" y="${yy.toFixed(1)}" fill="${b.c}" font-size="${legFont}" font-weight="800" font-family="sans-serif">${esc(b.key)}<tspan dx="10" fill="#e2e8f0">${fMlab(b.val)}</tspan></text>`;
      cx += itemW(b) + itemGap;
    }
  });
  const pT = legTop + rows.length * rowH + 20, pB = H - 104;
  const t0 = W_[0].t, t1 = W_.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yMax = Math.max(...W_.map(r => r.cex + r.lp + r.cust)) * 1.08;
  const y = v => pB - (v / yMax) * (pB - pT);

  // stacked areas: LP (bottom) → Exchanges → Custody
  const stackAreas = () => {
    const order = [{ c: "#38bdf8", get: r => r.lp }, { c: "#fb7185", get: r => r.cex }];
    let base = W_.map(() => 0), out = "";
    for (const s of order) {
      const top = W_.map((r, i) => base[i] + s.get(r));
      const up = W_.map((r, i) => `${x(r.t).toFixed(1)},${y(top[i]).toFixed(1)}`).join(" ");
      const dn = W_.map((r, i) => `${x(r.t).toFixed(1)},${y(base[i]).toFixed(1)}`).reverse().join(" ");
      out += `<polygon points="${up} ${dn}" fill="${s.c}" fill-opacity="0.55"/>`
        + `<polyline points="${up}" fill="none" stroke="${s.c}" stroke-width="2.5" stroke-opacity="0.95"/>`;
      base = top;
    }
    return out;
  };

  let grid = "";
  const step = yMax > 100e6 ? 25e6 : 10e6;
  for (let v = 0; v <= yMax; v += step) grid += `<line x1="${mL}" y1="${y(v).toFixed(1)}" x2="${W - mR}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.08)"/><text x="${mL - 14}" y="${(y(v) + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif" font-weight="600">${fMlab(v)}</text>`;
  let xl = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xl += `<text x="${x(t).toFixed(1)}" y="${pB + 46}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif" font-weight="600">${yr}</text>`; }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="csbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171f42"/><stop offset="52%" stop-color="#0c1122"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
<radialGradient id="csacc" cx="18%" cy="4%" r="78%"><stop offset="0%" stop-color="#fb7185" stop-opacity="0.12"/><stop offset="46%" stop-color="#fb7185" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#csbg)"/><rect width="${W}" height="${H}" fill="url(#csacc)"/>
${brandStripe(H)}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1"><tspan fill="#fb7185">WHERE SPX6900'S</tspan><tspan fill="#f1f5f9"> TRADABLE SUPPLY SITS</tspan></text>
<text x="60" y="98" font-size="20" font-family="sans-serif" fill="#94a3b8">Launched DEX-native (all in the LP); exchange-held supply grew as listings landed</text>
${grid}${xl}${stackAreas()}${legend}
<text x="60" y="${H - 22}" fill="#94a3b8" font-size="17" font-family="sans-serif" textLength="${W - 96}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · on-chain (Dune) · supply on tagged exchange & LP addresses · known addresses only · a location map, not a signal`)}</text>
</svg>`;
}

export function renderCexSupplyCard(opts = {}) {
  return png(cexSupplySvg(opts), opts.W ?? 1200);
}
