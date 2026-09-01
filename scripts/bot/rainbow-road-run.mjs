// Rainbow Road — ON-DEMAND render (triggered by the control-panel button via workflow_dispatch).
//
// There is deliberately NO auto band-watcher here: the owner already watches the band daily, and
// band-watch.mjs owns band detection. This just renders the video when asked — the requested formats
// with X-optimised settings (soften + high bitrate) into out/ — and exits. It NEVER posts.
//
//   node scripts/bot/rainbow-road-run.mjs [--formats=vertical,square|all] [--seconds=30] [--no-announce]
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const TOOL = fileURLToPath(new URL("tools/render-lane-video.mjs", ROOT));
const opt = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = f => process.argv.includes(f);

const seconds = opt("seconds", "30");
let formats = opt("formats", "vertical").split(",").map(s => s.trim()).filter(Boolean);
if (formats.includes("all")) formats = ["vertical", "square", "wide"];
const noAnnounce = has("--no-announce"), mute = has("--mute");

// Generate the original synthwave+engine soundtrack once (unless muted), then mux it into every clip.
let audioPath = "";
if (!mute) {
  const AUDIO_TOOL = fileURLToPath(new URL("tools/rainbow-road-audio.mjs", ROOT));
  audioPath = fileURLToPath(new URL("out/rainbow-road-audio.wav", ROOT));
  const g = spawnSync(process.execPath, [AUDIO_TOOL, `--out=${audioPath}`], { stdio: "inherit" });
  if (g.status !== 0) { console.error("(audio generation failed — rendering silent)"); audioPath = ""; }
}

console.log(`Rainbow Road → rendering ${formats.join(" + ")} · ${seconds}s${noAnnounce ? "" : " · finish card"}${audioPath ? " · sound" : " · silent"}`);

let ok = true;
for (const fmt of formats) {
  const out = fileURLToPath(new URL(`out/rainbow-road-${fmt}.mp4`, ROOT));   // stable names → stable release links
  // pixel=3 = pixelated but the HUD text stays readable in a single pass (no separate crisp layer); a light
  // soften + crf 16 keep it clean through X's re-encode. --announce=1 shows the "TO BE CONTINUED" finish card.
  const a = [TOOL, `--format=${fmt}`, `--seconds=${seconds}`, "--pixel=3", "--soften=0.5", "--crf=16", `--out=${out}`];
  if (!noAnnounce) a.push("--announce=1");
  if (audioPath) a.push(`--audio=${audioPath}`);
  console.log(`\n▶ ${fmt}`);
  const r = spawnSync(process.execPath, a, { stdio: "inherit" });
  if (r.status !== 0) { ok = false; console.error(`✗ render failed for ${fmt} (status ${r.status})`); }
}
if (!ok) { console.error("\n✗ one or more renders failed."); process.exit(1); }
console.log("\n✓ clips ready in out/ — review + post manually (nothing auto-posts).");
