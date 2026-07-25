// "SPX vs the Alt Market" over/under OSCILLATOR — SPX ÷ TOTAL3ES detrended into how far
// SPX sits above/below its NORMAL strength vs the alt sector. Flat 0 baseline = fair vs
// alts; the line deviates POSITIVE (rich/overbought vs alts) or NEGATIVE (cheap vs alts),
// with flat overbought (+1σ) / cheap (−1σ) bands. Zero is SPX's own trend, NOT parity —
// SPX structurally outperforms alts, so parity would never read "under". A relative-
// valuation read, NOT a signal. Data: bundled TOTAL3ES × our dense SPX.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { buildAltRainbow } from "../../src/alt-rainbow.js";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const RICH = "#f87171", CHEAP = "#38bdf8", MID = "#cbd5e1";

export function altOscSvg(stats, opts = {}) {
  const R = buildAltRainbow(stats?.history || []);
  if (!R || R.series.length < 100) return null;
  const { series, cur } = R;
  const t0 = series[0].ts, t1 = series.at(-1).ts;
  const zone = cur.z >= 1 ? "overbought vs alts" : cur.z <= -1 ? "cheap vs alts" : "fair vs alts";
  const zoneC = cur.z >= 1 ? RICH : cur.z <= -1 ? CHEAP : MID;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 110, mT = 156, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const x = ts => mL + ((ts - t0) / ((t1 - t0) || 1)) * pW;
  const zMax = Math.max(2.5, ...series.map(s => Math.abs(s.z))) * 1.06;
  const y = z => mT + ((zMax - z) / (2 * zMax)) * pH;
  const y0 = y(0);

  // area between the line and the 0 baseline: red above (rich), blue below (cheap)
  const xs = series.map(s => x(s.ts).toFixed(1));
  const redTop = series.map((s, i) => `${xs[i]},${y(Math.max(s.z, 0)).toFixed(1)}`);
  const blueBot = series.map((s, i) => `${xs[i]},${y(Math.min(s.z, 0)).toFixed(1)}`);
  const baseF = series.map((s, i) => `${xs[i]},${y0.toFixed(1)}`).reverse();
  const redArea = `<polygon points="${redTop.join(" ")} ${baseF.join(" ")}" fill="${RICH}" fill-opacity="0.28"/>`;
  const blueArea = `<polygon points="${series.map((s, i) => `${xs[i]},${y0.toFixed(1)}`).join(" ")} ${blueBot.reverse().join(" ")}" fill="${CHEAP}" fill-opacity="0.28"/>`;

  // vivid edge-bright zone shading beyond ±1σ: brightest at the extremes (top = rich,
  // bottom = cheap), fading toward the ±1σ band edge where the line lives.
  const zoneRect = (za, zb, grad) => `<rect x="${mL}" y="${y(zb).toFixed(1)}" width="${pW}" height="${(y(za) - y(zb)).toFixed(1)}" fill="url(#${grad})"/>`;
  const shade = zoneRect(1, zMax, "aoHot") + zoneRect(-zMax, -1, "aoCool");

  // left σ axis (bright, big) + faint gridlines; ±1σ drawn as the colored band lines below.
  let grid = "";
  for (let zi = -Math.floor(zMax); zi <= Math.floor(zMax); zi++) {
    const yy = y(zi).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${zi === 0 || Math.abs(zi) === 1 ? 0 : 0.10})"/>`
      + `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#e2e8f0" font-size="26" font-weight="600" text-anchor="end" font-family="sans-serif">${zi > 0 ? "+" + zi + "σ" : zi < 0 ? zi + "σ" : "0"}</text>`;
  }

  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#cbd5e1" font-size="26" font-weight="600" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }
  const bandLine = (z, c, txt, dash = "7 6") => `<line x1="${mL}" y1="${y(z).toFixed(1)}" x2="${W - mR}" y2="${y(z).toFixed(1)}" stroke="${c}" stroke-width="2.5" stroke-opacity="0.9" stroke-dasharray="${dash}"/><text x="${W - 8}" y="${(y(z) - 10).toFixed(1)}" fill="${c}" font-size="21" font-weight="800" text-anchor="end" font-family="sans-serif">${esc(txt)}</text>`;

  const line = series.map((s, i) => `${xs[i]},${y(s.z).toFixed(1)}`).join(" ");
  const curX = x(cur.ts), curY = y(cur.z);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="aobg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="aoHot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fb7185" stop-opacity="0.5"/><stop offset="100%" stop-color="#fb7185" stop-opacity="0.06"/></linearGradient>
<linearGradient id="aoCool" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.06"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0.5"/></linearGradient>
<filter id="aoglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#aobg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#e2e8f0" font-size="35" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 vs THE ALT MARKET</text>
<text x="60" y="90" fill="#94a3b8" font-size="21" font-family="sans-serif">Is SPX running hot or cheap vs every coin but BTC &amp; ETH? Above 0 = hot.</text>
<text x="60" y="130" fill="${zoneC}" font-size="27" font-weight="800" font-family="sans-serif">${esc("rich or cheap vs the alt sector — now " + zone)}</text>
${shade}${grid}${xlab}
${redArea}${blueArea}
<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="${MID}" stroke-width="2.5" stroke-opacity="0.95"/>
<text x="${W - 8}" y="${(y0 - 10).toFixed(1)}" fill="${MID}" font-size="21" font-weight="800" text-anchor="end" font-family="sans-serif">fair vs alts</text>
${bandLine(1, RICH, "overbought")}
${bandLine(-1, CHEAP, "cheap")}
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="7" stroke-opacity="0.14" stroke-linejoin="round" stroke-linecap="round" filter="url(#aoglow)"/>
<polyline points="${line}" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="9" fill="${zoneC}" stroke="#05050e" stroke-width="2"/>
<text x="${(curX - 16).toFixed(1)}" y="${(curY + 34).toFixed(1)}" fill="${zoneC}" font-size="22" font-weight="800" text-anchor="end" font-family="sans-serif">now</text>
<text x="60" y="${H - 20}" fill="#6b7688" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · vs TOTAL3ES (alt market ex-BTC/ETH/stables) · 0 = SPX's own trend vs alts")}</text>
</svg>`;
}

export function renderAltOscCard(stats, opts = {}) {
  const svg = altOscSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
