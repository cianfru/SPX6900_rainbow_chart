// "Holders across chains" reach card — SPX lives on Ethereum (native), Base and Solana
// (both bridged, e.g. Wormhole). By SUPPLY the bridged chains are only ~6%, but by
// HEADCOUNT they dwarf ETH: the community is several× the ~49.5k we usually post. This
// card tells that reach story — a big honest total (donut centre) + the per-chain split.
// Data-gated: needs the multi-chain snapshot columns (Base banks on the first cron;
// Solana once its key is set). Card writing stays MINIMAL — the tweet carries the copy.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fK = n => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));

const CHAINS = [
  { key: "eth", label: "Ethereum", sub: "native", c: "#8b9dfa", lite: "#c7d0ff" },
  { key: "base", label: "Base", sub: "bridged", c: "#3b82f6", lite: "#8fb6ff" },
  { key: "sol", label: "Solana", sub: "bridged", c: "#14f195", lite: "#7cffca" },
];

// Point on the donut circle at a given fraction of the way round (0 = 12 o'clock).
const pt = (cx, cy, r, frac) => {
  const a = frac * 2 * Math.PI - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

export function multichainSvg(stats, opts = {}) {
  const s = stats.supply;
  if (!s) return null;
  const counts = { eth: s.holders, base: s.holdersBase, sol: s.holdersSol };
  // Data-gate: need ETH + at least one bridged chain, else there's no cross-chain story.
  if (!(counts.eth > 0) || !(counts.base > 0 || counts.sol > 0)) return null;
  const rows = CHAINS.map(c => ({ ...c, n: counts[c.key] || 0 })).filter(r => r.n > 0);
  const total = rows.reduce((a, r) => a + r.n, 0);
  const mult = counts.eth ? total / counts.eth : 1;

  const W = opts.W ?? 1200, H = opts.H ?? 630;
  // Donut on the left, legend on the right.
  const cx = 360, cy = 348, rOut = 176, rIn = 104, rMid = (rOut + rIn) / 2, thick = rOut - rIn;

  // Donut arcs — a blurred colored glow underlay + the gradient-filled segment on top,
  // so each slice reads with depth. A dark track ring sits behind for a "channel" look.
  let glows = "", arcs = "", acc = 0;
  rows.forEach(r => {
    const f0 = acc / total, f1 = (acc + r.n) / total;
    const gap = 0.007;
    const [x0, y0] = pt(cx, cy, rMid, f0 + gap);
    const [x1, y1] = pt(cx, cy, rMid, f1 - gap);
    const large = (f1 - f0) > 0.5 ? 1 : 0;
    const d = `M${x0.toFixed(1)},${y0.toFixed(1)} A${rMid},${rMid} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
    glows += `<path d="${d}" fill="none" stroke="${r.c}" stroke-width="${thick + 4}" stroke-opacity="0.45" filter="url(#mcGlow)"/>`;
    arcs += `<path d="${d}" fill="none" stroke="url(#arc-${r.key})" stroke-width="${thick}"/>`;
    acc += r.n;
  });
  const track = `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="#0b1024" stroke-width="${thick + 10}" stroke-opacity="0.55"/>`;

  const totText = total >= 1000 ? "~" + fK(total) : String(total);
  const arcDefs = rows.map(r =>
    `<linearGradient id="arc-${r.key}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="${r.lite}"/><stop offset="100%" stop-color="${r.c}"/></linearGradient>`).join("");

  // Legend on the right — glowing swatch, chain, big count, sub · %.
  const lx = 650, lyTop = 196, rowH = 118;
  let legend = "";
  rows.forEach((r, i) => {
    const y = lyTop + rowH * i;
    legend += `<circle cx="${lx + 13}" cy="${y - 11}" r="15" fill="${r.c}" fill-opacity="0.55" filter="url(#mcGlow)"/>`;
    legend += `<rect x="${lx}" y="${y - 24}" width="27" height="27" rx="8" fill="url(#arc-${r.key})"/>`;
    legend += `<text x="${lx + 42}" y="${y - 2}" fill="#e6ebf5" font-size="30" font-weight="700" font-family="sans-serif">${r.label}</text>`;
    legend += `<text x="${W - 64}" y="${y - 2}" fill="#7c8aa3" font-size="25" font-family="sans-serif" text-anchor="end">${r.sub} · ${Math.round((r.n / total) * 100)}%</text>`;
    legend += `<text x="${lx + 42}" y="${y + 47}" fill="${r.lite}" font-size="49" font-weight="800" font-family="sans-serif">${r.n.toLocaleString()}</text>`;
    if (i < rows.length - 1) legend += `<line x1="${lx}" y1="${y + 68}" x2="${W - 64}" y2="${y + 68}" stroke="#ffffff" stroke-opacity="0.06"/>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="bgIndigo" cx="16%" cy="8%" r="60%"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.30"/><stop offset="70%" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
 <radialGradient id="bgBlue" cx="52%" cy="112%" r="65%"><stop offset="0%" stop-color="#2563eb" stop-opacity="0.24"/><stop offset="70%" stop-color="#2563eb" stop-opacity="0"/></radialGradient>
 <radialGradient id="bgTeal" cx="92%" cy="86%" r="60%"><stop offset="0%" stop-color="#14f195" stop-opacity="0.20"/><stop offset="70%" stop-color="#14f195" stop-opacity="0"/></radialGradient>
 <radialGradient id="spot" cx="30%" cy="55%" r="30%"><stop offset="0%" stop-color="#20264d" stop-opacity="0.65"/><stop offset="100%" stop-color="#20264d" stop-opacity="0"/></radialGradient>
 <radialGradient id="vig" cx="50%" cy="42%" r="78%"><stop offset="58%" stop-color="#05050e" stop-opacity="0"/><stop offset="100%" stop-color="#05050e" stop-opacity="0.55"/></radialGradient>
 <radialGradient id="hole" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#0a0f22" stop-opacity="0.9"/><stop offset="100%" stop-color="#0a0f22" stop-opacity="0"/></radialGradient>
 <linearGradient id="mcTot" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0%" stop-color="#a9b6ff"/><stop offset="52%" stop-color="#5b9bff"/><stop offset="100%" stop-color="#2ffbb0"/></linearGradient>
 <filter id="mcGlow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="9"/></filter>
 ${arcDefs}
</defs>
<rect width="${W}" height="${H}" fill="#05060f"/>
<rect width="${W}" height="${H}" fill="url(#bgIndigo)"/>
<rect width="${W}" height="${H}" fill="url(#bgBlue)"/>
<rect width="${W}" height="${H}" fill="url(#bgTeal)"/>
<rect width="${W}" height="${H}" fill="url(#spot)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<text x="64" y="74" fill="#eef2fb" font-size="33" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDERS ACROSS CHAINS</text>
${track}${glows}${arcs}
<circle cx="${cx}" cy="${cy}" r="${rIn}" fill="url(#hole)"/>
<text x="${cx}" y="${cy - 4}" fill="${'#0af'}" font-size="80" font-weight="800" font-family="sans-serif" text-anchor="middle" filter="url(#mcGlow)" opacity="0.35">${totText}</text>
<text x="${cx}" y="${cy - 4}" fill="url(#mcTot)" font-size="80" font-weight="800" font-family="sans-serif" text-anchor="middle" letter-spacing="-1">${totText}</text>
<text x="${cx}" y="${cy + 40}" fill="#aab6cf" font-size="26" font-family="sans-serif" text-anchor="middle">holders · ${mult.toFixed(1)}× ETH</text>
${legend}
<text x="64" y="${H - 22}" fill="#5a6478" font-size="17" font-family="sans-serif">spx6900rainbow.xyz · wallets across chains, not people · Base &amp; Solana are bridged</text>
</svg>`;
}

export function renderMultichainCard(stats, opts = {}) {
  const svg = multichainSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}

// Catmull-Rom → bezier smoothing (shared shape with the other trend cards).
const smooth = pts => {
  if (pts.length < 2) return pts.length ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
};

// HOLDER RACE BY CHAIN — three lines, each REBASED to 0% at its own first banked point,
// so the card reads as "% change in holders per chain over time." A foundation card:
// fills in as the daily snapshot banks multi-chain columns. Data-gated. Returns null
// until there's enough of a multi-chain history to draw.
export function chainRaceSvg(stats, opts = {}) {
  const raw = stats.supply?.chainSeries || [];
  if (raw.length < 6) return null; // needs ~a week+ of multi-chain snapshots

  // Per-chain rebased % series (each from its own first non-null value in the window).
  const series = CHAINS.map(c => {
    const pts = raw.map(r => ({ ts: r.ts, v: r[c.key] })).filter(p => p.v != null && p.v > 0);
    if (pts.length < 2) return null;
    const base = pts[0].v;
    return { ...c, pts: pts.map(p => ({ ts: p.ts, pct: p.v / base - 1 })), cur: pts.at(-1).v, curPct: pts.at(-1).v / base - 1 };
  }).filter(Boolean);
  if (series.length < 2) return null;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 78, mR = 176, mT = 116, mB = 68, pW = W - mL - mR, pH = H - mT - mB;
  const allTs = raw.map(r => r.ts), t0 = Math.min(...allTs), t1 = Math.max(...allTs);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  let lo = 0, hi = 0;
  for (const s of series) for (const p of s.pts) { lo = Math.min(lo, p.pct); hi = Math.max(hi, p.pct); }
  const pad = (hi - lo) * 0.18 || 0.05; lo -= pad; hi += pad;
  const y = v => mT + ((hi - v) / ((hi - lo) || 1)) * pH;
  const fPct = v => (v >= 0 ? "+" : "−") + Math.round(Math.abs(v) * 100) + "%";

  // gridlines at round % marks + zero baseline
  let grid = "";
  const span = hi - lo, stepPct = span > 1 ? 0.25 : span > 0.4 ? 0.1 : 0.05;
  for (let v = Math.ceil(lo / stepPct) * stepPct; v <= hi; v += stepPct) {
    const yy = y(v).toFixed(1), zero = Math.abs(v) < 1e-9;
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${zero ? 0.16 : 0.06})"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="21" text-anchor="end" font-family="sans-serif">${fPct(v)}</text>`;
  }
  let xlab = "";
  const step = Math.max(1, Math.ceil(raw.length / 5));
  for (let i = 0; i < raw.length; i += step)
    xlab += `<text x="${x(raw[i].ts).toFixed(1)}" y="${H - 38}" fill="#64748b" font-size="21" text-anchor="middle" font-family="sans-serif">${new Date(raw[i].ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>`;

  // avoid end-label overlap: sort by y and nudge apart
  const ends = series.map(s => ({ c: s.c, label: s.label, curPct: s.curPct, yy: y(s.pts.at(-1).pct) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 30) ends[i].yy = ends[i - 1].yy + 30;

  let lines = "", dots = "", endlab = "";
  for (const s of series) {
    const pts = s.pts.map(p => [x(p.ts), y(p.pct)]);
    lines += `<path d="${smooth(pts)}" fill="none" stroke="${s.c}" stroke-width="11" stroke-opacity="0.16" filter="url(#crG)"/>`;
    lines += `<path d="${smooth(pts)}" fill="none" stroke="${s.c}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const last = pts.at(-1);
    dots += `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7" fill="${s.c}" stroke="#05050e" stroke-width="2"/>`;
  }
  for (const e of ends) {
    endlab += `<text x="${W - mR + 14}" y="${(e.yy - 4).toFixed(1)}" fill="${e.c}" font-size="24" font-weight="800" font-family="sans-serif">${e.label}</text>`;
    endlab += `<text x="${W - mR + 14}" y="${(e.yy + 20).toFixed(1)}" fill="${e.c}" font-size="22" font-weight="700" font-family="sans-serif" fill-opacity="0.85">${fPct(e.curPct)}</text>`;
  }
  const ndays = Math.round((t1 - t0) / 86400000);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="crV" cx="20%" cy="0%" r="90%"><stop offset="0%" stop-color="#3b82f6" stop-opacity="0.10"/><stop offset="60%" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
 <filter id="crG" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#crV)"/>
<text x="${mL}" y="60" fill="#e2e8f0" font-size="32" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDER GROWTH BY CHAIN</text>
<text x="${mL}" y="94" fill="#94a3b8" font-size="22" font-family="sans-serif">% change in holders per chain over ~${ndays}d · each line rebased to its start</text>
${grid}${xlab}
${lines}${dots}${endlab}
<text x="${mL}" y="${H - 14}" fill="#475569" font-size="16" font-family="sans-serif">spx6900rainbow.xyz · wallets per chain, not people · Base &amp; Solana are bridged</text>
</svg>`;
}

export function renderChainRaceCard(stats, opts = {}) {
  const svg = chainRaceSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
