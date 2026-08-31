// THE RAINBOW ROAD — an OutRun-style driving video. The road is a multi-lane highway; each LANE is a
// rainbow valuation band and the car's lane is SPX6900's ACTUAL band over history (starts cheap at
// launch, climbs as SPX ran up, drops back — the swerves are the real band changes). A camera follows
// the car so you see a handful of wide lanes with dashed paint, winding curves + hills, traffic to
// overtake, palms, a bright coastal sky, retro HUD. SVG frames → Resvg → ffmpeg (H.264). $0, Node-only.
//
//   node tools/render-lane-video.mjs --format=vertical --seconds=30 --out=out/rainbow-road.mp4
//   flags: --format=vertical|wide|square  --fps=30  --seconds=30  --from=YYYY-MM-DD
import { Resvg } from "@resvg/resvg-js";
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { FONT } from "../scripts/bot/font.mjs";
import { buildModel, bandIndex, dayN, BAND_LABELS } from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";

const FORMATS = { vertical: { W: 1080, H: 1920 }, wide: { W: 1280, H: 720 }, square: { W: 1080, H: 1080 } };
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = BAND_LABELS.length, VIS = 5;           // 9 bands; ~5 lanes visible on the road at once
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = v => v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(3) : "$" + v.toFixed(5);
const fDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Number(v).toFixed(1);
const bandCol = i => BAND_LABELS[clamp(Math.round(i), 0, N - 1)].c;

