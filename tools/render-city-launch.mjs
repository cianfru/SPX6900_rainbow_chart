// SPX City 1.0 launch flythrough — a scripted cinematic path:
//   the Statue of Liberty → across an avenue → Central Park → climb out to a bird's-eye.
//
//   node tools/render-city-launch.mjs [--w=1920] [--h=1080] [--secs=26] [--fps=30]
//                                     [--time=dusk|day|night] [--out=spx-city-1.0.mp4] [--port=4699]
//   node tools/render-city-launch.mjs --stills[=/tmp/citykeys]   # render the keyframe stills only
//
// The path is driven through window.__cityCam(pos, target, fov) frame by frame, so it is
// FRAME-ACCURATE regardless of GPU speed — the same file renders identically on a laptop GPU or a
// software rasteriser, it just takes longer on the latter. Nothing here touches Dune/Alchemy/API
// credits; it is pure local rendering. RUN IT ON A REAL GPU for the launch cut — the sandbox's
// SwiftShader renderer is slower and flatter (no proper bloom/reflections) than the city really is.
//
// Requires a built site (npm run build) and a preview server on --port (see the bottom of this file
// for the one-liner). ffmpeg comes from imageio-ffmpeg or the system.
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`) || s === `--${k}`); return a ? (a.includes("=") ? a.split("=")[1] : true) : d; };
const W = +arg("w", 1920), H = +arg("h", 1080), SECS = +arg("secs", 26), FPS = +arg("fps", 30);
const TIME = arg("time", "dusk"), OUT = arg("out", "spx-city-1.0.mp4"), PORT = +arg("port", 4699);
const STILLS = arg("stills", false);
const FRAMES = Math.round(SECS * FPS);

// ── the camera path ─────────────────────────────────────────────────────────────────────────────
// World coordinates (the city is ~209 units long). Each key is { p: eye, t: look-at, fov }. The
// harbour monument (Statue of Liberty / the burn) sits at (-65.7,-102); Central Park's centre is
// (0.8, 1.84); the island runs through the origin. Tuned so each beat lands: hero on the statue,
// a low pass up an avenue, a level glide over the park, then a rising pull-back to the whole metro.
const KEYS = [
  { p: [-76, 10, -114], t: [-65, 7, -102], fov: 52 },   // 0 · hero the Statue of Liberty, city behind
  { p: [-48, 18, -74],  t: [-22, 6, -36],  fov: 54 },   // 1 · lift off the water, turn to the island
  { p: [-14, 12, -32],  t: [-1, 6, -8],    fov: 56 },   // 2 · drop toward downtown, onto an avenue
  { p: [-1, 8, -12],    t: [1.5, 4, 10],   fov: 58 },   // 3 · low up the avenue, between the towers
  { p: [-4, 14, 13],    t: [0.8, 2, 1.84], fov: 52 },   // 4 · glide over Central Park
  { p: [9, 44, 36],     t: [0, 2, -2],     fov: 50 },   // 5 · climb out, the park falling away
  { p: [16, 98, 70],    t: [-2, 0, -16],   fov: 46 },   // 6 · bird's-eye over the whole metropolis
];

const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);         // ease-in-out, gentle at both ends
const cr = (a, b, c, d, s) => {                                    // Catmull-Rom, one component
  const s2 = s * s, s3 = s2 * s;
  return 0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
};
function camAt(u) {
  const e = smoother(Math.max(0, Math.min(1, u)));
  const n = KEYS.length - 1, f = e * n, i = Math.min(n - 1, Math.floor(f)), s = f - i;
  const k = j => KEYS[Math.max(0, Math.min(n, j))];
  const comp = (sel, ci) => cr(k(i - 1)[sel][ci], k(i)[sel][ci], k(i + 1)[sel][ci], k(i + 2)[sel][ci], s);
  return {
    p: [comp("p", 0), comp("p", 1), comp("p", 2)],
    t: [comp("t", 0), comp("t", 1), comp("t", 2)],
    fov: cr(k(i - 1).fov, k(i).fov, k(i + 1).fov, k(i + 2).fov, s),
  };
}

// On a real GPU (your Mac) use it — that's the whole point of rendering there, and it's what gives
// the bloom/reflections/crisp look. Pass --soft to force the software rasteriser (the sandbox has no
// GPU, so it must; a real machine should NOT). executablePath falls back to Playwright's own
// Chromium when the sandbox's pre-installed one isn't present.
const SOFT = arg("soft", false);
const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({
  executablePath: exe,
  args: SOFT ? ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-gl=angle", "--use-angle=default", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.addInitScript(() => { try { localStorage.setItem("spx-city-dev2", "1"); localStorage.setItem("spx-city-dev2-intro", "1"); } catch {} });
await page.goto(`http://localhost:${PORT}/?chart=whalewatch&cinema=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__cityReady === true, { timeout: 180000 });
await page.waitForTimeout(1500);
// time of day
if (TIME !== "dusk") { try { await page.getByRole("button", { name: /Settings/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("radio", { name: new RegExp(TIME, "i") }).click(); await page.waitForTimeout(2500); } catch {} }

const shoot = async (u, path) => { const c = camAt(u); await page.evaluate(v => window.__cityCam(v.p, v.t, v.fov), c); await page.waitForTimeout(STILLS ? 400 : 0); await page.screenshot({ path }); };

if (STILLS) {
  const dir = typeof STILLS === "string" ? STILLS : "/tmp/citykeys";
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < KEYS.length; i++) await shoot(i / (KEYS.length - 1), join(dir, `k${i}.png`));
  console.log(`✓ ${KEYS.length} keyframe stills → ${dir}`);
  await browser.close();
} else {
  const dir = mkdtempSync(join(tmpdir(), "citylaunch-"));
  console.log(`rendering ${FRAMES} frames at ${W}x${H} (${TIME}) → ${OUT}`);
  for (let i = 0; i < FRAMES; i++) {
    await shoot(i / (FRAMES - 1), join(dir, `f${String(i).padStart(5, "0")}.png`));
    if (i % FPS === 0) process.stdout.write(`\r  frame ${i}/${FRAMES}`);
  }
  console.log(`\r  frame ${FRAMES}/${FRAMES} — encoding…`);
  await browser.close();
  let ffmpeg; try { ffmpeg = execSync("python3 -c \"import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())\"").toString().trim(); }
  catch { ffmpeg = "ffmpeg"; }
  await new Promise((res, rej) => {
    const p = spawn(ffmpeg, ["-y", "-framerate", String(FPS), "-i", join(dir, "f%05d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", OUT], { stdio: "inherit" });
    p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg " + c))));
  });
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n✓ ${OUT}`);
}

// Preview server one-liner (run in another shell, from the repo root, after `npm run build`):
//   npx --yes http-server dist -p 4699 -s   # or any static server that serves ./dist on :4699
