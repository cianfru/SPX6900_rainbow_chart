// "WHEN THE WHALES BOUGHT" — every wallet ≥100k SPX as a glowing orb sitting on the SPX price curve
// at the point it bought (coin-weighted entry date × average price paid), sized by its bag, green if
// in profit / red if underwater. The reveal jumps out: a bright red swarm up near the 2025 highs
// (bought high, holding underwater) and a few lonely green giants down at the launch lows. Reads the
// precomputed public/whale-entry.json (built off the timeline). See src/whale-entry.js for caveats.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

let _cache;
export function whaleEntryStats() {
  if (_cache !== undefined) return _cache;
  try {
    const d = JSON.parse(readFileSync(new URL("../../public/whale-entry.json", import.meta.url), "utf8"));
    if (!d?.whales?.length || !d?.curve?.length) return (_cache = null);
    return (_cache = d);
  } catch { return (_cache = null); }
}

export function whaleEntrySvg(s, opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 40, mT = 172, mB = 74;
  const pW = W - mL - mR, pH = H - mT - mB;

  // LIVE price (from today's snapshot) wins over the frozen JSON one, so the "today" line + green/red
  // split never go stale between the daily data rebuilds — the card is post-ready whenever.
  const price = (opts.price && opts.price > 0) ? opts.price : s.price;
  const pctProfit = Math.round(100 * s.whales.filter(w => w.cost < price).length / s.whales.length);

  // axes — x is time (launch → now), y is price on a log scale spanning the launch lows to above the ATH.
  const t0 = s.launch, t1 = s.now, span = Math.max(1, t1 - t0);
  const pMin = 0.001, pMax = 2.6, lgMin = Math.log10(pMin), lgMax = Math.log10(pMax);
  const X = t => mL + ((t - t0) / span) * pW;
  const Y = p => { const lg = Math.log10(Math.max(pMin, Math.min(pMax, p))); return mT + pH - ((lg - lgMin) / (lgMax - lgMin)) * pH; };

  // price curve
  let curve = "";
  s.curve.forEach(([t, p], i) => { curve += (i ? "L" : "M") + X(t).toFixed(1) + "," + Y(p).toFixed(1) + " "; });

  // bubbles — biggest first so the little bright ones sit on top; radius ∝ √bag. A crisp bright core
  // on each so individual whales still read inside the glow cloud.
  const maxBag = Math.max(...s.whales.map(w => w.bag));
  const RMAX = 34, RMIN = 2.8;
  let orbs = "", cores = "";
  for (const w of s.whales) {
    const r = Math.max(RMIN, Math.sqrt(w.bag / maxBag) * RMAX);
    const cx = X(w.t).toFixed(1), cy = Y(w.cost).toFixed(1);
    orbs += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="url(#${w.cost < price ? "gU" : "gD"})"/>`;
    cores += `<circle cx="${cx}" cy="${cy}" r="${Math.max(1.1, r * 0.28).toFixed(1)}" fill="${w.cost < price ? "#c9ffe0" : "#ffd6de"}" opacity="0.85"/>`;
  }

  // year gridlines on x
  let xg = "";
  for (let y = 2024; y <= new Date(t1).getUTCFullYear(); y++) {
    const t = Date.parse(`${y}-01-01`); if (t < t0 || t > t1) continue;
    xg += `<line x1="${X(t).toFixed(1)}" y1="${mT}" x2="${X(t).toFixed(1)}" y2="${mT + pH}" stroke="#1c2740" stroke-width="1"/>`
      + `<text x="${X(t).toFixed(1)}" y="${(mT + pH + 26).toFixed(1)}" fill="#8593a8" font-size="18" text-anchor="middle" font-family="sans-serif">${y}</text>`;
  }
  // price gridlines on y
  let yg = "";
  for (const p of [0.01, 0.1, 1]) {
    yg += `<line x1="${mL}" y1="${Y(p).toFixed(1)}" x2="${mL + pW}" y2="${Y(p).toFixed(1)}" stroke="#141d30" stroke-width="1"/>`
      + `<text x="${(mL - 10).toFixed(1)}" y="${(Y(p) + 5).toFixed(1)}" fill="#8593a8" font-size="17" text-anchor="end" font-family="sans-serif">$${p < 1 ? p : p.toFixed(0)}</text>`;
  }
  // "today" line — label parked at the LEFT end (the launch-era zone is empty there, so it stays legible)
  const yNow = Y(price);
  const todayLine = `<line x1="${mL}" y1="${yNow.toFixed(1)}" x2="${mL + pW}" y2="${yNow.toFixed(1)}" stroke="#5eead4" stroke-width="1.6" stroke-dasharray="7 5" opacity="0.85"/>`
    + `<rect x="${(mL + 8).toFixed(1)}" y="${(yNow - 30).toFixed(1)}" width="330" height="24" rx="6" fill="#06121a" opacity="0.82"/>`
    + `<text x="${(mL + 18).toFixed(1)}" y="${(yNow - 13).toFixed(1)}" fill="#5eead4" font-size="16" font-weight="700" font-family="sans-serif">today $${price.toFixed(2)} — below this line = in profit</text>`;

  const hero = `${s.pctLate.toFixed(0)}% built their bags after year one — most near the 2025 highs`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="webg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0c17"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
  <radialGradient id="gU" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#8bf6b4" stop-opacity="0.9"/><stop offset="42%" stop-color="#22c55e" stop-opacity="0.5"/><stop offset="100%" stop-color="#22c55e" stop-opacity="0"/></radialGradient>
  <radialGradient id="gD" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffb4c2" stop-opacity="0.9"/><stop offset="42%" stop-color="#f43f5e" stop-opacity="0.5"/><stop offset="100%" stop-color="#f43f5e" stop-opacity="0"/></radialGradient>
  <linearGradient id="pl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#38bdf8"/><stop offset="55%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#f0abfc"/></linearGradient>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#webg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="92" y="58" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">WHEN THE WHALES BOUGHT</text>
<text x="92" y="102" fill="#22d3ee" font-size="29" font-weight="800" font-family="sans-serif">${esc(hero)}</text>
<text x="92" y="140" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`Every wallet ≥100k SPX, placed where it bought · bubble = bag size · ${s.total.toLocaleString()} whales · ${pctProfit}% in profit`)}</text>
${xg}${yg}
<path d="${curve}" fill="none" stroke="url(#pl)" stroke-width="4" filter="url(#glow)" opacity="0.5"/>
${todayLine}
<g filter="url(#glow)">${orbs}</g>
<g>${cores}</g>
<path d="${curve}" fill="none" stroke="#dbe4ff" stroke-width="1.4" opacity="0.55"/>
<circle cx="112" cy="${H - 30}" r="7" fill="url(#gU)"/><text x="126" y="${H - 25}" fill="#cbd5e1" font-size="17" font-family="sans-serif">in profit</text>
<circle cx="238" cy="${H - 30}" r="7" fill="url(#gD)"/><text x="252" y="${H - 25}" fill="#cbd5e1" font-size="17" font-family="sans-serif">underwater</text>
<text x="${W - 40}" y="${H - 25}" fill="#7c8a9e" font-size="15" text-anchor="end" font-family="sans-serif">spx6900rainbow.xyz · avg-cost, ETH · survivors only · not advice</text>
</svg>`;
}

export function renderWhaleEntryCard(stats, opts = {}) {
  const s = whaleEntryStats();
  // live spot from today's snapshot → the "today" line + green/red split never go stale between rebuilds.
  const price = stats && stats.price > 0 ? stats.price : undefined;
  return s ? png(whaleEntrySvg(s, { W: opts.W, H: opts.H, price }), opts.W ?? 1200) : null;
}