// ── sprites (rear view) ──
function playerCar(w, lean) {
  const h = w * 0.86, hw = w / 2, b = h * 0.5, roofW = w * 0.58, roofTop = -h * 0.54;
  return `<g transform="rotate(${(lean * 7).toFixed(2)})">
    <ellipse cx="0" cy="${r1(b + 6)}" rx="${r1(hw * 1.08)}" ry="${r1(w * 0.1)}" fill="rgba(0,0,0,0.4)"/>
    <rect x="${r1(-hw)}" y="${r1(b - h * 0.2)}" width="${r1(w * 0.15)}" height="${r1(h * 0.22)}" rx="4" fill="#111"/>
    <rect x="${r1(hw * 0.85)}" y="${r1(b - h * 0.2)}" width="${r1(w * 0.15)}" height="${r1(h * 0.22)}" rx="4" fill="#111"/>
    <circle cx="${r1(-w * 0.12)}" cy="${r1(roofTop + h * 0.03)}" r="${r1(w * 0.085)}" fill="#8a5a3a"/>
    <circle cx="${r1(w * 0.12)}" cy="${r1(roofTop + h * 0.03)}" r="${r1(w * 0.085)}" fill="#f2d16b"/>
    <path d="M ${-roofW / 2} ${roofTop} L ${roofW / 2} ${roofTop} L ${hw} ${b} L ${-hw} ${b} Z" fill="url(#carbody)" stroke="#5a0b12" stroke-width="2"/>
    <path d="M ${r1(-roofW / 2.1)} ${r1(roofTop + h * 0.03)} L ${r1(roofW / 2.1)} ${r1(roofTop + h * 0.03)} L ${r1(roofW / 1.5)} ${r1(-h * 0.16)} L ${r1(-roofW / 1.5)} ${r1(-h * 0.16)} Z" fill="#0c0f16" opacity="0.92"/>
    <rect x="${r1(-hw * 0.92)}" y="${r1(b - h * 0.3)}" width="${r1(w * 0.24)}" height="${r1(h * 0.1)}" rx="4" fill="#ff3b3b"/>
    <rect x="${r1(hw * 0.68)}" y="${r1(b - h * 0.3)}" width="${r1(w * 0.24)}" height="${r1(h * 0.1)}" rx="4" fill="#ff3b3b"/>
    <rect x="${r1(-hw * 0.55)}" y="${r1(b - h * 0.1)}" width="${r1(w * 1.1 - hw)}" height="${r1(h * 0.05)}" rx="3" fill="#1a1a20"/>
  </g>`;
}
function truck(w) {
  const h = w * 1.5, hw = w / 2;
  return `<g><ellipse cx="0" cy="${r1(h * 0.5 + 5)}" rx="${r1(hw * 1.1)}" ry="${r1(w * 0.12)}" fill="rgba(0,0,0,0.38)"/>
    <rect x="${r1(-hw)}" y="${r1(-h * 0.5)}" width="${r1(w)}" height="${r1(h)}" rx="6" fill="url(#truckbody)" stroke="#1b2740" stroke-width="2"/>
    <rect x="${r1(-hw + w * 0.08)}" y="${r1(-h * 0.5 + w * 0.08)}" width="${r1(w - w * 0.16)}" height="${r1(h * 0.5)}" rx="4" fill="#dfe6f2" opacity="0.5"/>
    <line x1="0" y1="${r1(-h * 0.5)}" x2="0" y2="${r1(h * 0.5)}" stroke="#1b2740" stroke-width="2"/>
    <rect x="${r1(-hw * 0.9)}" y="${r1(h * 0.5 - h * 0.1)}" width="${r1(w * 0.2)}" height="${r1(h * 0.07)}" rx="3" fill="#ff5a3b"/>
    <rect x="${r1(hw * 0.7)}" y="${r1(h * 0.5 - h * 0.1)}" width="${r1(w * 0.2)}" height="${r1(h * 0.07)}" rx="3" fill="#ff5a3b"/></g>`;
}
function trafficCar(w, col) {
  const h = w * 0.8, hw = w / 2, b = h * 0.5, roofW = w * 0.6;
  return `<g><ellipse cx="0" cy="${r1(b + 5)}" rx="${r1(hw * 1.05)}" ry="${r1(w * 0.1)}" fill="rgba(0,0,0,0.35)"/>
    <path d="M ${-roofW / 2} ${-h * 0.5} L ${roofW / 2} ${-h * 0.5} L ${hw} ${b} L ${-hw} ${b} Z" fill="${col}" stroke="#0a0a10" stroke-width="2"/>
    <path d="M ${r1(-roofW / 2.1)} ${r1(-h * 0.47)} L ${r1(roofW / 2.1)} ${r1(-h * 0.47)} L ${r1(roofW / 1.6)} ${r1(-h * 0.12)} L ${r1(-roofW / 1.6)} ${r1(-h * 0.12)} Z" fill="#0c0f16" opacity="0.9"/>
    <rect x="${r1(-hw * 0.9)}" y="${r1(b - h * 0.28)}" width="${r1(w * 0.22)}" height="${r1(h * 0.09)}" rx="3" fill="#ffce3b"/>
    <rect x="${r1(hw * 0.68)}" y="${r1(b - h * 0.28)}" width="${r1(w * 0.22)}" height="${r1(h * 0.09)}" rx="3" fill="#ffce3b"/></g>`;
}
function palm(x, y, s) {
  const th = 120 * s, tw = Math.max(2, 9 * s), fr = 66 * s; let f = "";
  for (let a = -2; a <= 2; a++) f += `<path d="M ${r1(x)} ${r1(y - th)} q ${r1(a * fr * 0.5)} ${r1(-fr * 0.5)} ${r1(a * fr)} ${r1(-fr * 0.15 + Math.abs(a) * fr * 0.25)}" stroke="#1f9e4f" stroke-width="${r1(Math.max(2, 6.5 * s))}" fill="none" stroke-linecap="round"/>`;
  return `<path d="M ${r1(x - tw / 2)} ${r1(y)} L ${r1(x + tw / 2)} ${r1(y)} L ${r1(x + tw / 3)} ${r1(y - th)} L ${r1(x - tw / 3)} ${r1(y - th)} Z" fill="#7a5230"/>${f}<circle cx="${r1(x)}" cy="${r1(y - th)}" r="${r1(Math.max(2, 7 * s))}" fill="#2fbf63"/>`;
}

