// One-off "note on-chain, forever" card for the CityNotes launch post. A dusk SPX City skyline with a
// hero building carrying a real holder's on-chain note, and the verified-contract proof baked in — the
// honesty moat as an image. Self-contained SVG → Resvg PNG (no 3D, no screenshot needed).
//   node scripts/bot/city-note-card.mjs --text="Persist Forever" --out=city-note.png
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const BASE = "#3b82f6";   // Base-chain blue (per the repo's per-chain convention)

// deterministic RNG so the skyline is stable across renders
const rng = (s => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff))(20260807);

export function cityNoteSvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 1200, F = FONT[0] || "sans-serif";
  const text = opts.text || "Persist Forever";
  const ground = 1030;                       // skyline baseline (behind the bottom bar)
  const heroX = 600;

  // Windows: a regular grid, some floors fully lit, atmospheric brightness (dim = distance haze).
  const windows = (x, w, top, baseY, { warm = false, dim = 1 } = {}) => {
    let s = ""; const cw = 10, ch = 8, gx = 8, gy = 9;
    const cols = Math.max(2, Math.floor((w - 12) / (cw + gx)));
    const mx = (w - (cols * (cw + gx) - gx)) / 2;
    for (let fy = top + 13; fy < baseY - 9; fy += ch + gy) {
      const lit = rng() < 0.1;                                   // occasional fully-lit floor
      for (let c = 0; c < cols; c++) {
        if (!lit && rng() > 0.5) continue;
        const op = (lit ? 0.72 : 0.22 + rng() * 0.5) * dim;
        const col = warm ? "#ffd9a0" : (rng() < 0.22 ? "#cfe3ff" : "#7ba2dc");
        s += `<rect x="${(x + mx + c * (cw + gx)).toFixed(1)}" y="${fy.toFixed(1)}" width="${cw}" height="${ch}" rx="1" fill="${col}" fill-opacity="${op.toFixed(2)}"/>`;
      }
    }
    return s;
  };
  // One building: body + rooftop style (flat | step | antenna with a red beacon).
  const bld = (x, w, h, { fill, top = "flat", dim = 1, warm = false, glow = null } = {}) => {
    const y = ground - h;
    let s = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    if (top === "step" && h > 190) { const sw = w * 0.62, sx = x + (w - sw) / 2; s += `<rect x="${sx.toFixed(1)}" y="${(y - 24).toFixed(1)}" width="${sw.toFixed(1)}" height="24" fill="${fill}"/>`; }
    if (top === "antenna") s += `<rect x="${(x + w / 2 - 1.5).toFixed(1)}" y="${(y - 30).toFixed(1)}" width="3" height="30" fill="${fill}"/><circle cx="${(x + w / 2).toFixed(1)}" cy="${(y - 30).toFixed(1)}" r="2.4" fill="#ff6b6b" fill-opacity="0.85"/>`;
    if (glow) s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3.5" height="${h}" fill="${glow}" fill-opacity="0.9"/><rect x="${(x + w - 3.5).toFixed(1)}" y="${y.toFixed(1)}" width="3.5" height="${h}" fill="${glow}" fill-opacity="0.4"/>`;
    return s + windows(x, w, y, ground, { warm, dim });
  };

  // Three depth layers, far → near: atmospheric perspective (farther = paler-blue, dimmer, shorter).
  let sky = "";
  const LAYERS = [
    { n: 26, fill: "#243156", minH: 80, maxH: 210, dim: 0.45 },   // far
    { n: 18, fill: "#141d3c", minH: 140, maxH: 320, dim: 0.75 },  // mid
    { n: 13, fill: "#080d20", minH: 190, maxH: 400, dim: 1.0 },   // near
  ];
  LAYERS.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const w = 40 + rng() * 46, x = (i / L.n) * (W + 80) - 40 + (rng() - 0.5) * 26, cx = x + w / 2;
      if (li === 2 && Math.abs(cx - heroX) < 92) continue;        // keep the hero slot clear on the near row
      const t = rng(); const top = t < 0.18 ? "antenna" : t < 0.32 ? "step" : "flat";
      sky += bld(x, w, L.minH + rng() * (L.maxH - L.minH), { fill: L.fill, top, dim: L.dim });
    }
  });

  // Hero tower: two setbacks + a slim spire and beacon, Base-blue edge-light + ground glow.
  const hw = 104, hx = heroX - hw / 2, hTop = 470, hh = ground - hTop;
  let hero = bld(hx, hw, hh, { fill: "#0a1226", glow: BASE, warm: true });
  hero += `<rect x="${hx + hw * 0.15}" y="${hTop - 30}" width="${hw * 0.70}" height="30" fill="#0a1226"/>`
    + `<rect x="${hx + hw * 0.15}" y="${hTop - 30}" width="3" height="30" fill="${BASE}" fill-opacity="0.85"/><rect x="${hx + hw * 0.85 - 3}" y="${hTop - 30}" width="3" height="30" fill="${BASE}" fill-opacity="0.4"/>`
    + `<rect x="${hx + hw * 0.33}" y="${hTop - 54}" width="${hw * 0.34}" height="24" fill="#0a1226"/>`
    + `<rect x="${heroX - 2}" y="${hTop - 96}" width="4" height="42" fill="#0a1226"/>`                     // spire
    + `<circle cx="${heroX}" cy="${hTop - 96}" r="10" fill="${BASE}" fill-opacity="0.35"/><circle cx="${heroX}" cy="${hTop - 96}" r="4.5" fill="#dbeafe"/>`   // beacon
    + `<ellipse cx="${heroX}" cy="${ground}" rx="${hw * 1.8}" ry="30" fill="${BASE}" fill-opacity="0.16"/>`;

  // Note bubble on a stem, over the spire.
  const beaconY = hTop - 96;
  const fs = 42, tw = Math.min(600, text.length * fs * 0.56), bw = tw + 76, bx = heroX - bw / 2, bh = 84, byTop = beaconY - 112;
  const note = `<line x1="${heroX}" y1="${byTop + bh}" x2="${heroX}" y2="${beaconY}" stroke="${BASE}" stroke-width="2" stroke-opacity="0.65"/>`
    + `<rect x="${bx}" y="${byTop}" width="${bw}" height="${bh}" rx="17" fill="#0b1120" stroke="${BASE}" stroke-width="2.5" filter="url(#nglow)"/>`
    + `<text x="${heroX}" y="${byTop + 30}" fill="#93c5fd" font-size="15" letter-spacing="2.5" text-anchor="middle" font-family="${F}">◆ ON-CHAIN NOTE · BASE</text>`
    + `<text x="${heroX}" y="${byTop + 66}" fill="#f1f5f9" font-size="${fs}" font-weight="800" text-anchor="middle" font-family="${F}">${esc(`"${text}"`)}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#05081a"/><stop offset="38%" stop-color="#0f1230"/>
    <stop offset="66%" stop-color="#231a3c"/><stop offset="88%" stop-color="#3d2440"/><stop offset="100%" stop-color="#4a2b3a"/></linearGradient>
  <radialGradient id="glowH" cx="50%" cy="84%" r="62%">
    <stop offset="0%" stop-color="#ff8f4a" stop-opacity="0.22"/><stop offset="55%" stop-color="#c85a7a" stop-opacity="0.08"/><stop offset="100%" stop-color="#c85a7a" stop-opacity="0"/></radialGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d2a44" stop-opacity="0"/><stop offset="100%" stop-color="#4a3350" stop-opacity="0.5"/></linearGradient>
  <filter id="nglow" x="-40%" y="-60%" width="180%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="11" flood-color="${BASE}" flood-opacity="0.55"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#glowH)"/>
${stars(W)}
${cardDepth(W, H)}${brandStripe(H)}
<rect x="0" y="${ground - 300}" width="${W}" height="300" fill="url(#haze)"/>
${sky}${hero}${note}
<rect x="0" y="${ground}" width="${W}" height="${H - ground}" fill="#05070f"/>

<text x="60" y="150" fill="#f8fafc" font-size="62" font-weight="800" font-family="${F}" letter-spacing="0.5">Your words. On-chain. Forever.</text>
<text x="60" y="210" fill="#d3dcea" font-size="25" font-family="${F}">${esc("Claim your building in SPX City and leave a note — sign one transaction on Base.")}</text>
<text x="60" y="245" fill="#d3dcea" font-size="25" font-family="${F}">${esc("It's written to the blockchain, so it stays there forever. A nice way to persist.")}</text>

<rect x="60" y="${H - 132}" width="${W - 120}" height="52" rx="12" fill="#0a1224" stroke="rgba(59,130,246,0.5)"/>
<text x="82" y="${H - 100}" fill="#93c5fd" font-size="21" font-weight="700" font-family="${F}">${esc("CityNotes · Base · 0xa167…2262")}</text>
<text x="${W - 82}" y="${H - 100}" text-anchor="end" fill="#4ade80" font-size="21" font-weight="800" font-family="${F}">${esc("VERIFIED ✓ · no backend · no admin")}</text>
<text x="60" y="${H - 42}" fill="#8592a6" font-size="19" font-family="${F}">${esc("spx6900rainbow.xyz · every note is an event anyone can read straight from the chain")}</text>
</svg>`;
}

// A scatter of faint stars in the upper sky.
function stars(W) {
  let s = "";
  for (let i = 0; i < 60; i++) { const x = rng() * W, y = rng() * 380, r = rng() < 0.15 ? 1.6 : 0.9;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#e6ecff" fill-opacity="${(0.15 + rng() * 0.5).toFixed(2)}"/>`; }
  return s;
}

export function renderCityNoteCard(opts = {}) {
  return new Resvg(cityNoteSvg(opts), { fitTo: { mode: "width", value: opts.W ?? 1200 }, font: FONT }).render().asPng();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : null; };
  const { writeFileSync } = await import("node:fs");
  const out = arg("out") || "city-note.png";
  writeFileSync(out, renderCityNoteCard({ text: arg("text") || "Persist Forever" }));
  console.log("wrote", out);
}
