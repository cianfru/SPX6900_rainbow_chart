// Rainbow Road — auto band-change clip runner.
//
// Watches the CONFIRMED valuation band (public/band-state.json, maintained by band-watch's anti-spike
// confirmation) and, whenever it changes, renders a short "SPX6900 IS NOW IN <BAND>" OutRun clip
// (vertical for Reels/TikTok/Shorts + square for the X feed) into out/. It NEVER posts — the clips are
// for the owner to review and post by hand (human-in-the-loop, like the rest of the bot). Band changes
// are rare (weeks/months apart), so this is quiet by construction.
//
// State: public/rainbow-road-state.json { band, label, ts } — the last band we rendered a clip for.
// Band-watch owns confirmation; we simply react to its confirmed band, so we never double-confirm.
//
//   node scripts/bot/rainbow-road-run.mjs [--dry-run] [--force] [--seconds=14] [--formats=vertical,square]
//
// --dry-run  detect only, render nothing.
// --force    render for the current band even if it hasn't changed (manual/test).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BAND_LABELS, buildModel, bandIndex, dayN } from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";

const ROOT = new URL("../../", import.meta.url);
const BAND_STATE = new URL("public/band-state.json", ROOT);
const RR_STATE = new URL("public/rainbow-road-state.json", ROOT);
const TOOL = new URL("tools/render-lane-video.mjs", ROOT);
const CONFIRM = 2;                         // a new band must hold this many consecutive runs before a clip fires (anti-wick)

const args = process.argv.slice(2);
const has = f => args.includes(f);
const opt = (k, d) => { const a = args.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dryRun = has("--dry-run"), force = has("--force");
const seconds = opt("seconds", "14");
const formats = opt("formats", "vertical,square").split(",").map(s => s.trim()).filter(Boolean);

const read = u => { try { return JSON.parse(readFileSync(u, "utf8")); } catch { return null; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const bandOf = i => clamp(i, 0, BAND_LABELS.length - 1);
const save = o => writeFileSync(RR_STATE, JSON.stringify({ ...o, ts: new Date().toISOString() }, null, 2) + "\n");

// Live current band. Primary: the same live price + stats band-watch uses (self-sufficient, doesn't need
// band-watch to have run). Fallbacks: band-watch's confirmed state, then the frozen model on bundled data.
async function liveBand() {
  try {
    const { fetchLivePrice, fetchHistory, computeStats } = await import("./stats.mjs");
    const live = await fetchLivePrice();
    if (live && Number.isFinite(live.price)) {
      const stats = computeStats(live.price, undefined, { history: await fetchHistory() });
      if (Number.isInteger(stats.bandIndex)) return { band: bandOf(stats.bandIndex), src: `live ${live.price} (${live.source})` };
    }
  } catch (e) { console.log(`(live band unavailable: ${e.message} — falling back)`); }
  const bs = read(BAND_STATE);
  if (bs && Number.isInteger(bs.band)) return { band: bandOf(bs.band), src: "band-state.json" };
  const m = buildModel(DEFAULT_RAW), last = DEFAULT_RAW.at(-1);
  return { band: bandOf(bandIndex(m, last.price, dayN(last.date))), src: "bundled model" };
}

const { band: curBand, src } = await liveBand();
const label = BAND_LABELS[curBand].l;
const rr = read(RR_STATE) || {};
console.log(`current band ${curBand} (${label}) via ${src} · last clip band ${Number.isInteger(rr.band) ? `${rr.band} (${BAND_LABELS[rr.band].l})` : "none"}`);

// First run: seed the baseline, render nothing (so we don't fire a clip on install).
if (!Number.isInteger(rr.band)) { console.log("no prior rainbow-road state — seeding baseline, no render."); if (!dryRun) save({ band: curBand, label, pending: null, pendingCount: 0 }); process.exit(0); }

if (curBand === rr.band && !force) {
  if (rr.pending != null && !dryRun) save({ band: rr.band, label: rr.label, pending: null, pendingCount: 0 }); // reverted → clear pending
  console.log("band unchanged — nothing to render."); process.exit(0);
}

// Anti-wick confirmation (skipped by --force): the new band must hold CONFIRM consecutive runs.
if (!force) {
  const pending = curBand, pendingCount = (rr.pending === curBand ? (rr.pendingCount || 0) : 0) + 1;
  if (pendingCount < CONFIRM) {
    console.log(`band change to "${label}" pending confirmation (${pendingCount}/${CONFIRM}) — no render yet.`);
    if (!dryRun) save({ band: rr.band, label: rr.label, pending, pendingCount });
    process.exit(0);
  }
  console.log(`band change to "${label}" CONFIRMED (${pendingCount}/${CONFIRM}).`);
}

if (dryRun) { console.log(`[dry-run] would render ${formats.join(" + ")} arrival clips for "${label}".`); process.exit(0); }

// Render each requested format. Assets default to tools/rainbow-road-assets/ inside the tool.
const outDir = new URL("out/", ROOT); mkdirSync(outDir, { recursive: true });
let allOk = true;
for (const fmt of formats) {
  const out = fileURLToPath(new URL(`rainbow-road-${slug(label)}-${fmt}.mp4`, outDir));
  console.log(`\n▶ rendering ${fmt} → ${out}`);
  // X-optimised master: soften the razor pixel edges (~1px ramp) + high bitrate (crf 16) so X's H.264
  // re-encode doesn't ring/block the hard edges. Still reads as pixel art; survives the transcode.
  const r = spawnSync(process.execPath, [fileURLToPath(TOOL), `--format=${fmt}`, `--seconds=${seconds}`, "--pixel=5", "--soften=0.8", "--crf=16", `--announce=${label}`, `--out=${out}`], { stdio: "inherit" });
  if (r.status !== 0) { allOk = false; console.error(`✗ render failed for ${fmt} (status ${r.status})`); }
}
// Only advance state if every clip rendered, so a transient failure re-tries next run.
if (allOk) { save({ band: curBand, label, pending: null, pendingCount: 0 }); console.log(`\n✓ band-arrival clips ready in out/ for "${label}". Review + post manually (nothing auto-posts).`); }
else { console.error("\n✗ one or more renders failed — state NOT advanced; will retry next run."); process.exit(1); }
