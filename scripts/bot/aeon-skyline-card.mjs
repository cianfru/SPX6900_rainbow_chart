// PROJECT AEON — static "Holder Skyline" card. A postable isometric snapshot of the 3D
// skyline (which is WebGL and can't rasterize via resvg): one tower per wallet, height =
// AEON held (+ SPX held, if present) × how long held, colour amber (newer) → cyan (OG).
// Champion crowned. Data: public/aeon-onchain.json → holders[{a,n,days,spx?}].
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonHeader } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
// amber (#f59e0b) → teal (#22d3ee) lerp by t
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = t => `rgb(${lerp(245, 34, t)},${lerp(158, 211, t)},${lerp(11, 238, t)})`;
const shade = (rgb, f) => rgb.replace(/[\d]+/g, n => Math.round(Math.min(255, +n * f)));

// square spiral integer cells, index 0 at centre (tallest in the middle)
function spiral(n) {
  const pts = []; let x = 0, z = 0, dx = 0, dz = -1;
  for (let i = 0; i < n; i++) { pts.push({ x, z }); if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) { const t = dx; dx = -dz; dz = t; } x += dx; z += dz; }
  return pts;
}

export function aeonSkylineSvg(data, opts = {}) {
  const holders = (data.holders || []).filter(h => h.a && h.n > 0);
  if (holders.length < 8) return null;
  const maxN = Math.max(...holders.map(h => h.n), 1);
  const maxSpx = Math.max(...holders.map(h => h.spx || 0), 0);
  const maxDays = Math.max(...holders.map(h => h.days), 1);
  const units = h => h.n + (maxSpx > 0 ? (h.spx || 0) / maxSpx * maxN : 0);
  const score = h => units(h) * (0.45 + 0.55 * (h.days / maxDays));
  // 81 towers is a 9x9 diamond — about half the card wide, which is why this read as a
  // small object floating in an empty frame rather than a skyline. The live 3D chart
  // draws up to 500 wallets; 289 (a 17x17 diamond) fills the canvas at the same tower
  // size and is as close to it as an isometric still gets.
  const H = holders.slice().sort((a, b) => score(b) - score(a)).slice(0, Math.min(holders.length, 289));
  const maxScore = Math.max(...H.map(score), 1);
  const champ = H[0], both = holders.filter(h => h.spx > 0).length;

  const W = opts.W ?? 1080, HT = opts.H ?? 1080;
  // Iso cell scaled to the actual diamond so the field fills the frame whatever the
  // tower count: the widest screen span is (2 * ring) cells across each diagonal.
  const ring = Math.ceil(Math.sqrt(H.length) / 2);
  const A = Math.max(10, Math.min(34, (W * 0.88) / (4 * ring)));   // iso half-width
  const B = A * 0.55;                                              // quarter-depth
  const MAXH = HT * 0.24;                                          // tallest tower px
  // Height is on a SQUARE-ROOT scale, and the card says so. Linear — what the live 3D
  // chart uses — is unreadable as a still: one wallet holds 148 AEON against a median of
  // one, so every tower but a handful collapses to the floor and the card reads as a
  // tiled plaza rather than a skyline. Orbiting hides that in 3D; a fixed camera cannot.
  const SY = MAXH / Math.sqrt(maxScore);
  const hOf = h => Math.max(7, Math.sqrt(score(h)) * SY);
  const cells = spiral(H.length);
  const cx = W / 2, cy = HT * 0.62;                 // floor centre

  // build towers with projected floor point + height, sort back→front for painter's order
  const towers = H.map((h, i) => {
    const gx = cells[i].x, gz = cells[i].z;
    return { h, sx: cx + (gx - gz) * A, sy: cy + (gx + gz) * B, ht: hOf(h), depth: gx + gz, col: mix(h.days / maxDays), champ: i === 0 };
  }).sort((a, b) => a.depth - b.depth);

  const box = t => {
    const { sx, sy, ht, col } = t;
    const N = `${sx},${sy - B - ht}`, E = `${sx + A},${sy - ht}`, S = `${sx},${sy + B - ht}`, Wp = `${sx - A},${sy - ht}`;
    const Sf = `${sx},${sy + B}`, Ef = `${sx + A},${sy}`, Wf = `${sx - A},${sy}`;
    return (
      `<polygon points="${Wf} ${Sf} ${S} ${Wp}" fill="${shade(col, 0.5)}"/>` +      // left face
      `<polygon points="${Sf} ${Ef} ${E} ${S}" fill="${shade(col, 0.72)}"/>` +      // right face
      `<polygon points="${N} ${E} ${S} ${Wp}" fill="${col}" stroke="#05050e" stroke-width="0.5"/>` + // top
      (t.champ ? `<text x="${sx}" y="${(sy - B - ht - 14)}" fill="#fde68a" font-size="30" text-anchor="middle" font-family="${F}">★</text>` : "")
    );
  };

  const fmtSpx = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : "" + v;
  return `<svg width="${W}" height="${HT}" viewBox="0 0 ${W} ${HT}" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="skg" cx="50%" cy="58%" r="72%"><stop offset="0%" stop-color="#101a2e"/><stop offset="100%" stop-color="#05060d"/></radialGradient>
<radialGradient id="skgC" cx="20%" cy="14%" r="60%"><stop offset="0%" stop-color="#22d3ee" stop-opacity="0.22"/><stop offset="60%" stop-color="#22d3ee" stop-opacity="0.04"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<radialGradient id="skgA" cx="86%" cy="90%" r="58%"><stop offset="0%" stop-color="#f59e0b" stop-opacity="0.2"/><stop offset="60%" stop-color="#f59e0b" stop-opacity="0.03"/><stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${HT}" fill="url(#skg)"/>
<rect width="${W}" height="${HT}" fill="url(#skgC)"/>
<rect width="${W}" height="${HT}" fill="url(#skgA)"/>
${aeonHeader("PROJECT AEON — THE HOLDER SKYLINE", maxSpx > 0 ? "One tower per wallet — height = AEON + SPX held, × how long held (√ scale)." : "One tower per wallet — height = AEON held, × how long held (√ scale).", null, "#5eead4", F)}
${towers.map(box).join("")}
<text x="60" y="${HT - 92}" fill="#cbd5e1" font-size="22" font-family="${F}">★ Top holder ${short(champ.a)} — ${champ.n} AEON${champ.spx ? " · " + fmtSpx(champ.spx) + " SPX" : ""}, held ${champ.days}d</text>
<text x="60" y="${HT - 58}" fill="#94a3b8" font-size="20" font-family="${F}">${esc(maxSpx > 0 ? `${both} of the top wallets hold both AEON and SPX6900.` : `${holders.length} holders, reconstructed on-chain.`)}</text>
<rect x="60" y="${HT - 34}" width="14" height="14" rx="3" fill="#f59e0b"/><text x="80" y="${HT - 22}" fill="#7c8a9e" font-size="17" font-family="${F}">newer</text>
<rect x="150" y="${HT - 34}" width="14" height="14" rx="3" fill="#22d3ee"/><text x="170" y="${HT - 22}" fill="#7c8a9e" font-size="17" font-family="${F}">held since mint · on-chain</text>
</svg>`;
}

export function renderAeonSkylineCard(data, opts = {}) {
  const svg = aeonSkylineSvg(data, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1080) : null;
}
