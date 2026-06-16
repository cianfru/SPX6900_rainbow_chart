// PROTOTYPE: animated rainbow card -> mp4. Renders the price line drawing in
// (with the "now" dot riding the edge), holds the final frame, then encodes
// with ffmpeg. CI runners ship ffmpeg; locally we use the ffmpeg-static binary.
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import ffmpegStatic from "ffmpeg-static";
import { rainbowSvg } from "../../src/rainbow-svg.js";
import { fetchLivePrice } from "./stats.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? Number(a.split("=")[1]) : d; };
const FPS = 30, DRAW_SEC = arg("draw", 6), HOLD_SEC = arg("hold", 2.5), W = 1200;
const DIR = "frames", OUT = process.argv.find(a => a.startsWith("--out="))?.split("=")[1] || "rainbow.mp4";
const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic; // CI can point at system ffmpeg

const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // ease-in-out, even pace

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR);
let f = 0;
const save = png => writeFileSync(`${DIR}/f${String(f++).padStart(4, "0")}.png`, png);

const drawN = Math.round(FPS * DRAW_SEC);
for (let i = 1; i <= drawN; i++) save(render(rainbowSvg(price, undefined, { reveal: Math.max(0.02, ease(i / drawN)) })));
const finalPng = render(rainbowSvg(price)); // full card (default behaviour) for the hold
for (let i = 0; i < Math.round(FPS * HOLD_SEC); i++) save(finalPng);

execFileSync(ffmpeg, [
  "-y", "-framerate", String(FPS), "-i", `${DIR}/f%04d.png`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT,
], { stdio: "inherit" });
rmSync(DIR, { recursive: true, force: true });
console.log(`\nwrote ${OUT} (${f} frames @ ${FPS}fps, price ${price})`);
