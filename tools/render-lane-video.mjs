// THE RAINBOW ROAD — an OutRun-style driving video where each LANE is a rainbow valuation band and the
// car's lane is SPX6900's ACTUAL band over history. It starts in the cheap bands, climbs as SPX ran up,
// drops back — a real replay of the valuation journey as a drive, arcade-racer styling (bright sky, big
// clouds, scrolling palms, red car from behind, retro HUD, winding curves). Honest: the swerves are the
// true band changes. SVG frames → Resvg → ffmpeg (H.264). $0, Node-only.
//
//   node tools/render-lane-video.mjs --format=vertical --seconds=20 --out=out/rainbow-road.mp4
//   flags: --format=vertical|wide|square  --fps=30  --seconds=20  --from=YYYY-MM-DD
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
const N = BAND_LABELS.length;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = v => v >= 1 ? "$" + v.toFixed(2) : v >= 0.01 ? "$" + v.toFixed(3) : "$" + v.toFixed(5);
const fDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, n = 1) => Number(v).toFixed(n);

// A red arcade sports car, rear view (the OutRun Ferrari), with the couple's heads.
function car(w, lean) {
  const h = w * 0.9, hw = w / 2, b = h * 0.5;
  const roofW = w * 0.6, roofTop = -h * 0.52, sh = h * 0.16;
  return `<g transform="rotate(${round(lean * 6, 2)})">
    <ellipse cx="0" cy="${round(b + 5)}" rx="${round(hw * 1.06)}" ry="${round(w * 0.1)}" fill="rgba(0,0,0,0.42)"/>
    <rect x="${round(-hw * 0.99)}" y="${round(b - sh)}" width="${round(w * 0.15)}" height="${round(sh * 1.15)}" rx="4" fill="#111"/>
    <rect x="${round(hw * 0.84)}" y="${round(b - sh)}" width="${round(w * 0.15)}" height="${round(sh * 1.15)}" rx="4" fill="#111"/>
    <!-- heads (the couple) -->
    <circle cx="${round(-w * 0.12)}" cy="${round(roofTop + h * 0.02)}" r="${round(w * 0.09)}" fill="#8a5a3a"/>
    <circle cx="${round(w * 0.12)}" cy="${round(roofTop + h * 0.02)}" r="${round(w * 0.09)}" fill="#f2d16b"/>
    <path d="M ${-roofW / 2} ${roofTop} L ${roofW / 2} ${roofTop} L ${hw} ${b} L ${-hw} ${b} Z" fill="url(#carbody)" stroke="#5a0b12" stroke-width="2"/>
    <path d="M ${round(-roofW / 2.1)} ${round(roofTop + h * 0.03)} L ${round(roofW / 2.1)} ${round(roofTop + h * 0.03)} L ${round(roofW / 1.55)} ${round(-h * 0.14)} L ${round(-roofW / 1.55)} ${round(-h * 0.14)} Z" fill="#0c0f16" opacity="0.9"/>
    <rect x="${round(-hw * 0.92)}" y="${round(b - h * 0.3)}" width="${round(w * 0.22)}" height="${round(h * 0.1)}" rx="4" fill="#ff3b3b"/>
    <rect x="${round(hw * 0.7)}" y="${round(b - h * 0.3)}" width="${round(w * 0.22)}" height="${round(h * 0.1)}" rx="4" fill="#ff3b3b"/>
    <rect x="${round(-hw * 0.55)}" y="${round(b - h * 0.1)}" width="${round(w * 1.1 - hw)}" height="${round(h * 0.05)}" rx="3" fill="#1a1a20"/>
  </g>`;
}

