// Whale SPECTRUM ANALYZER through the cycle. 10 size cohorts (small → mega whales), each a vertical bar
// of 20 segments = 100% of that cohort's wallets: green from the bottom = % buying, red from the top =
// % selling, dark = holding flat. Played week-by-week it reads like an audio spectrum / equalizer — the
// bars rise as activity picks up into the tops and flushes, green in accumulation, red in distribution.
// Hand-posted asset: renders frames with Resvg, stitches with the bundled ffmpeg-static → out/*.mp4.
//
//   node tools/render-whale-spectrum-video.mjs             # full render + stitch → out/whale-spectrum.mp4
//   node tools/render-whale-spectrum-video.mjs --frame=75  # one frame → out/spectrum-75.png (layout test)
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import ffmpeg from "ffmpeg-static";
import { FONT } from "../scripts/bot/font.mjs";
import { esc } from "../scripts/bot/svg-util.mjs";
import { loadTimeline, loadOnchainSeries, nrplPeaks, whaleSpectrum, dateOfWeek } from "../scripts/bot/whale-timeline.mjs";

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const W = 1280, H = 720;
const GON = "#22c55e", GOFF = "#0f2a1c", RON = "#f43f5e", ROFF = "#2a1220", DARK = "#0c1424";
const monY = d => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function frameSvg(tl, week, peaks) {
  const cohorts = whaleSpectrum(tl, week);
  const date = dateOfWeek(tl, week), SEG = 20;
  const gTop = 176, gBot = H - 96, gridH = gBot - gTop;
  const mL = 56, colW = (W - mL * 2) / cohorts.length;
  const barW = Math.min(84, colW - 16), segGap = 3, segH = (gridH - segGap * (SEG - 1)) / SEG;

  let bars = "", labels = "";
  cohorts.forEach((c, i) => {
    const cx = mL + i * colW + colW / 2, bx = cx - barW / 2;
    const gN = c.total ? Math.round(SEG * c.buy / c.total) : 0;
    const rN = c.total ? Math.round(SEG * c.sell / c.total) : 0;
    for (let s = 0; s < SEG; s++) {
      const y = gBot - (s + 1) * segH - s * segGap;                 // s=0 at the bottom
      let on, off;
      if (s < gN) { on = GON; off = GOFF; }                          // green: buying, from the bottom
      else if (s >= SEG - rN) { on = RON; off = ROFF; }              // red: selling, from the top
      else { on = null; off = DARK; }                                // dark: flat / unlit
      const lit = on !== null;
      const op = lit ? (0.55 + 0.45 * ((s < gN ? (s + 1) / Math.max(1, gN) : (SEG - s) / Math.max(1, rN)))) : 1;
      bars += `<rect x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" rx="2" fill="${lit ? on : off}" fill-opacity="${lit ? op.toFixed(2) : 1}"/>`;
    }
    // cohort label + count
    labels += `<text x="${cx.toFixed(1)}" y="${gBot + 26}" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="#8ea1bd">${esc(c.label)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${gBot + 46}" text-anchor="middle" font-family="monospace" font-size="13" fill="#5b6675">${c.total}</text>`;
  });

  const near = k => k && Math.abs(k.week - week) <= 1;
  const flag = near(peaks?.euphoria) ? { t: "▲ EUPHORIA", c: RON } : near(peaks?.capitulation) ? { t: "▼ CAPITULATION", c: GON } : (week === tl.n - 1 ? { t: "● TODAY", c: "#5eead4" } : null);
  const prog = week / (tl.n - 1), barY = 150, pbW = W - mL * 2;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#06070f"/>
<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="16" fill="#080b14" stroke="rgba(255,255,255,0.06)"/>
<text x="${mL}" y="60" font-size="32" font-weight="800" font-family="sans-serif" fill="#f1f5f9">Whale spectrum <tspan font-size="19" font-weight="600" fill="#5eead4">· by size, buying vs selling</tspan></text>
<text x="${mL}" y="92" font-size="24" font-weight="700" font-family="sans-serif" fill="#e2e8f0">${esc(monY(date))}</text>
<text x="${W - mL}" y="60" text-anchor="end" font-size="18" font-family="monospace" fill="#8ea1bd"><tspan fill="${GON}">green = buying</tspan> · <tspan fill="${RON}">red = selling</tspan> · 20 = 100% of cohort</text>
${flag ? `<text x="${W - mL}" y="92" text-anchor="end" font-size="22" font-weight="800" font-family="sans-serif" fill="${flag.c}">${esc(flag.t)}</text>` : ""}
<rect x="${mL}" y="${barY}" width="${pbW}" height="5" rx="2.5" fill="rgba(255,255,255,0.10)"/>
<rect x="${mL}" y="${barY}" width="${(pbW * prog).toFixed(1)}" height="5" rx="2.5" fill="#5eead4"/>
${bars}${labels}
<text x="${mL}" y="${H - 16}" font-size="14" font-family="sans-serif" fill="#64748b">spx6900rainbow.xyz · every ≥100k-SPX wallet grouped by size · ~30-day net flow · Ethereum · reduced ≠ sold</text>
</svg>`;
}

const tl = loadTimeline(), peaks = nrplPeaks(loadOnchainSeries(), tl);
if (!tl?.wallets?.length) { console.error("no spx-timeline.json"); process.exit(1); }
const toPng = svg => new Resvg(svg, { fitTo: { mode: "width", value: W }, font: FONT }).render().asPng();

const single = arg("frame", null);
if (single != null) {
  const wk = Math.max(0, Math.min(tl.n - 1, +single));
  mkdirSync("out", { recursive: true });
  writeFileSync(`out/spectrum-${wk}.png`, toPng(frameSvg(tl, wk, peaks)));
  console.error(`out/spectrum-${wk}.png (${monY(dateOfWeek(tl, wk))})`);
  process.exit(0);
}

const fps = +arg("fps", 8), hold = +arg("hold", 14), every = +arg("every", 1);
const dir = "out/spectrum-frames";
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
let n = 0;
for (let wk = 0; wk < tl.n; wk += every) writeFileSync(`${dir}/f${String(n++).padStart(4, "0")}.png`, toPng(frameSvg(tl, wk, peaks)));
for (let k = 0; k < hold; k++) writeFileSync(`${dir}/f${String(n++).padStart(4, "0")}.png`, toPng(frameSvg(tl, tl.n - 1, peaks)));
console.error(`rendered ${n} frames → stitching…`);
mkdirSync("out", { recursive: true });
const outMp4 = "out/whale-spectrum.mp4";
const r = spawnSync(ffmpeg, ["-y", "-framerate", String(fps), "-i", `${dir}/f%04d.png`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outMp4], { stdio: "inherit" });
if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
console.error(`✓ ${outMp4} (${n} frames @ ${fps}fps ≈ ${(n / fps).toFixed(1)}s)`);