function scene({ W, H, carLane, camLane, band, date, price, scroll, progress, curve, hill, traffic, lean, carImg }) {
  const hy = H * 0.34, zN = 1, zF = 16;
  const ds = t => zN / (zN + (zF - zN) * t);                       // depth scale (1 near → small far)
  const yOf = t => hy + (H - hy) * ds(t) - hill * Math.sin(t * Math.PI) * H * 0.05;
  const laneW = t => (W * 0.9 / VIS) * ds(t);                      // wide lanes
  const centerX = t => W / 2 + curve * (t * t) * (W * 0.42);       // winding
  const laneX = (L, t) => centerX(t) + (L - camLane) * laneW(t);
  const railL = t => camLane - VIS / 2, railR = t => camLane + VIS / 2;
  const M = 34, ts = Array.from({ length: M + 1 }, (_, k) => k / M);
  const yH = yOf(1), y0 = yOf(0), col = i => BAND_LABELS[clamp(i, 0, N - 1)].c;
  const glow = bandCol(band);

  // ── sky, sun, clouds ──
  let s = `<rect width="${W}" height="${r1(yH + 20)}" fill="url(#sky)"/>
    <circle cx="${W * 0.5}" cy="${r1(yH * 0.5)}" r="${r1(W * 0.17)}" fill="url(#sun)"/>`;
  for (const [fx, fy] of [[0.14, 0.4], [0.5, 0.24], [0.83, 0.46], [0.32, 0.6], [0.68, 0.62]]) {
    const clx = ((fx - scroll * 0.03) % 1 + 1) % 1 * W, cly = fy * yH, r = 46 + fy * 42;
    s += `<g fill="#ffffff" opacity="0.96"><ellipse cx="${r1(clx)}" cy="${r1(cly)}" rx="${r1(r)}" ry="${r1(r * 0.58)}"/><ellipse cx="${r1(clx - r * 0.7)}" cy="${r1(cly + r * 0.22)}" rx="${r1(r * 0.7)}" ry="${r1(r * 0.48)}"/><ellipse cx="${r1(clx + r * 0.72)}" cy="${r1(cly + r * 0.22)}" rx="${r1(r * 0.76)}" ry="${r1(r * 0.5)}"/></g>`;
  }
  // ground + coastal horizon
  s += `<rect x="0" y="${r1(yH)}" width="${W}" height="${r1(H - yH)}" fill="url(#grass)"/>
    <rect x="0" y="${r1(yH - 12)}" width="${W}" height="12" fill="#1e6fd0"/>
    <rect x="0" y="${r1(yH)}" width="${W}" height="7" fill="#e8c98a"/>`;

  // ── the road window (clip so lanes never bleed onto the grass) ──
  const leftPts = ts.map(t => `${r1(laneX(railL(t), t))},${r1(yOf(t))}`).join(" ");
  const rightPts = ts.slice().reverse().map(t => `${r1(laneX(railR(t), t))},${r1(yOf(t))}`).join(" ");
  s += `<clipPath id="road"><polygon points="${leftPts} ${rightPts}"/></clipPath><g clip-path="url(#road)">`;
  // band lanes (each an integer lane, curved strip)
  const loL = Math.floor(camLane - VIS / 2) - 1, hiL = Math.ceil(camLane + VIS / 2) + 1;
  for (let L = loL; L < hiL; L++) {
    const lp = ts.map(t => `${r1(laneX(L, t))},${r1(yOf(t))}`).join(" ");
    const rp = ts.slice().reverse().map(t => `${r1(laneX(L + 1, t))},${r1(yOf(t))}`).join(" ");
    s += `<polygon points="${lp} ${rp}" fill="${col(L)}"/>`;
  }
  // depth fade
  s += `<polygon points="${leftPts} ${rightPts}" fill="url(#roadfade)"/></g>`;

  // ── dashed white lane paint between lanes (scrolls) ──
  for (let L = loL + 1; L < hiL; L++) {
    if (L < railL(0) - 0.5 || L > railR(0) + 0.5) continue;
    for (let k = 0; k < M; k++) {
      const seg = (k + Math.floor(scroll * M)) % 2; if (seg) continue;       // intermittent
      const ta = k / M, tb = (k + 1) / M;
      const xa = laneX(L, ta), xb = laneX(L, tb), wln = clamp(7 * ds(ta), 0.6, 7);
      s += `<line x1="${r1(xa)}" y1="${r1(yOf(ta))}" x2="${r1(xb)}" y2="${r1(yOf(tb))}" stroke="rgba(255,255,255,0.85)" stroke-width="${r1(wln)}"/>`;
    }
  }
  // ── red/white rumble strips at the road edges ──
  const ph = Math.floor(scroll * M);
  for (let k = 0; k < M; k++) {
    const ta = k / M, tb = (k + 1) / M, c = ((k + ph) % 2 === 0) ? "#e11d2a" : "#f8fafc";
    const kwa = clamp(34 * ds(ta) + 3, 3, 40), kwb = clamp(34 * ds(tb) + 3, 3, 40);
    const la = laneX(railL(ta), ta), lb = laneX(railL(tb), tb), ra = laneX(railR(ta), ta), rb = laneX(railR(tb), tb);
    s += `<polygon points="${r1(la - kwa)},${r1(yOf(ta))} ${r1(la)},${r1(yOf(ta))} ${r1(lb)},${r1(yOf(tb))} ${r1(lb - kwb)},${r1(yOf(tb))}" fill="${c}"/>`;
    s += `<polygon points="${r1(ra)},${r1(yOf(ta))} ${r1(ra + kwa)},${r1(yOf(ta))} ${r1(rb + kwb)},${r1(yOf(tb))} ${r1(rb)},${r1(yOf(tb))}" fill="${c}"/>`;
  }

  // ── roadside palms on the grass ──
  for (let k = 0; k < 7; k++) {
    let t = ((k / 7) - scroll) % 1; if (t < 0) t += 1; if (t < 0.04 || t > 0.96) continue;
    const sc = clamp(1.05 * ds(t) * 2.2, 0.05, 1.1), yy = yOf(t), g = 70 * sc;
    s += palm(laneX(railL(t), t) - g, yy, sc);
    s += palm(laneX(railR(t), t) + g, yy, sc);
  }

  // ── traffic to overtake (far → near), then the player car on top ──
  for (const v of traffic.slice().sort((a, b) => b.z - a.z)) {
    if (v.z < 0.02 || v.z > 1) continue;
    const t = v.z, w = laneW(t) * (v.type === "truck" ? 0.82 : 0.72), x = laneX(v.lane + 0.5, t), yv = yOf(t);
    s += `<g transform="translate(${r1(x)},${r1(yv - w * 0.5)})">${v.type === "truck" ? truck(w) : trafficCar(w, v.col)}</g>`;
  }
  const tCar = 0.03, cw = laneW(tCar) * 0.98, carX = laneX(carLane + 0.5, tCar), carY = yOf(tCar) - cw * 0.5 - 26;
  if (Math.abs(lean) > 0.15)   // two tyre streaks trailing behind on a lane change
    for (const dx of [-cw * 0.34, cw * 0.34])
      s += `<line x1="${r1(carX + dx)}" y1="${r1(carY + cw * 0.44)}" x2="${r1(carX + dx - lean * cw * 0.8)}" y2="${r1(carY + cw * 0.44 + cw * 0.55)}" stroke="rgba(15,15,20,0.45)" stroke-width="${r1(cw * 0.07)}" stroke-linecap="round"/>`;
  const carSprite = carImg
    ? `<image href="${carImg}" x="${r1(-cw / 2)}" y="${r1(-cw / 2)}" width="${r1(cw)}" height="${r1(cw)}" transform="rotate(${r1(lean * 7)})" preserveAspectRatio="xMidYMid meet"/>`
    : playerCar(cw, clamp(lean, -1, 1));
  s += `<g transform="translate(${r1(carX)},${r1(carY)})">${carSprite}</g>`;

  // ── retro HUD ──
  s += `<rect width="${W}" height="${r1(H * 0.13)}" fill="url(#hud)"/>
    <text x="44" y="58" fill="#fde047" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="2" stroke="#7a1e00" stroke-width="1">SPX6900 · RAINBOW ROAD</text>
    <text x="44" y="98" fill="#f8fafc" font-size="22" font-family="sans-serif" letter-spacing="1">DATE <tspan fill="#fde047" font-weight="800">${esc(fDate(date)).toUpperCase()}</tspan>   PRICE <tspan fill="#fde047" font-weight="800">${esc(usd(price))}</tspan></text>
    <rect x="${W - 360}" y="34" width="316" height="52" rx="8" fill="#0b1226" stroke="${glow}" stroke-width="2"/>
    <text x="${W - 344}" y="70" fill="#9aa4b4" font-size="22" font-weight="800" font-family="sans-serif">BAND</text>
    <text x="${W - 250}" y="70" fill="${glow}" font-size="26" font-weight="800" font-family="sans-serif">${esc(BAND_LABELS[clamp(band,0,N-1)].l.toUpperCase())}</text>`;
  const lx = W - 236, lyt = H * 0.13 + 20, lh = 30;
  s += `<rect x="${lx - 12}" y="${r1(lyt - 14)}" width="228" height="${r1(N * lh + 16)}" rx="8" fill="rgba(5,9,20,0.6)"/>`;
  for (let i = N - 1; i >= 0; i--) {
    const yy = lyt + (N - 1 - i) * lh, on = i === clamp(band, 0, N - 1);
    s += `<rect x="${lx}" y="${r1(yy)}" width="18" height="18" rx="3" fill="${BAND_LABELS[i].c}" stroke="${on ? "#fff" : "none"}" stroke-width="2"/>
      <text x="${lx + 26}" y="${r1(yy + 15)}" fill="${on ? "#f8fafc" : "#c8d1de"}" font-size="${on ? 19 : 16}" font-weight="${on ? 800 : 600}" font-family="sans-serif">${esc(BAND_LABELS[i].l)}</text>`;
  }
  s += `<rect x="0" y="${H - 9}" width="${W}" height="9" fill="rgba(255,255,255,0.14)"/><rect x="0" y="${H - 9}" width="${r1(W * progress)}" height="9" fill="${glow}"/>`;
  return s;
}

