// Render the whale mosaic THROUGH THE CYCLE as a video: one frame per week from launch → today, every
// ≥100k-SPX wallet a square coloured by its ~30-day net flow (green adding, red reducing), sorted into
// a green→red gradient. Watch the mood-bands breathe — distribution swelling red into the euphoric top,
// green accumulation on the flushes. Moments flagged from the on-chain NRPL peaks. Hand-posted asset
// (the Node/Resvg bot pipeline posts stills; this stitches frames with ffmpeg-static → out/*.mp4).
//
//   node tools/render-whale-mosaic-video.mjs            # full render + stitch → out/whale-mosaic-cycle.mp4
//   node tools/render-whale-mosaic-video.mjs --frame=75 # render ONE frame → out/frame-75.png (layout test)
//   node tools/render-whale-mosaic-video.mjs --fps=8 --hold=10
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import ffmpeg from "ffmpeg-static";
import { FONT } from "../scripts/bot/font.mjs";
import { esc } from "../scripts/bot/svg-util.mjs";
import { loadTimeline, loadOnchainSeries, nrplPeaks, whalesAtWeek, dateOfWeek } from "../scripts/bot/whale-timeline.mjs";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const W = 1280, H = 720;
const GREEN = "#22c55e", RED = "#ef4444", FLAT = "#131b2e";
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function flowColor(net, bal) {
  const dust = Math.max(1000, bal * 0.005);
  if (!net || Math.abs(net) < dust) return FLAT;
  const t = Math.max(0.24, Math.min(1, Math.abs(net) / (bal * 0.12 || 1)));
  return net > 0 ? `rgb(${lerp(20, 34, t)},${lerp(83, 197, t)},${lerp(45, 94, t)})`
    : `rgb(${lerp(69, 239, t)},${lerp(10, 68, t)},${lerp(10, 68, t)})`;
}
const monY = d => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function frameSvg(tl, week, peaks) {
  const f = whalesAtWeek(tl, week);
  const date = dateOfWeek(tl, week), pct = n => Math.round(100 * n / (f.total || 1));
  // mosaic grid — fixed 44 columns, chunky squares
  const cols = 44, mL = 40, gTop = 168, gBot = H - 40;
  const pitch = Math.floor((W - mL * 2) / cols), sq = pitch - 2;
  let cells = "";
  f.rows.forEach((r, i) => {
    const x = mL + (i % cols) * pitch, y = gTop + Math.floor(i / cols) * pitch;
    if (y + sq > gBot) return;
    cells += `<rect x="${x}" y="${y}" width="${sq}" height="${sq}" rx="2" fill="${flowColor(r.net, r.bal)}"/>`;
  });
  // progress bar + moment flag
  const prog = week / (tl.n - 1);
  const near = k => k && Math.abs(k.week - week) <= 1;
  const flag = near(peaks?.euphoria) ? { t: "▲ EUPHORIA — the top", c: RED } : near(peaks?.capitulation) ? { t: "▼ CAPITULATION — the flush", c: GREEN } : (week === tl.n - 1 ? { t: "● TODAY", c: "#5eead4" } : null);
  const barY = 150, barW = W - mL * 2;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="vbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f1830"/><stop offset="60%" stop-color="#0a0f1f"/><stop offset="100%" stop-color="#06070f"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#vbg)"/>
<text x="${mL}" y="58" font-size="34" font-weight="800" font-family="sans-serif" fill="#f1f5f9">The whales, week by week</text>
<text x="${mL}" y="92" font-size="26" font-weight="700" font-family="sans-serif" fill="#e2e8f0">${esc(monY(date))}</text>
<text x="${W - mL}" y="58" text-anchor="end" font-size="24" font-weight="800" font-family="sans-serif" fill="${GREEN}">${f.buy} adding <tspan fill="#475569">·</tspan> <tspan fill="${RED}">${f.sell} cutting</tspan></text>
<text x="${W - mL}" y="90" text-anchor="end" font-size="19" font-family="monospace" fill="#94a3b8">${f.total} whales ≥100k · ${pct(f.buy)}% / ${pct(f.sell)}%</text>
${flag ? `<text x="${mL}" y="130" font-size="22" font-weight="800" font-family="sans-serif" fill="${flag.c}">${esc(flag.t)}</text>` : ""}
<rect x="${mL}" y="${barY}" width="${barW}" height="5" rx="2.5" fill="rgba(255,255,255,0.10)"/>
<rect x="${mL}" y="${barY}" width="${(barW * prog).toFixed(1)}" height="5" rx="2.5" fill="#5eead4"/>
${cells}
<text x="${mL}" y="${H - 12}" font-size="15" font-family="sans-serif" fill="#64748b">spx6900rainbow.xyz · every ≥100k-SPX wallet, coloured by ~30-day net flow · green adding, red reducing · Ethereum · reduced ≠ sold</text>
</svg>`;
}

const tl = loadTimeline(), peaks = nrplPeaks(loadOnchainSeries(), tl);
if (!tl?.wallets?.length) { console.error("no spx-timeline.json"); process.exit(1); }
const toPng = svg => new Resvg(svg, { fitTo: { mode: "width", value: W }, font: FONT }).render().asPng();

const single = arg("frame", null);
if (single != null) {
  const wk = Math.max(0, Math.min(tl.n - 1, +single));
  mkdirSync("out", { recursive: true });
  writeFileSync(`out/frame-${wk}.png`, toPng(frameSvg(tl, wk, peaks)));
  console.error(`out/frame-${wk}.png (${monY(dateOfWeek(tl, wk))})`);
  process.exit(0);
}

const fps = +arg("fps", 8), hold = +arg("hold", 12), every = +arg("every", 1);
const dir = "out/whale-frames";
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
let n = 0;
for (let wk = 0; wk < tl.n; wk += every) writeFileSync(`${dir}/f${String(n++).padStart(4, "0")}.png`, toPng(frameSvg(tl, wk, peaks)));
for (let k = 0; k < hold; k++) writeFileSync(`${dir}/f${String(n++).padStart(4, "0")}.png`, toPng(frameSvg(tl, tl.n - 1, peaks))); // hold today
console.error(`rendered ${n} frames → stitching…`);

mkdirSync("out", { recursive: true });
const outMp4 = "out/whale-mosaic-cycle.mp4";
const r = spawnSync(ffmpeg, ["-y", "-framerate", String(fps), "-i", `${dir}/f%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outMp4], { stdio: "inherit" });
if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
console.error(`✓ ${outMp4} (${n} frames @ ${fps}fps ≈ ${(n / fps).toFixed(1)}s)`);