// A palm tree, base at (x,y), scaled by s (perspective). Simple arcade silhouette.
function palm(x, y, s) {
  const th = 120 * s, tw = Math.max(2, 10 * s), fr = 70 * s;
  let f = "";
  for (let a = -2; a <= 2; a++) f += `<path d="M ${round(x)} ${round(y - th)} q ${round(a * fr * 0.5)} ${round(-fr * 0.5)} ${round(a * fr)} ${round(-fr * 0.15 + Math.abs(a) * fr * 0.25)}" stroke="#1f9e4f" stroke-width="${round(Math.max(2, 7 * s))}" fill="none" stroke-linecap="round"/>`;
  return `<path d="M ${round(x - tw / 2)} ${round(y)} L ${round(x + tw / 2)} ${round(y)} L ${round(x + tw / 3)} ${round(y - th)} L ${round(x - tw / 3)} ${round(y - th)} Z" fill="#7a5230"/>${f}<circle cx="${round(x)}" cy="${round(y - th)}" r="${round(Math.max(2, 8 * s))}" fill="#2fbf63"/>`;
}
function bush(x, y, s) {
  const r = 26 * s;
  return `<g fill="#2a9d54"><ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(r)}" ry="${round(r * 0.7)}"/><ellipse cx="${round(x - r * 0.6)}" cy="${round(y + r * 0.15)}" rx="${round(r * 0.6)}" ry="${round(r * 0.5)}"/><ellipse cx="${round(x + r * 0.6)}" cy="${round(y + r * 0.15)}" rx="${round(r * 0.6)}" ry="${round(r * 0.5)}"/></g>`;
}

