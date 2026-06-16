// Animated rainbow card -> mp4. The price line draws in (readout + dot walk the
// journey through history), then the now-dot pulses on a hold. resvg renders the
// frames, ffmpeg encodes H.264. CI runners ship ffmpeg; locally we fall back to
// the ffmpeg-static binary. Exported renderRainbowVideo() is used by the bot.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import { rainbowSvg } from "../../src/rainbow-svg.js";

// Prefer an explicit FFMPEG_PATH (e.g. the runner's system ffmpeg), then the
// bundled static binary, then plain "ffmpeg" on PATH — so it works everywhere.
const FFMPEG = process.env.FFMPEG_PATH
  || (await import("ffmpeg-static").then(m => m.default).catch(() => null))
  || "ffmpeg";
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // ease-in-out, even pace

// Render the animated card to `out` (mp4) and return the path. ~10s by default
// (7s draw-in + 3s hold). Throws if ffmpeg/resvg fail (callers fall back to PNG).
export async function renderRainbowVideo({ price, draw = 7, hold = 3, fps = 30, out = "bot-video.mp4" }) {
  const W = 1200;
  const dir = `frames-${process.pid}-${Date.now()}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  try {
    const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
    let f = 0;
    const save = png => writeFileSync(`${dir}/f${String(f++).padStart(4, "0")}.png`, png);
    const drawN = Math.round(fps * draw), holdN = Math.round(fps * hold);
    for (let i = 1; i <= drawN; i++) save(render(rainbowSvg(price, undefined, { reveal: Math.max(0.02, ease(i / drawN)) })));
    const pp = Math.round(fps * 1.1); // ~1 pulse/sec
    for (let i = 0; i < holdN; i++) save(render(rainbowSvg(price, undefined, { reveal: 1, pulse: (i % pp) / pp })));
    execFileSync(FFMPEG, [
      "-y", "-framerate", String(fps), "-i", `${dir}/f%04d.png`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], { stdio: "ignore" });
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
