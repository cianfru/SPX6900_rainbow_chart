// "Realized Price & Floor Model" card — SPX6900 spot vs the crowd's on-chain cost
// basis (realized price), with multiplier support bands beneath it (0.8× and 0.5×
// realized = the historical "floor zone"). Uses the SAME Dune realized-price
// reconstruction we already bundled (stats.onchain `rp`/`spot`) — NO new Dune calls.
// The honest read: price has repeatedly found support in the 0.5–0.8× cost-basis zone;
// today the average holder is underwater and spot sits near that floor. A valuation
// POSITION, not a buy signal (the guardrail — bands are a reference, not a promise).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fP = v => "$" + (v >= 1 ? v.toFixed(2) : v >= 0.1 ? v.toFixed(3) : v.toFixed(4));
const SPOT_C = "#e2e8f0", RP_C = "#fbbf24", FLOOR_C = "#34d399", DEEP_C = "#f87171";

export function floorModelSvg(stats, opts = {}) {
  const raw = (stats.onchain || [])
    .map(r => ({ t: Date.parse(r.d), rp: +r.rp, spot: +r.spot }))
    .filter(r => Number.isFinite(r.t) && r.rp > 0 && r.spot > 0)
    .sort((a, b) => a.t - b.t);
  if (raw.length < 50) return null;

  // live spot overrides the last (weekly) point so "now" is current.
  const cur = raw.at(-1);
  const spotNow = stats.price > 0 ? stats.price : cur.spot;
  const rpNow = cur.rp;
  const f08 = rpNow * 0.8, f05 = rpNow * 0.5;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 156, mT = 154, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].t, t1 = cur.t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  // log price axis spanning the deep floor (0.5× realized) up through spot/realized.
  const lo = Math.min(...raw.map(r => Math.min(r.spot, r.rp * 0.5))) * 0.85;
  const hi = Math.max(spotNow, ...raw.map(r => Math.max(r.spot, r.rp))) * 1.1;
  const y = v => mT + ((Math.log(hi) - Math.log(Math.max(v, 1e-12))) / ((Math.log(hi) - Math.log(lo)) || 1)) * pH;

  const path = (sel) => raw.map(r => `${x(r.t).toFixed(1)},${y(sel(r)).toFixed(1)}`).join(" ");
  const spotLine = path(r => r.spot), rpLine = path(r => r.rp);
  const up08 = path(r => r.rp * 0.8), up05 = path(r => r.rp * 0.5);

  // floor "value zone" = filled band between 0.8× and 0.5× realized (a closed polygon:
  // 0.8× line forward, 0.5× line back). Where spot enters this = a discount to cost basis.
  const bandPoly = up08 + " " + raw.slice().reverse().map(r => `${x(r.t).toFixed(1)},${y(r.rp * 0.5).toFixed(1)}`).join(" ");

  let grid = "";
  for (const v of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1].filter(v => v >= lo && v <= hi)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.10)"/><text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#cbd5e1" font-size="26" font-weight="600" text-anchor="end" font-family="sans-serif">${fP(v)}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#cbd5e1" font-size="26" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const curX = x(t1), curY = y(spotNow);
  const under = spotNow < rpNow;
  const toFloor = (spotNow / f05); // × above the deep floor
  const state = under
    ? `under cost basis · ${toFloor.toFixed(2)}× the 0.5× floor`
    : `${(spotNow / rpNow).toFixed(2)}× cost basis`;

  // right-edge band labels
  const lbl = (v, c, txt) => `<text x="${W - mR + 8}" y="${(y(v) + 7).toFixed(1)}" fill="${c}" font-size="22" font-weight="700" font-family="sans-serif">${esc(txt)}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="fmbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="fmfloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${FLOOR_C}" stop-opacity="0.16"/><stop offset="100%" stop-color="#22d38a" stop-opacity="0.34"/></linearGradient>
<filter id="fmglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#fmbg)"/>
<text x="60" y="56" fill="#e2e8f0" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — REALIZED PRICE &amp; FLOOR</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="sans-serif">Where has price kept finding a floor vs what holders paid?</text>
<text x="60" y="130" fill="${SPOT_C}" font-size="27" font-weight="800" font-family="sans-serif">${fP(spotNow)} spot · ${fP(rpNow)} cost basis — ${esc(state)}</text>
${grid}${xlab}
<polygon points="${bandPoly}" fill="url(#fmfloor)"/>
<polyline points="${up08}" fill="none" stroke="${FLOOR_C}" stroke-width="2.5" stroke-opacity="0.9" stroke-dasharray="6 6"/>
<polyline points="${up05}" fill="none" stroke="${DEEP_C}" stroke-width="2.5" stroke-opacity="0.85" stroke-dasharray="4 7"/>
<polyline points="${rpLine}" fill="none" stroke="${RP_C}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
<polyline points="${spotLine}" fill="none" stroke="${SPOT_C}" stroke-width="8" stroke-opacity="0.20" stroke-linejoin="round" stroke-linecap="round" filter="url(#fmglow)"/>
<polyline points="${spotLine}" fill="none" stroke="${SPOT_C}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${lbl(rpNow, RP_C, "realized")}
${lbl(f08, FLOOR_C, "0.8×")}
${lbl(f05, DEEP_C, "0.5× floor")}
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${SPOT_C}" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY - 18).toFixed(1)}" fill="${SPOT_C}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · realized price = crowd's on-chain cost basis")}</text>
</svg>`;
}

export function renderFloorModelCard(stats, opts = {}) {
  const svg = floorModelSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
