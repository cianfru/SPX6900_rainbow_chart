// "NUPL" card — Net Unrealized Profit/Loss over time, the classic on-chain valuation
// oscillator (Glassnode/ITC family). NUPL = (market cap − realized cap) / market cap =
// 1 − realized price / price = 1 − 1/MVRV — so it's a pure transform of data we already
// have (stats.mvrvSeries), NO new Dune, NO paywall. Positive = holders sit on unrealized
// PROFIT, negative = unrealized LOSS. Standard sentiment zones (capitulation → hope →
// optimism → belief → euphoria). SPX is more volatile than BTC so it overshoots the
// classic bands — the display clips the extremes, the hero shows the true value. A
// valuation POSITION, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fYr = t => new Date(t).getUTCFullYear();
// zone by NUPL value: [threshold, label, colour]
const ZONES = [
  [0.75, "euphoria", "#f87171"],
  [0.5, "belief", "#fb923c"],
  [0.25, "optimism", "#fbbf24"],
  [0, "hope", "#38bdf8"],
  [-Infinity, "capitulation", "#6366f1"],
];
const zoneOf = n => ZONES.find(z => n >= z[0]);

export function nuplSvg(stats, opts = {}) {
  const raw = (stats.mvrvSeries || []).filter(r => r.mvrv > 0 && Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  if (raw.length < 100) return null;
  const pts = raw.map(r => ({ ts: r.ts, nupl: 1 - 1 / r.mvrv }));
  const cur = pts.at(-1), curN = cur.nupl, [, zLabel, zCol] = zoneOf(curN);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 118, mT = 148, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = pts[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const yMin = -1, yMax = 0.95; // clip the display; SPX overshoots (hero shows true value)
  const y = v => mT + ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * pH;

  // sentiment zone bands (fixed thresholds)
  const band = (a, b, c) => `<rect x="${mL}" y="${y(b).toFixed(1)}" width="${pW}" height="${(y(a) - y(b)).toFixed(1)}" fill="${c}" fill-opacity="0.16"/>`;
  const zones = band(0.75, 0.95, "#f87171") + band(0.5, 0.75, "#fb923c") + band(0.25, 0.5, "#fbbf24") + band(0, 0.25, "#38bdf8") + band(-1, 0, "#6366f1");
  const zlab = (a, b, t, c) => `<text x="${W - mR + 8}" y="${((y(a) + y(b)) / 2 + 6).toFixed(1)}" fill="${c}" font-size="17" font-weight="700" font-family="sans-serif">${esc(t)}</text>`;
  const labels = zlab(0.75, 0.95, "euphoria", "#fca5a5") + zlab(0.5, 0.75, "belief", "#fdba74") + zlab(0.25, 0.5, "optimism", "#fcd34d") + zlab(0, 0.25, "hope", "#7dd3fc") + zlab(-1, 0, "capitulation", "#a5b4fc");

  let grid = "";
  for (const v of [-1, -0.5, 0, 0.5]) {
    const yy = y(v).toFixed(1);
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#a3aec0" font-size="22" text-anchor="end" font-family="sans-serif">${v > 0 ? "+" : ""}${v}</text>`;
  }
  let xlab = "";
  for (let yr = fYr(t0); yr <= fYr(t1); yr++) { const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue; xlab += `<text x="${x(t).toFixed(1)}" y="${H - 48}" fill="#a3aec0" font-size="24" text-anchor="middle" font-family="sans-serif">${yr}</text>`; }

  const line = pts.map(p => `${x(p.ts).toFixed(1)},${y(p.nupl).toFixed(1)}`).join(" ");
  const y0 = y(0).toFixed(1);
  const curX = x(cur.ts), curY = y(curN);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="nbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<filter id="nglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#nbg)"/>
<text x="60" y="52" fill="#e2e8f0" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — NUPL</text>
<text x="60" y="84" fill="#94a3b8" font-size="21" font-family="sans-serif">Are holders sitting on profit or loss? Below 0 = underwater.</text>
<text x="60" y="122" fill="${zCol}" font-size="27" font-weight="800" font-family="sans-serif">${curN >= 0 ? "+" : ""}${curN.toFixed(2)} · ${esc(zLabel)} — ${curN >= 0 ? "holders sit on unrealized profit" : "holders are underwater"}</text>
${zones}${labels}${grid}${xlab}
<line x1="${mL}" y1="${y0}" x2="${W - mR}" y2="${y0}" stroke="#e2e8f0" stroke-width="2" stroke-opacity="0.8" stroke-dasharray="6 5"/>
<text x="${mL + 8}" y="${(+y0 - 9).toFixed(1)}" fill="#cbd5e1" font-size="17" font-weight="700" font-family="sans-serif">break-even (0)</text>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="8" stroke-opacity="0.16" stroke-linejoin="round" filter="url(#nglow)"/>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${zCol}" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY + (curN < -0.4 ? -16 : 34)).toFixed(1)}" fill="${zCol}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="17" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · NUPL = 1 − realized price ÷ price · on-chain · reproducible")}</text>
</svg>`;
}

export function renderNuplCard(stats, opts = {}) {
  const svg = nuplSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
