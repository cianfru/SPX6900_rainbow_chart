// Animated cards -> mp4. A chart "draws in" (the series reveals left→right with
// the marker on the leading edge), then the marker pulses on a hold. resvg
// renders the frames, ffmpeg encodes H.264. CI runners ship ffmpeg; locally we
// fall back to the ffmpeg-static binary.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import { rainbowSvg } from "../../src/rainbow-svg.js";
import { lineCardSvg, cubeCardSvg, scaleCardSvg } from "./charts.mjs";

// Prefer an explicit FFMPEG_PATH (e.g. the runner's system ffmpeg), then the
// bundled static binary, then plain "ffmpeg" on PATH — so it works everywhere.
const FFMPEG = process.env.FFMPEG_PATH
  || (await import("ffmpeg-static").then(m => m.default).catch(() => null))
  || "ffmpeg";
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // ease-in-out, even pace

// Generic encoder: svgAt(reveal, pulse) -> svg string. Draw phase passes
// reveal 0..1 (pulse null); hold phase passes reveal 1 + pulse 0..1.
async function renderVideo({ svgAt, draw = 7, hold = 3, fps = 30, out = "bot-video.mp4", width = 1200 }) {
  const dir = `frames-${process.pid}-${Date.now()}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  try {
    const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
    let f = 0;
    const save = b => writeFileSync(`${dir}/f${String(f++).padStart(4, "0")}.png`, b);
    const drawN = Math.round(fps * draw), holdN = Math.round(fps * hold);
    for (let i = 1; i <= drawN; i++) save(render(svgAt(Math.max(0.02, ease(i / drawN)), null)));
    const pp = Math.round(fps * 1.1); // ~1 pulse/sec
    for (let i = 0; i < holdN; i++) save(render(svgAt(1, (i % pp) / pp)));
    execFileSync(FFMPEG, [
      "-y", "-framerate", String(fps), "-i", `${dir}/f%04d.png`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], { stdio: "ignore" });
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ~10s by default (7s draw-in + 3s hold). Both throw if ffmpeg/resvg fail so
// callers can fall back to a PNG.
export function renderRainbowVideo({ price, draw = 7, hold = 3, fps = 30, out = "bot-video.mp4", dims = {} }) {
  return renderVideo({ draw, hold, fps, out, width: dims.W ?? 1200, svgAt: (r, p) => rainbowSvg(price, undefined, p == null ? { reveal: r, ...dims } : { reveal: 1, pulse: p, ...dims }) });
}
export function renderLineVideo({ spec, draw = 7, hold = 3, fps = 30, out = "bot-video.mp4", dims = {}, revealFromX } = {}) {
  return renderVideo({ draw, hold, fps, out, width: dims.W ?? 1200, svgAt: (r, p) => lineCardSvg(spec, p == null ? { reveal: r, revealFromX, ...dims } : { reveal: 1, pulse: p, ...dims }) });
}
// Cube card: piles stack up + the ×label rolls (draw), then the faces shimmer (hold).
export function renderCubeVideo({ spec, draw = 7, hold = 3, fps = 30, out = "bot-video.mp4" }) {
  return renderVideo({ draw, hold, fps, out, svgAt: (r, p) => cubeCardSvg(spec, p == null ? { reveal: r } : { reveal: 1, spin: p }) });
}
// Scale card: camera zooms out from the origin cube to the full field, ×label
// rolling 1→huge (draw), then the origin ring pulses (hold).
export function renderScaleVideo({ spec, draw = 8, hold = 2, fps = 30, out = "bot-video.mp4", dims = {} }) {
  return renderVideo({ draw, hold, fps, out, width: dims.W ?? 1200, svgAt: (r, p) => scaleCardSvg(spec, p == null ? { reveal: r, ...dims } : { reveal: 1, pulse: p, ...dims }) });
}

// CLI: node scripts/bot/video.mjs [--draw=7 --hold=3 --out=rainbow.mp4]
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
  const { fetchLivePrice } = await import("./stats.mjs");
  const { DEFAULT_RAW } = await import("../../src/data.js");
  const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
  const out = await renderRainbowVideo({ price, draw: Number(arg("draw", 7)), hold: Number(arg("hold", 3)), out: arg("out", "rainbow.mp4") });
  console.log(`wrote ${out} (price ${price})`);
}
