// Rainbow Road — ON-DEMAND render (triggered by the control-panel button via workflow_dispatch).
//
// There is deliberately NO auto band-watcher here: the owner already watches the band daily, and
// band-watch.mjs owns band detection. This just renders the video when asked. It computes the CURRENT
// valuation band only to label the "SPX6900 IS NOW IN <BAND>" banner, renders the requested formats with
// X-optimised settings (soften + high bitrate) into out/, and exits. It NEVER posts.
//
//   node scripts/bot/rainbow-road-run.mjs [--formats=vertical,square|all] [--seconds=30] [--no-announce]
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BAND_LABELS, buildModel, bandIndex, dayN } from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";

const ROOT = new URL("../../", import.meta.url);
const TOOL = fileURLToPath(new URL("tools/render-lane-video.mjs", ROOT));
const opt = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = f => process.argv.includes(f);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const seconds = opt("seconds", "30");
let formats = opt("formats", "vertical").split(",").map(s => s.trim()).filter(Boolean);
if (formats.includes("all")) formats = ["vertical", "square", "wide"];
const noAnnounce = has("--no-announce");

// Current band → banner label. Live price if reachable; else the frozen model on bundled data.
async function currentLabel() {
  try {
    const { fetchLivePrice, fetchHistory, computeStats } = await import("./stats.mjs");
    const live = await fetchLivePrice();
    if (live && Number.isFinite(live.price)) {
      const s = computeStats(live.price, undefined, { history: await fetchHistory() });
      if (Number.isInteger(s.bandIndex)) return BAND_LABELS[clamp(s.bandIndex, 0, BAND_LABELS.length - 1)].l;
    }
  } catch (e) { console.log(`(live band unavailable: ${e.message} — using bundled model)`); }
  const m = buildModel(DEFAULT_RAW), last = DEFAULT_RAW.at(-1);
  return BAND_LABELS[clamp(bandIndex(m, last.price, dayN(last.date)), 0, BAND_LABELS.length - 1)].l;
}

const label = noAnnounce ? "" : await currentLabel();
console.log(`Rainbow Road → rendering ${formats.join(" + ")} · ${seconds}s${label ? ` · banner "${label}"` : ""}`);

let ok = true;
for (const fmt of formats) {
  const out = fileURLToPath(new URL(`out/rainbow-road-${fmt}.mp4`, ROOT));   // stable names → stable release links
  // pixel=3 = pixelated but the HUD text stays readable in a single pass (no separate crisp layer); a light
  // soften + crf 16 keep it clean through X's re-encode.
  const a = [TOOL, `--format=${fmt}`, `--seconds=${seconds}`, "--pixel=3", "--soften=0.5", "--crf=16", `--out=${out}`];
  if (label) a.push(`--announce=${label}`);
  console.log(`\n▶ ${fmt}`);
  const r = spawnSync(process.execPath, a, { stdio: "inherit" });
  if (r.status !== 0) { ok = false; console.error(`✗ render failed for ${fmt} (status ${r.status})`); }
}
if (!ok) { console.error("\n✗ one or more renders failed."); process.exit(1); }
console.log("\n✓ clips ready in out/ — review + post manually (nothing auto-posts).");