const svg = (state, W, H) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1b4fd8"/><stop offset="65%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#a7d3ff"/></linearGradient>
<radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff7cc"/><stop offset="55%" stop-color="#ffe98a" stop-opacity="0.85"/><stop offset="100%" stop-color="#ffe98a" stop-opacity="0"/></radialGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f7a37"/><stop offset="100%" stop-color="#2fa84a"/></linearGradient>
<linearGradient id="roadfade" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#0a0a12" stop-opacity="0.5"/></linearGradient>
<linearGradient id="hud" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#050914" stop-opacity="0.9"/><stop offset="100%" stop-color="#050914" stop-opacity="0"/></linearGradient>
<linearGradient id="carbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff5a5a"/><stop offset="55%" stop-color="#e11d2a"/><stop offset="100%" stop-color="#8f0f18"/></linearGradient>
<linearGradient id="truckbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5b7cc4"/><stop offset="100%" stop-color="#33477a"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#3b82f6"/>
${scene({ ...state, W, H })}
</svg>`;

async function main() {
  const fmt = FORMATS[arg("format", "vertical")] || FORMATS.vertical;
  const fps = +arg("fps", "30"), seconds = +arg("seconds", "30"), out = arg("out", "out/rainbow-road.mp4"), from = arg("from", "");
  mkdirSync(dirname(out), { recursive: true });
  // optional --car=path.png (or .svg): a supplied car sprite (rear view, transparent bg) replaces the
  // vector car — embedded as a data URI so it rides in every frame.
  let carImg = null; const carPath = arg("car", "");
  if (carPath) { const { readFileSync } = await import("node:fs"); const b = readFileSync(carPath); const mime = carPath.endsWith(".svg") ? "image/svg+xml" : carPath.endsWith(".webp") ? "image/webp" : carPath.endsWith(".jpg") || carPath.endsWith(".jpeg") ? "image/jpeg" : "image/png"; carImg = `data:${mime};base64,${b.toString("base64")}`; console.log(`using supplied car: ${carPath}`); }
  const m = buildModel(DEFAULT_RAW);
  let seq = DEFAULT_RAW.map(r => ({ date: r.date, price: r.price, band: bandIndex(m, r.price, dayN(r.date)) }));
  if (from) seq = seq.filter(r => r.date >= from);
  const total = fps * seconds, bandAt = p => seq[clamp(Math.floor(p * (seq.length - 1)), 0, seq.length - 1)];
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const cols = ["#38bdf8", "#a3e635", "#f472b6", "#fbbf24"];
  let carLane = seq[0].band, camLane = seq[0].band, prevCar = carLane;
  let traffic = Array.from({ length: 4 }, (_, i) => ({ z: 0.35 + i * 0.18, lane: seq[0].band + (i % 2 ? 1 : -1), type: rnd() < 0.35 ? "truck" : "car", col: cols[i % cols.length] }));

  const dir = mkdtempSync(join(tmpdir(), "lanevid-"));
  console.log(`rainbow road v2 · ${fmt.W}×${fmt.H} · ${fps}fps · ${seconds}s (${total}f) · ${seq.length} weeks → ${out}`);
  try {
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1), curr = bandAt(p);
      prevCar = carLane; carLane += (curr.band - carLane) * 0.10; camLane += (carLane - camLane) * 0.045;
      const lean = clamp((carLane - prevCar) * 6, -1, 1);
      // traffic approaches; recycle past vehicles to the far distance in a nearby lane
      for (const v of traffic) { v.z -= 0.85 / fps; if (v.z < 0.0) { v.z = 1; v.lane = Math.round(camLane) + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2)); v.type = rnd() < 0.3 ? "truck" : "car"; v.col = cols[Math.floor(rnd() * cols.length)]; } }
      const st = { carLane, camLane, band: curr.band, date: curr.date, price: curr.price, scroll: (i * 0.62 / fps) % 1, progress: p, curve: Math.sin(p * Math.PI * 6) * 0.55, hill: Math.sin(p * Math.PI * 4 + 1) * 0.6, traffic, lean, carImg };
      writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), new Resvg(svg(st, fmt.W, fmt.H), { fitTo: { mode: "width", value: fmt.W }, font: FONT }).render().asPng());
      if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    process.stdout.write(`\r  frame ${total}/${total}\n`);
    const ff = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
    await new Promise((res, rej) => spawn(ff, ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "inherit"] }).on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    console.log(`✓ ${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