function scene({ W, H, carLane, band, date, price, scroll, progress, curve }) {
  const hy = H * 0.36;                          // horizon (lower → more sky, OutRun-ish)
  const zN = 1, zF = 18, roadHalf = W * 0.44;
  const y = t => hy + (H - hy) * (zN / (zN + (zF - zN) * t));
  const half = t => roadHalf * (zN / (zN + (zF - zN) * t));
  const cx = t => W / 2 + curve * (t * t) * W * 0.5;                  // gentle winding road
  const edge = (frac, t) => cx(t) + half(t) * (frac * 2 - 1);
  const laneCx = (lane, t) => cx(t) + half(t) * (((lane + 0.5) / N) * 2 - 1);
  const bandCol = i => BAND_LABELS[clamp(Math.round(i), 0, N - 1)].c;
  const yH = y(1), y0 = y(0);

  // ── sky + clouds ──
  let s = `<rect width="${W}" height="${round(yH)}" fill="url(#sky)"/>`;
  const clouds = [[0.16, 0.42], [0.5, 0.28], [0.82, 0.5], [0.34, 0.62], [0.66, 0.64]];
  for (const [fx, fy] of clouds) {
    const clx = ((fx - scroll * 0.04) % 1 + 1) % 1 * W, cly = fy * yH, r = 46 + fy * 40;
    s += `<g fill="#ffffff" opacity="0.95"><ellipse cx="${round(clx)}" cy="${round(cly)}" rx="${round(r)}" ry="${round(r * 0.6)}"/><ellipse cx="${round(clx - r * 0.7)}" cy="${round(cly + r * 0.2)}" rx="${round(r * 0.7)}" ry="${round(r * 0.5)}"/><ellipse cx="${round(clx + r * 0.7)}" cy="${round(cly + r * 0.2)}" rx="${round(r * 0.75)}" ry="${round(r * 0.5)}"/></g>`;
  }
  // ── ground plane (grass) + a thin sea + sand strip at the horizon (coastal OutRun) ──
  s += `<rect x="0" y="${round(yH)}" width="${W}" height="${round(H - yH)}" fill="url(#grass)"/>`;
  s += `<rect x="0" y="${round(yH - 14)}" width="${W}" height="14" fill="#1e6fd0"/>`;                 // sea
  s += `<rect x="0" y="${round(yH)}" width="${W}" height="8" fill="#e8c98a"/>`;                        // sand line

  // ── rainbow lanes (the road) ──
  for (let L = 0; L < N; L++) {
    const nl = edge(L / N, 0), nr = edge((L + 1) / N, 0), fl = edge(L / N, 1), fr = edge((L + 1) / N, 1);
    s += `<polygon points="${round(nl)},${round(y0)} ${round(nr)},${round(y0)} ${round(fr)},${round(yH)} ${round(fl)},${round(yH)}" fill="${BAND_LABELS[L].c}"/>`;
  }
  s += `<polygon points="${round(edge(0,0))},${round(y0)} ${round(edge(1,0))},${round(y0)} ${round(edge(1,1))},${round(yH)} ${round(edge(0,1))},${round(yH)}" fill="url(#roadfade)"/>`;

  // ── scrolling red/white rumble strips along each rail (clean, segment-based) ──
  const K = 26, ph = Math.floor(scroll * K);
  for (let k = 0; k < K; k++) {
    const ta = k / K, tb = (k + 1) / K, col = ((k + ph) % 2 === 0) ? "#e11d2a" : "#f8fafc";
    const kwa = clamp(30 * (1 - ta) + 3, 3, 34), kwb = clamp(30 * (1 - tb) + 3, 3, 34);
    const la = edge(0, ta), lb = edge(0, tb), ra = edge(1, ta), rb = edge(1, tb), ya = y(ta), yb = y(tb);
    s += `<polygon points="${round(la - kwa)},${round(ya)} ${round(la)},${round(ya)} ${round(lb)},${round(yb)} ${round(lb - kwb)},${round(yb)}" fill="${col}"/>`;
    s += `<polygon points="${round(ra)},${round(ya)} ${round(ra + kwa)},${round(ya)} ${round(rb + kwb)},${round(yb)} ${round(rb)},${round(yb)}" fill="${col}"/>`;
  }
  // faint lane dividers
  for (let i = 1; i < N; i++)
    s += `<line x1="${round(edge(i / N, 0))}" y1="${round(y0)}" x2="${round(edge(i / N, 1))}" y2="${round(yH)}" stroke="rgba(255,255,255,0.22)" stroke-width="1.3" stroke-dasharray="20 18"/>`;

  // ── roadside scenery on the grass, just OUTSIDE the rails, scrolling toward the viewer ──
  const S = 8;
  for (let k = 0; k < S; k++) {
    let t = ((k / S) - scroll) % 1; if (t < 0) t += 1; if (t < 0.03 || t > 0.97) continue;
    const sc = clamp(1.1 * (1 - t), 0.05, 1.1), yy = y(t), gap = (60 + 40) * sc;
    s += (k % 2 ? palm(edge(0, t) - gap, yy, sc) : bush(edge(0, t) - gap, yy, sc));
    s += ((k + 1) % 2 ? palm(edge(1, t) + gap, yy, sc) : bush(edge(1, t) + gap, yy, sc));
  }

  // ── the car ──
  const tCar = 0.02, laneW = edge((Math.round(carLane) + 1) / N, tCar) - edge(Math.round(carLane) / N, tCar);
  const cw = Math.abs(laneW) * 1.7, carX = laneCx(carLane, tCar), carY = y(tCar) - cw * 0.5 - 28;
  s += `<g transform="translate(${round(carX)},${round(carY)})">${car(cw, clamp(curve * 1.4, -1, 1))}</g>`;

  // ── retro arcade HUD ──
  const glow = bandCol(band);
  s += `<rect width="${W}" height="${round(H * 0.13)}" fill="url(#hud)"/>
    <text x="44" y="58" fill="#fde047" font-size="34" font-weight="800" font-family="sans-serif" letter-spacing="2" stroke="#7a1e00" stroke-width="1">SPX6900 · RAINBOW ROAD</text>
    <text x="44" y="98" fill="#f8fafc" font-size="22" font-family="sans-serif" letter-spacing="1">DATE <tspan fill="#fde047" font-weight="800">${esc(fDate(date)).toUpperCase()}</tspan>   PRICE <tspan fill="#fde047" font-weight="800">${esc(usd(price))}</tspan></text>`;
  // "BAND" plate (like STAGE) top-right
  s += `<rect x="${W - 360}" y="34" width="316" height="52" rx="8" fill="#0b1226" stroke="${glow}" stroke-width="2"/>
    <text x="${W - 344}" y="70" fill="#9aa4b4" font-size="22" font-weight="800" font-family="sans-serif">BAND</text>
    <text x="${W - 250}" y="70" fill="${glow}" font-size="26" font-weight="800" font-family="sans-serif">${esc(BAND_LABELS[clamp(band,0,N-1)].l.toUpperCase())}</text>`;
  // legend down the right (on its own panel so it stays readable over sky/clouds)
  const lx = W - 236, lyt = H * 0.13 + 20, lh = 30;
  s += `<rect x="${lx - 12}" y="${round(lyt - 14, 0)}" width="228" height="${round(N * lh + 16, 0)}" rx="8" fill="rgba(5,9,20,0.55)"/>`;
  for (let i = N - 1; i >= 0; i--) {
    const yy = lyt + (N - 1 - i) * lh, on = i === clamp(band, 0, N - 1);
    s += `<rect x="${lx}" y="${round(yy, 0)}" width="18" height="18" rx="3" fill="${BAND_LABELS[i].c}" stroke="${on ? "#fff" : "none"}" stroke-width="2"/>
      <text x="${lx + 26}" y="${round(yy + 15, 0)}" fill="${on ? "#f8fafc" : "#c8d1de"}" font-size="${on ? 19 : 16}" font-weight="${on ? 800 : 600}" font-family="sans-serif">${esc(BAND_LABELS[i].l)}</text>`;
  }
  s += `<rect x="0" y="${H - 9}" width="${W}" height="9" fill="rgba(255,255,255,0.14)"/><rect x="0" y="${H - 9}" width="${round(W * progress)}" height="9" fill="${glow}"/>`;
  return s;
}

