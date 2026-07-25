// "Pi Cycle Ratio" card — the continuous 111-day / (350-day × 2) MA gauge from Bitcoin's
// Pi Cycle Top indicator (350/111 ≈ π), applied to SPX6900 for CONTEXT. We deliberately
// use the RATIO as a descriptive extension/accumulation gauge, NOT the binary "top in 3
// days" cross (overfit/borrowed for a ~2yr memecoin). >1 = top zone; <0.5 = historically
// an accumulation zone. The honest read today: it ran hot above 1 at SPX's 2025 top and
// has since fallen deep into accumulation — a rhyme with the MVRV-vs-BTC finding.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { piCycleRatio, piCycleState } from "../../src/models.js";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMon = t => new Date(t).toLocaleString("en-US", { month: "short", year: "2-digit" });

export function piCycleSvg(stats, opts = {}) {
  const pc = piCycleRatio(stats.drawn || []);
  if (pc.rows.length < 60) return null; // needs a real stretch of 350-DMA history
  const rows = pc.rows, cur = pc.cur, peak = pc.peak, z = pc.zones, st = piCycleState(cur.ratio, z);
  const sorted = rows.map(r => r.ratio).sort((a, b) => a - b);
  const pct = Math.round(sorted.filter(v => v <= cur.ratio).length / sorted.length * 100);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 106, mR = 184, mT = 140, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].ts, t1 = rows.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const ymax = Math.max(z.top * 1.08, peak.ratio * 1.05), ymin = 0;
  const y = v => mT + (1 - (v - ymin) / (ymax - ymin)) * pH;
  const line = rows.map(r => `${x(r.ts).toFixed(1)},${y(r.ratio).toFixed(1)}`).join(" ");
  const area = `${x(rows[0].ts).toFixed(1)},${(mT + pH).toFixed(1)} ${line} ${x(rows.at(-1).ts).toFixed(1)},${(mT + pH).toFixed(1)}`;

  // Zones: top = SPX-calibrated (p90); accumulation (0.4–0.5) + deep (<0.4) = fixed BTC levels
  // that transfer cleanly to SPX; the 0.5→top middle stays neutral.
  // Discrete valuation bands — vivid colours at ~0.26 opacity so they POP (was a dim 0.13);
  // the neutral 0.5→top middle stays faint so it reads as "no man's land".
  const band = (v1, v2, c, o = 0.26) => `<rect x="${mL}" y="${y(v2).toFixed(1)}" width="${pW}" height="${(y(v1) - y(v2)).toFixed(1)}" fill="${c}" fill-opacity="${o}"/>`;
  const zones = band(z.top, ymax, "#fb7185") + band(z.accum, z.top, "#64748b", 0.06) + band(z.deep, z.accum, "#38bdf8") + band(ymin, z.deep, "#4ade80");
  let gy = "";
  for (const v of [0.2, 0.4, 0.5, 0.75, 1, 1.25, 1.5].filter(v => v <= ymax)) {
    const yy = y(v).toFixed(1);
    gy += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.12)"/><text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#e2e8f0" font-size="25" font-weight="600" text-anchor="end" font-family="sans-serif">${v.toFixed(2)}</text>`;
  }
  let gx = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) for (const mo of [0, 6]) {
    const t = Date.UTC(yr, mo, 1); if (t < t0 || t > t1) continue;
    gx += `<text x="${x(t).toFixed(1)}" y="${H - 40}" fill="#cbd5e1" font-size="23" font-weight="600" text-anchor="middle" font-family="sans-serif">${fMon(t)}</text>`;
  }
  const thr = (v, c, lab) => `<line x1="${mL}" y1="${y(v).toFixed(1)}" x2="${W - mR}" y2="${y(v).toFixed(1)}" stroke="${c}" stroke-width="1.8" stroke-dasharray="6 4"/>`
    + `<text x="${W - mR - 6}" y="${(y(v) - 10).toFixed(1)}" fill="${c}" font-size="20" font-weight="700" text-anchor="end" font-family="sans-serif">${lab}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <linearGradient id="pcf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a78bfa" stop-opacity="0.28"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>
 <filter id="pcg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
${brandStripe(H)}
<text x="60" y="52" fill="#e2e8f0" font-size="33" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — PI CYCLE RATIO</text>
<text x="60" y="88" fill="#94a3b8" font-size="21" font-family="sans-serif">Stretched above its trend, or quietly building a base? A Bitcoin gauge, for context.</text>
<text x="60" y="122" fill="${st.color}" font-size="25" font-weight="800" font-family="sans-serif">${cur.ratio.toFixed(2)} — ${st.label}</text>
<text x="${W - 40}" y="58" fill="${st.color}" font-size="40" font-weight="800" text-anchor="end" font-family="sans-serif">${cur.ratio.toFixed(2)}</text>
<text x="${W - 40}" y="90" fill="#94a3b8" font-size="19" font-family="sans-serif" text-anchor="end">${pct}th %ile</text>
${zones}${gy}${gx}
<line x1="${mL}" y1="${y(z.btcTop).toFixed(1)}" x2="${W - mR}" y2="${y(z.btcTop).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3 5"/><text x="${W - mR - 6}" y="${(y(z.btcTop) - 9).toFixed(1)}" fill="#cbd5e1" font-size="18" font-weight="600" text-anchor="end" font-family="sans-serif">Bitcoin's top ▸ 1.0</text>
${thr(z.top, "#f87171", `SPX top ▸ ${z.top.toFixed(2)}`)}
${thr(z.accum, "#38bdf8", "accumulation ▸ 0.5")}
<polygon points="${area}" fill="url(#pcf)"/>
<polyline points="${line}" fill="none" stroke="#a78bfa" stroke-width="10" stroke-opacity="0.16" filter="url(#pcg)"/>
<polyline points="${line}" fill="none" stroke="#a78bfa" stroke-width="4.5" stroke-linejoin="round"/>
<circle cx="${x(peak.ts).toFixed(1)}" cy="${y(peak.ratio).toFixed(1)}" r="7" fill="#fb7185"/>
<text x="${x(peak.ts).toFixed(1)}" y="${(y(peak.ratio) - 20).toFixed(1)}" fill="#fda4af" font-size="19" font-weight="700" text-anchor="middle" font-family="sans-serif">peak ${peak.ratio.toFixed(2)} · ${fMon(peak.ts)}</text>
<circle cx="${x(cur.ts).toFixed(1)}" cy="${y(cur.ratio).toFixed(1)}" r="8" fill="${st.color}" stroke="#05050e" stroke-width="2"/>
<text x="60" y="${H - 16}" fill="#64748b" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · a Bitcoin indicator applied to SPX, for context · not financial advice")}</text>
</svg>`;
}

export function renderPiCycleCard(stats, opts = {}) {
  const svg = piCycleSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
