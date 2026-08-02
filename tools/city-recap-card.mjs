// Compose the City recap CARD: a rendered city screenshot with a tasteful lower strip carrying the
// week's/month's headline + stats — the image dominates, the numbers read at a glance, house style.
//
//   node tools/city-recap-card.mjs --image=~/city-recap.png --period=monthly --out=~/city-recap-card.png
//
// --image is the screenshot from render-city-recap.mjs (run on your Mac for the real look). With no
// --image it draws a placeholder skyline so you can judge the overlay layout + copy. Reads the numbers
// from public/city-recap.json (built by build-city-recap.mjs), so nothing is hand-typed.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { FONT } from "../scripts/bot/font.mjs";
import { brandStripe } from "../scripts/bot/chrome.mjs";

const arg = (k, d) => { const h = process.argv.find(s => s === `--${k}` || s.startsWith(`--${k}=`)); return h ? (h.includes("=") ? h.split("=").slice(1).join("=") : true) : d; };
const W = 1200, H = 675;
const PERIOD = arg("period", "monthly");
const OUT = arg("out", "/tmp/city-recap-card.png");
const IMG = arg("image", null);

const recap = JSON.parse(readFileSync("public/city-recap.json", "utf8"));
const r = recap[PERIOD];
if (!r) { console.error(`No '${PERIOD}' block in city-recap.json`); process.exit(1); }

const fmt = n => { const a = Math.abs(n); return (a >= 1e6 ? (n / 1e6).toFixed(2) + "M" : a >= 1e3 ? Math.round(n / 1e3) + "k" : "" + n); };
const sgn = n => (n >= 0 ? "+" : "") + fmt(n);
const FAM = { masonry: "brick low-rise", concrete: "concrete mid-rise", glass: "glass tower" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── the background: the real render, or a placeholder skyline ────────────────────────────────────
let bg;
if (IMG) {
  const b64 = readFileSync(IMG.replace(/^~/, process.env.HOME || "~")).toString("base64");
  // cover: fill the width, pin to the top so the skyline + district labels stay in frame
  bg = `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${W}" height="${W * 0.625}" preserveAspectRatio="xMidYMin slice"/>`;
} else {
  let sky = `<rect width="${W}" height="${H}" fill="url(#dusk)"/>`;
  let b = "";
  for (let i = 0; i < 46; i++) {
    const seed = (i * 73 % 100) / 100, seed2 = (i * 149 % 100) / 100;
    const bw = 20 + seed2 * 26, x = i * (W / 46) - 4, h = 120 + seed * 300, y = H - h;
    const glass = seed > 0.72, tint = glass ? "#33465f" : "#4a4038";
    b += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${bw.toFixed(0)}" height="${h.toFixed(0)}" fill="${tint}"/>`;
    for (let wy = y + 10; wy < H - 10; wy += 16) for (let wx = x + 4; wx < x + bw - 4; wx += 9)
      if ((wx * 7 + wy * 3) % 5 < 3) b += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="4" height="6" fill="${glass ? "#8fd3ff" : "#ffd9a0"}" opacity="0.5"/>`;
  }
  bg = sky + b + `<text x="${W / 2}" y="40" font-family="sans-serif" font-size="15" fill="#94a3b8" text-anchor="middle" opacity="0.8">placeholder — your render goes here (--image=…)</text>`;
}

const hero = r.hero;
const heroLine = hero
  ? (hero.fromFamily ? `Tallest riser: a rank #${hero.rank} holder — ${FAM[hero.fromFamily]} to ${FAM[hero.family]}`
     : `Biggest arrival: ${hero.short}, straight into a ${FAM[hero.family]}`)
  : "";
const periodLabel = PERIOD === "weekly" ? "THIS WEEK" : "THIS MONTH";
const headline = r.upgraded >= 5 ? `${r.upgraded} buildings rose a tier`
  : `${r.newResidents} new residents moved in`;
const stats = `${r.newResidents} moved in   ·   ${r.departed} left   ·   ${sgn(r.heldDelta)} SPX held   ·   ${r.residents.toLocaleString("en-US")} residents   ·   ${r.familyMix.glass} glass towers`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#caa06e"/><stop offset="0.28" stop-color="#8a7a86"/>
      <stop offset="0.55" stop-color="#2b2f45"/><stop offset="1" stop-color="#0a0c18"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05050e" stop-opacity="0"/><stop offset="0.55" stop-color="#05050e" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#05050e" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  ${bg}
  <rect x="0" y="${H - 300}" width="${W}" height="300" fill="url(#scrim)"/>
  ${brandStripe(H)}
  <text x="46" y="${H - 128}" font-family="sans-serif" font-size="19" letter-spacing="3" fill="#7dd3fc" font-weight="700">SPX CITY  ·  ${periodLabel}</text>
  <text x="${W - 24}" y="${H - 128}" font-family="sans-serif" font-size="16" fill="#93a3b8" text-anchor="end">@SPX6900Rainbow · reproducible on-chain</text>
  <text x="44" y="${H - 84}" font-family="sans-serif" font-size="46" fill="#f8fafc" font-weight="800">${esc(headline)}</text>
  <text x="46" y="${H - 52}" font-family="sans-serif" font-size="22" fill="#cbd5e1">${esc(heroLine)}</text>
  <text x="46" y="${H - 22}" font-family="sans-serif" font-size="21" fill="#93c5fd">${esc(stats)}</text>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: FONT }).render().asPng();
writeFileSync(OUT.replace(/^~/, process.env.HOME || "~"), png);
console.log(`✓ ${PERIOD} recap card → ${OUT}`);
console.log(`  headline: ${headline}`);
console.log(`  ${heroLine}`);
console.log(`  ${stats}`);
