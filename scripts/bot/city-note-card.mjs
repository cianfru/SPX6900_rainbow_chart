// One-off "note on-chain, forever" card for the CityNotes launch post. A dusk SPX City skyline with a
// hero building carrying a real holder's on-chain note, and the verified-contract proof baked in — the
// honesty moat as an image. Self-contained SVG → Resvg PNG (no 3D, no screenshot needed).
//   node scripts/bot/city-note-card.mjs --text="Persist Forever" --out=city-note.png
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const BASE = "#3b82f6";   // Base-chain blue (per the repo's per-chain convention)

// deterministic RNG so the skyline is stable across renders
const rng = (s => () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff))(20260807);

export function cityNoteSvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 1200, F = FONT[0] || "sans-serif";
  const text = opts.text || "Persist Forever";
  const ground = 1006;                       // skyline baseline
  const heroX = 600, heroW = 116, heroTop = 452;   // the noted building

  // ── background skyline buildings (silhouettes with lit windows) ──────────────────────────────
  let sky = "";
  const win = (bx, by, bw, bh, warm) => {     // scatter lit windows on a facade
    let s = "";
    const cols = Math.max(2, Math.floor(bw / 16)), rows = Math.max(2, Math.floor(bh / 20));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rng() > 0.42) continue;
      const wx = bx + 7 + c * ((bw - 14) / cols), wy = by + 10 + r * ((bh - 14) / rows);
      s += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="5" height="7" rx="1" fill="${warm ? "#ffd9a0" : "#a5c8ff"}" fill-opacity="${(0.3 + rng() * 0.5).toFixed(2)}"/>`;
    }
    return s;
  };
  // back row (dim) then front row (darker, taller near centre)
  const rowsDef = [
    { n: 22, base: "#0c1226", minH: 120, maxH: 300, y: ground - 8, op: 0.85 },
    { n: 16, base: "#070b1a", minH: 170, maxH: 420, y: ground, op: 1 },
  ];
  for (const row of rowsDef) {
    for (let i = 0; i < row.n; i++) {
      const bw = 40 + rng() * 46;
      const bx = (i / row.n) * (W + 60) - 30 + (rng() - 0.5) * 20;
      if (Math.abs(bx + bw / 2 - heroX) < heroW * 0.9 && row === rowsDef[1]) continue;   // clear space for the hero
      const bh = row.minH + rng() * (row.maxH - row.minH);
      const by = row.y - bh;
      sky += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${row.base}"/>`
        + win(bx, by, bw, bh, false);
    }
  }

  // ── the hero building — taller, edge-lit, the one holding the note ───────────────────────────
  const hero = `<rect x="${heroX - heroW / 2}" y="${heroTop}" width="${heroW}" height="${ground - heroTop}" fill="#0a1024"/>`
    + `<rect x="${heroX - heroW / 2}" y="${heroTop}" width="4" height="${ground - heroTop}" fill="${BASE}" fill-opacity="0.9"/>`
    + `<rect x="${heroX + heroW / 2 - 4}" y="${heroTop}" width="4" height="${ground - heroTop}" fill="${BASE}" fill-opacity="0.45"/>`
    + win(heroX - heroW / 2, heroTop, heroW, ground - heroTop, true)
    + `<ellipse cx="${heroX}" cy="${ground}" rx="${heroW * 1.5}" ry="26" fill="${BASE}" fill-opacity="0.14"/>`;   // ground glow

  // ── the note: a glowing bubble on a stem over the hero ───────────────────────────────────────
  const fs = 40, tw = Math.min(560, text.length * fs * 0.56);
  const bw = tw + 70, bx = heroX - bw / 2, byTop = heroTop - 150, bh = 74;
  const note = `<line x1="${heroX}" y1="${byTop + bh}" x2="${heroX}" y2="${heroTop}" stroke="${BASE}" stroke-width="2" stroke-opacity="0.7"/>`
    + `<circle cx="${heroX}" cy="${heroTop}" r="6" fill="${BASE}"/>`
    + `<rect x="${bx}" y="${byTop}" width="${bw}" height="${bh}" rx="16" fill="#0b1120" stroke="${BASE}" stroke-width="2.5" filter="url(#nglow)"/>`
    + `<text x="${heroX}" y="${byTop + bh / 2 - 8}" fill="#93c5fd" font-size="15" letter-spacing="2" text-anchor="middle" font-family="${F}">✦ ON-CHAIN NOTE · BASE</text>`
    + `<text x="${heroX}" y="${byTop + bh / 2 + 22}" fill="#f1f5f9" font-size="${fs}" font-weight="800" text-anchor="middle" font-family="${F}">${esc(`"${text}"`)}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#070a1c"/><stop offset="42%" stop-color="#141232"/>
    <stop offset="72%" stop-color="#2a1c3e"/><stop offset="100%" stop-color="#3a2340"/></linearGradient>
  <radialGradient id="hglow" cx="50%" cy="86%" r="60%">
    <stop offset="0%" stop-color="#ff9a5a" stop-opacity="0.18"/><stop offset="100%" stop-color="#ff9a5a" stop-opacity="0"/></radialGradient>
  <filter id="nglow" x="-40%" y="-60%" width="180%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${BASE}" flood-opacity="0.55"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#hglow)"/>
${brandStripe(H)}
${sky}${hero}${note}
<rect x="0" y="${ground}" width="${W}" height="${H - ground}" fill="#05070f"/>

<text x="60" y="150" fill="#f8fafc" font-size="62" font-weight="800" font-family="${F}" letter-spacing="0.5">Your words. On-chain. Forever.</text>
<text x="60" y="212" fill="#cbd5e1" font-size="26" font-family="${F}">A holder left this note on their building in SPX City —</text>
<text x="60" y="248" fill="#cbd5e1" font-size="26" font-family="${F}">an event on a contract that can't be edited, can't hold value, has no owner.</text>

<rect x="60" y="${H - 132}" width="${W - 120}" height="52" rx="12" fill="#0a1224" stroke="rgba(59,130,246,0.5)"/>
<text x="82" y="${H - 100}" fill="#93c5fd" font-size="21" font-weight="700" font-family="${F}">${esc("CityNotes · Base · 0xa167…2262")}</text>
<text x="${W - 82}" y="${H - 100}" text-anchor="end" fill="#4ade80" font-size="21" font-weight="800" font-family="${F}">${esc("VERIFIED ✓ · no backend · no admin")}</text>
<text x="60" y="${H - 42}" fill="#8592a6" font-size="19" font-family="${F}">${esc("spx6900rainbow.xyz · every note is an event anyone can read straight from the chain")}</text>
</svg>`;
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
