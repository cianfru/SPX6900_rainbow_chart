// EXPERIMENT — "SPX6900 × BITCOIN" resemblance card. In the Dune correlation study, the
// memecoin BITCOIN (HPOS10I) had the highest daily-returns correlation with SPX of any ETH
// token (~0.5). This renders that: a dual-axis overlay of the two price paths (co-movement
// visible in the SHAPES) + a 30-day rolling-correlation strip that proves it stays positive.
// The honest twist: they share a daily heartbeat yet went opposite ways — SPX +147×, BITCOIN
// −88% since SPX launched. A for-fun statistical curiosity, NOT a signal. Data: SPX_DAILY +
// BITCOIN_MEME bundles (no live fetch).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { SPX_DAILY } from "../../src/spx-daily.js";
import { BITCOIN_MEME } from "../../src/bitcoin-meme.js";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const SPX_C = "#5eead4", BTC_C = "#fb923c", GRN = "#4ade80", RED = "#f87171";

const pearson = (a, b) => {
  const n = a.length; if (n < 2) return 0;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let nu = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; nu += x * y; da += x * x; db += y * y; }
  return da > 0 && db > 0 ? nu / Math.sqrt(da * db) : 0;
};

// Shared compute (memoised — the bundles are static). One source of truth for the
// SVG AND the tweet copy so the card's numbers and the post can never drift.
let _cache = null;
export function spxBitcoinStats() {
  if (_cache) return _cache;
  const spx = new Map(SPX_DAILY), btc = new Map(BITCOIN_MEME);
  const days = [...spx.keys()].filter(d => btc.has(d)).sort();
  if (days.length < 200) return (_cache = null);
  const sV = days.map(d => spx.get(d)), bV = days.map(d => btc.get(d));
  const ts = days.map(d => Date.parse(d + "T00:00:00Z"));
  const rs = [], rb = [];
  for (let i = 1; i < days.length; i++) { rs.push(Math.log(sV[i] / sV[i - 1])); rb.push(Math.log(bV[i] / bV[i - 1])); }
  const r = pearson(rs, rb);
  const sameDir = Math.round(100 * rs.filter((_, i) => Math.sign(rs[i]) === Math.sign(rb[i])).length / rs.length);
  const W_ROLL = 30, roll = []; // aligned to days[i] for i>=W_ROLL
  for (let i = W_ROLL; i < rs.length; i++) roll.push({ ts: ts[i + 1], c: pearson(rs.slice(i - W_ROLL, i), rb.slice(i - W_ROLL, i)) });
  const rollPos = Math.round(100 * roll.filter(x => x.c > 0).length / roll.length);
  return (_cache = { days, ts, sV, bV, r, sameDir, roll, rollPos, sMult: sV.at(-1) / sV[0], bMult: bV.at(-1) / bV[0] });
}

