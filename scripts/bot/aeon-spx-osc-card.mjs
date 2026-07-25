// PROJECT AEON — "dear or cheap in SPX" oscillator card.
//
// SPX is the reference, drawn as the flat line through the middle: zero means an AEON
// costs exactly what it has typically cost in SPX6900 coins over the trailing year.
// Everything above that line is AEON getting expensive against SPX, everything below is
// it getting cheap. The oscillator is the log deviation from that baseline, which is the
// right transform for a ratio — a doubling and a halving are then the same distance from
// the line, in opposite directions.
//
// Why SPX and not ETH or dollars: AEON's weekly returns track SPX at r ~0.53-0.57 against
// ~0.36 for ETH, so SPX explains roughly 28% of AEON's price variation where its own
// rarity explains ~5%. The maths lives in src/aeon-spx-value.js and is shared with the
// site chart, so the card and the page cannot drift.
//
// Data: public/aeon-market.json → spxValue.floorSeries (daily 7-day-median floor in SPX).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { zStats, ordinal } from "../../src/aeon-spx-value.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const fSpx = v => (v >= 1000 ? Math.round(v / 100) / 10 + "k" : Math.round(v) + "");

export function aeonSpxOscSvg(market, opts = {}) {
  const sv = market?.spxValue;
  const series = (sv?.floorSeries || []).filter(r => r?.[1] > 0);
  if (series.length < 60) return null;
  const z = zStats(series);
  if (!z) return null;

  const baseAt = new Map(z.baseSeries);
  // The oscillator: log(price / trailing baseline). Zero = at its SPX-denominated norm.
  const pts = series
    .map(([d, r]) => {
      const b = baseAt.get(d);
      return b > 0 ? { t: Date.parse(d), v: Math.log(r / b), raw: r } : null;
    })
    .filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.v));
  if (pts.length < 60) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 1200;
  const mL = 104, mR = 96, mT = 200, mB = 104;
  const pW = W - mL - mR, pH = H - mT - mB;
  const t0 = pts[0].t, t1 = pts.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  // Symmetric domain so the zero line sits dead centre — the whole point of the card.
  const lim = Math.max(Math.max(...pts.map(p => Math.abs(p.v))) * 1.06, z.sd * 2.2);
  const y = v => mT + (1 - (v + lim) / (2 * lim)) * pH;
  const y0 = y(0);

  // ±0.5σ is the fair band the shared module uses for its verdict — outside it the card
  // tints. Rects are CLAMPED to the plot box: an unclamped 99σ rect painted straight over
  // the headline.
  const clamp = v => Math.max(mT, Math.min(mT + pH, v));
  const band = (k1, k2, fill, o) => {
    const a = clamp(y(k2 * z.sd)), b = clamp(y(k1 * z.sd));
    return b - a > 1 ? `<rect x="${mL}" y="${a.toFixed(1)}" width="${pW}" height="${(b - a).toFixed(1)}" fill="${fill}" fill-opacity="${o}"/>` : "";
  };
  const zones = band(0.5, 99, "#fb7185", 0.15) + band(-99, -0.5, "#22d3ee", 0.15);

  const line = pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const areaUp = `${mL},${y0.toFixed(1)} ` + line + ` ${(mL + pW).toFixed(1)},${y0.toFixed(1)}`;

  let grid = "";
  for (const k of [-2, -1, 1, 2]) {
    const v = k * z.sd; if (Math.abs(v) > lim) continue;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 7"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="${F}">${k > 0 ? "+" : ""}${k}σ</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 58}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  const cx = x(t1), cy = y(pts.at(-1).v);
  const st = z.state;
  const pctTxt = z.pct != null ? `${ordinal(z.pct)} percentile of the last year` : "";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="aobg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0c1020"/><stop offset="100%" stop-color="#05050b"/></linearGradient>
<linearGradient id="aofill" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#fb7185" stop-opacity="0.42"/><stop offset="50%" stop-color="#fb7185" stop-opacity="0.04"/>
  <stop offset="50%" stop-color="#22d3ee" stop-opacity="0.04"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0.42"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#aobg)"/>
${brandStripe(H)}
<text x="60" y="60" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">PROJECT AEON — DEAR OR CHEAP IN SPX</text>
<text x="60" y="102" fill="#94a3b8" font-size="22" font-family="${F}">SPX6900 is the flat line. Above it an AEON costs more SPX than usual; below, less.</text>
<text x="60" y="150" fill="${st.c}" font-size="34" font-weight="700" font-family="${F}">${esc(`${fSpx(z.cur)} SPX per AEON — ${st.t} vs its own baseline`)}</text>
${zones}${grid}${xlab}
<polygon points="${areaUp}" fill="url(#aofill)"/>
<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="#f8fafc" stroke-width="2.6" stroke-opacity="0.92"/>
<text x="${mL + 16}" y="${(y0 + 30).toFixed(1)}" fill="#f8fafc" font-size="21" font-weight="700" font-family="${F}">${esc(`SPX baseline — ${fSpx(z.base)} SPX per AEON`)}</text>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="${st.c}" stroke="#05050b" stroke-width="3"/>
<text x="${(mL + pW - 16)}" y="${(mT + 34)}" text-anchor="end" fill="#fb7185" fill-opacity="0.85" font-size="21" font-weight="700" font-family="${F}">expensive vs SPX</text>
<text x="${(mL + pW - 16)}" y="${(mT + pH - 18)}" text-anchor="end" fill="#22d3ee" fill-opacity="0.85" font-size="21" font-weight="700" font-family="${F}">cheap vs SPX</text>
<text x="60" y="${H - 22}" fill="#6b7688" font-size="19" font-family="${F}">${esc(`floor priced in SPX6900 · baseline = trailing 365-day median · ${pctTxt}`)}</text>
</svg>`;
}

export function renderAeonSpxOscCard(market, opts = {}) {
  const svg = aeonSpxOscSvg(market, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
