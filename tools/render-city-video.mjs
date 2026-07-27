// Render the city fly-through to an MP4 you can post.
//
//   node tools/render-city-video.mjs [--chart=whalewatch|aeonskyline] [--w=1280] [--h=720]
//                                    [--secs=28] [--fps=24] [--out=city.mp4] [--port=4699]
//
// Frames are driven by window.__citySeek(progress) rather than wall-clock, so the path is
// frame-accurate no matter how slow the renderer is — which matters here, since CI has no GPU.
// It also means --secs sets the SPEED, not just the length: the same path is sampled at more
// points, so a bigger number is a slower, calmer flight rather than a longer one.
// Requires a built site (npm run build) and a preview server on --port.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const CHART = arg("chart", "whalewatch"), W = +arg("w", 1280), H = +arg("h", 720);
const SECS = +arg("secs", 28), FPS = +arg("fps", 24), OUT = arg("out", "city.mp4"), PORT = +arg("port", 4699);
const FRAMES = Math.round(SECS * FPS);

const dir = mkdtempSync(join(tmpdir(), "cityvid-"));
console.log(`rendering ${FRAMES} frames at ${W}x${H} → ${OUT}`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// skip the dev gate + the first-visit explainer so the frame is pure city
await page.addInitScript(() => { try { localStorage.setItem("spx-city-dev", "1"); localStorage.setItem("spx-city-dev-intro", "1"); } catch {} });
await page.goto(`http://localhost:${PORT}/?chart=${CHART}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__cityReady === true, { timeout: 180000 });
// full-bleed canvas: hide the page chrome so the video is just the city
await page.addStyleTag({ content: `body>*:not(:has(canvas)){display:none!important}
  canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:9999}` });
await page.waitForTimeout(1500);

const canvas = await page.$("canvas");
for (let i = 0; i < FRAMES; i++) {
  await page.evaluate(u => window.__citySeek(u), i / (FRAMES - 1));
  await canvas.screenshot({ path: join(dir, `f${String(i).padStart(5, "0")}.png`) });
  if (i % 24 === 0) process.stdout.write(`\r  frame ${i}/${FRAMES}`);
}
console.log(`\r  frame ${FRAMES}/${FRAMES} — encoding…`);
await browser.close();

const ffmpeg = (await import("node:child_process")).execSync("python3 -c \"import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())\"").toString().trim();
await new Promise((res, rej) => {
  const p = spawn(ffmpeg, ["-y", "-framerate", String(FPS), "-i", join(dir, "f%05d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", OUT], { stdio: "inherit" });
  p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg " + c))));
});
rmSync(dir, { recursive: true, force: true });
console.log(`\n✓ ${OUT}`);
