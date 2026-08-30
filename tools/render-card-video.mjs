// 2D CARD → SHORT VIDEO. Renders a card's SVG as a time-lapse: the chart builds left→right (launch →
// today) as real weeks tick by, then holds on the finished frame. Frames go through Resvg → PNG →
// ffmpeg (H.264 MP4). Reusable across any card whose SVG generator accepts an `upTo` (0..1) reveal
// fraction; the Cost Basis Distribution ladder is the first. $0, no browser — runs in Node/CI.
//
//   node tools/render-card-video.mjs --card=costbasis --format=square   --out=out/costbasis-1x1.mp4
//   node tools/render-card-video.mjs --card=costbasis --format=vertical --out=out/costbasis-9x16.mp4
//   flags: --fps=30 --seconds=7 --hold=1.2 --field=cointime
import { Resvg } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { FONT } from "../scripts/bot/font.mjs";
import { costBasisSvg } from "../scripts/bot/cost-basis-card.mjs";

const readJson = p => JSON.parse(readFileSync(p, "utf8"));

// card id → { svg(data, opts), data() }. Add a card here to give it a video.
const CARDS = {
  costbasis: { svg: costBasisSvg, data: () => readJson("public/urpd-history.json") },
};
const FORMATS = {
  square:   { W: 1080, H: 1080 },   // X feed
  vertical: { W: 1080, H: 1920 },   // Reels / TikTok / Shorts
  wide:     { W: 1200, H: 675 },    // 16:9
};

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const smooth = t => t * t * (3 - 2 * t);   // smoothstep ease-in-out

async function main() {
  const cardId = arg("card", "costbasis");
  const fmtId = arg("format", "square");
  const card = CARDS[cardId], fmt = FORMATS[fmtId];
  if (!card) throw new Error(`unknown card: ${cardId}`);
  if (!fmt) throw new Error(`unknown format: ${fmtId}`);
  const fps = +arg("fps", "30"), seconds = +arg("seconds", "7"), hold = +arg("hold", "1.2");
  const field = arg("field", "");
  const out = arg("out", `out/${cardId}-${fmtId}.mp4`);
  mkdirSync(dirname(out), { recursive: true });

  const data = card.data();
  const revealFrames = Math.max(1, Math.round(fps * (seconds - hold)));
  const holdFrames = Math.max(1, Math.round(fps * hold));
  const total = revealFrames + holdFrames;

  const dir = mkdtempSync(join(tmpdir(), "cardvid-"));
  console.log(`${cardId} · ${fmtId} ${fmt.W}×${fmt.H} · ${fps}fps · ${seconds}s (${total} frames) → ${out}`);
  try {
    for (let i = 0; i < total; i++) {
      const t = i < revealFrames ? smooth(i / revealFrames) : 1;
      const upTo = 0.02 + t * 0.98;                 // start with a visible sliver, finish at 1
      const svg = card.svg(data, { W: fmt.W, H: fmt.H, upTo, field: field || undefined });
      if (!svg) throw new Error("card returned null (not enough data?)");
      const png = new Resvg(svg, { fitTo: { mode: "width", value: fmt.W }, font: FONT }).render().asPng();
      writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), png);
      if (i % 30 === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    process.stdout.write(`\r  frame ${total}/${total}\n`);

    const ffmpeg = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
    await new Promise((res, rej) => {
      const p = spawn(ffmpeg, ["-y", "-framerate", String(fps), "-i", join(dir, "f%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium", "-movflags", "+faststart", out],
        { stdio: ["ignore", "ignore", "inherit"] });
      p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c))));
    });
    console.log(`✓ ${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