export function spxBitcoinSvg(opts = {}) {
  const s = spxBitcoinStats();
  if (!s) return null;
  const { ts, sV, bV, r, sameDir, roll, rollPos, sMult, bMult } = s;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 96;
  const narrow = W < 1160;            // portrait/narrow presets → smaller header + tighter labels
  const heroFs = narrow ? 23 : 27;
  const t0 = ts[0], t1 = ts.at(-1);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * (W - mL - mR);

  // main overlay panel (dual log axis) + rolling-corr strip beneath — all derived
  // from H so the card fills any aspect ratio (the control panel renders it square /
  // portrait / wide). Header sits at the top; the panel + strip stretch to fill.
  const pT = 152;                       // main panel top (below the hero line)
  const rB = H - 78;                    // rolling-strip bottom (above the year labels)
  const rT = rB - Math.min(150, Math.max(84, (H - pT) * 0.20)); // strip height scales, clamped
  const pB = rT - 34;                   // main panel bottom (gap for the strip title)
  const yearY = rB + 22, footY = H - 16;
  const logScale = (arr, top, bot) => { const lo = Math.log(Math.min(...arr)), hi = Math.log(Math.max(...arr)); return v => top + ((hi - Math.log(v)) / ((hi - lo) || 1)) * (bot - top); };
  const yS = logScale(sV, pT, pB), yB = logScale(bV, pT, pB);
  const lineOf = (vals, yf) => vals.map((v, i) => `${x(ts[i]).toFixed(1)},${yf(v).toFixed(1)}`).join(" ");

  // rolling-corr strip: baseline 0, range [-0.4, 1]
  const cLo = -0.4, cHi = 1, yC = c => rT + ((cHi - Math.max(cLo, Math.min(cHi, c))) / (cHi - cLo)) * (rB - rT);
  const yC0 = yC(0);
  const rollLine = roll.map(p => `${x(p.ts).toFixed(1)},${yC(p.c).toFixed(1)}`).join(" ");
  const rollArea = `${x(roll[0].ts).toFixed(1)},${yC0.toFixed(1)} ${rollLine} ${x(roll.at(-1).ts).toFixed(1)},${yC0.toFixed(1)}`;

  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${yearY}" fill="#8b95a7" font-size="20" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sbbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="sbroll" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${GRN}" stop-opacity="0.42"/><stop offset="100%" stop-color="${GRN}" stop-opacity="0.02"/></linearGradient>
<filter id="sbglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sbbg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#e2e8f0" font-size="36" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 <tspan fill="#64748b">×</tspan> BITCOIN</text>
<text x="60" y="100" fill="#f8fafc" font-size="${heroFs}" font-weight="800" font-family="sans-serif">Same daily heartbeat — <tspan fill="${GRN}">${sameDir}% of days move together</tspan> — opposite fate.</text>

<polyline points="${lineOf(bV, yB)}" fill="none" stroke="${BTC_C}" stroke-width="2.4" stroke-opacity="0.9" stroke-linejoin="round"/>
<polyline points="${lineOf(sV, yS)}" fill="none" stroke="${SPX_C}" stroke-width="4.2" stroke-linejoin="round"/>

<!-- legend (top-right, inside panel where both lines sit low) -->
<line x1="${W - mR - 246}" y1="${pT + 18}" x2="${W - mR - 220}" y2="${pT + 18}" stroke="${SPX_C}" stroke-width="4"/><text x="${W - mR - 214}" y="${pT + 24}" fill="${SPX_C}" font-size="18" font-weight="700" font-family="sans-serif">SPX6900</text>
<line x1="${W - mR - 116}" y1="${pT + 18}" x2="${W - mR - 90}" y2="${pT + 18}" stroke="${BTC_C}" stroke-width="4"/><text x="${W - mR - 84}" y="${pT + 24}" fill="${BTC_C}" font-size="18" font-weight="700" font-family="sans-serif">BITCOIN</text>

<!-- rolling-correlation strip -->
<text x="60" y="${rT - 8}" fill="#cbd5e1" font-size="17" font-weight="700" font-family="sans-serif">30-day correlation <tspan fill="#64748b" font-weight="400">— positive ${rollPos}% of the time</tspan></text>
<line x1="${mL}" y1="${yC0.toFixed(1)}" x2="${W - mR}" y2="${yC0.toFixed(1)}" stroke="#64748b" stroke-width="1.3" stroke-dasharray="4 5"/>
<text x="${W - mR + 8}" y="${(yC0 + 5).toFixed(1)}" fill="#64748b" font-size="15" font-family="sans-serif">0</text>
<polygon points="${rollArea}" fill="url(#sbroll)"/>
<polyline points="${rollLine}" fill="none" stroke="${GRN}" stroke-width="2.2" stroke-linejoin="round"/>
${xlab}

<!-- divergence callout (right end of the strip-title line) -->
<text x="${W - mR}" y="${rT - 8}" text-anchor="end" fill="#8b95a7" font-size="18" font-family="sans-serif">Since launch: <tspan fill="${SPX_C}" font-weight="700">SPX +${Math.round(sMult)}×</tspan> · <tspan fill="${RED}" font-weight="700">BITCOIN ${Math.round((bMult - 1) * 100)}%</tspan></text>
<text x="60" y="${footY}" fill="#5b6577" font-size="15" font-family="sans-serif">${esc("spx6900rainbow.xyz · daily-returns correlation " + r.toFixed(2) + ", Aug 2023–Jul 2026 · a for-fun curiosity, not a signal")}</text>
</svg>`;
}

export function renderSpxBitcoinCard(opts = {}) {
  const svg = spxBitcoinSvg(opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