const svg = (state, W, H) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1b4fd8"/><stop offset="70%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8ec5ff"/></linearGradient>
<linearGradient id="roadfade" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#0a0a12" stop-opacity="0.55"/></linearGradient>
<linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f7a37"/><stop offset="100%" stop-color="#2fa84a"/></linearGradient>
<linearGradient id="hud" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#050914" stop-opacity="0.9"/><stop offset="100%" stop-color="#050914" stop-opacity="0"/></linearGradient>
<linearGradient id="carbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff5a5a"/><stop offset="55%" stop-color="#e11d2a"/><stop offset="100%" stop-color="#8f0f18"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#3b82f6"/>
${scene({ ...state, W, H })}
</svg>`;

async function main() {
  const fmt = FORMATS[arg("format", "vertical")] || FORMATS.vertical;
  const fps = +arg("fps", "30"), seconds = +arg("seconds", "20"), out = arg("out", "out/rainbow-road.mp4"), from = arg("from", "");
  mkdirSync(dirname(out), { recursive: true });
  const m = buildModel(DEFAULT_RAW);
  let seq = DEFAULT_RAW.map(r => ({ date: r.date, price: r.price, band: bandIndex(m, r.price, dayN(r.date)) }));
  if (from) seq = seq.filter(r => r.date >= from);
  const total = fps * seconds;
  const bandAt = p => seq[clamp(Math.floor(p * (seq.length - 1)), 0, seq.length - 1)];
  const dir = mkdtempSync(join(tmpdir(), "lanevid-"));
  console.log(`rainbow road (OutRun) · ${fmt.W}×${fmt.H} · ${fps}fps · ${seconds}s (${total}f) · ${seq.length} weeks → ${out}`);
  let carLane = seq[0].band;
  try {
    for (let i = 0; i < total; i++) {
      const p = i / (total - 1), curr = bandAt(p);
      carLane += (curr.band - carLane) * 0.09;
      const curve = Math.sin(p * Math.PI * 5) * 0.3;
      const st = { carLane, band: curr.band, date: curr.date, price: curr.price, scroll: (i * 0.6 / fps) % 1, progress: p, curve };
      writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), new Resvg(svg(st, fmt.W, fmt.H), { fitTo: { mode: "width", value: fmt.W }, font: FONT }).render().asPng());
      if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    process.stdout.write(`\r  frame ${total}/${total}\n`);
    const ff = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
    await new Promise((res, rej) => spawn(ff, ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["ignore", "ignore", "inherit"] }).on("close", c => c === 0 ? res() : rej(new Error("ffmpeg " + c))));
    console.log(`✓ ${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
