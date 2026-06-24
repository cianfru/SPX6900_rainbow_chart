// Band watcher — runs hourly. Posts to X only when SPX6900 crosses INTO a
// marquee band (Fire Sale / BUY / SELL / Max Bubble), at most once per cooldown.
// State lives in public/band-state.json (committed by the workflow). The first
// run with no state seeds silently. Dry-run does detection only: no state writes,
// no post (writes bandchange-preview.png so you can eyeball the card).
import { readFileSync, writeFileSync } from "node:fs";
import { fetchLivePrice, fetchHistory, computeStats } from "./stats.mjs";
import { buildBandChangePost, bandPostDecision } from "./posts.mjs";
import { buildMedia, postWithMedia } from "./media.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

const STATE = new URL("../../public/band-state.json", import.meta.url);
const POST_STATE = new URL("../../public/post-state.json", import.meta.url); // daily rotation's state
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);

const readState = () => { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return null; } };
const writeState = o => writeFileSync(STATE, JSON.stringify(o, null, 2) + "\n");
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10); // UTC calendar day

// Did the daily auto-rotation post already fire today? If so we suppress band
// alerts entirely — piling a band post on top of the daily is just fatigue.
const dailyPostedToday = (() => {
  try { return JSON.parse(readFileSync(POST_STATE, "utf8"))?.lastPostedDate === today(); }
  catch { return false; }
})();

const live = (await fetchLivePrice()) || { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
const history = await fetchHistory();
const stats = computeStats(live.price, undefined, { history });
const bi = stats.bandIndex;
const state = readState();
console.log(`price ${live.price} (${live.source}) · band ${bi} (${stats.band.l}) · dailyPostedToday=${dailyPostedToday}`);

// Guardrails (anti-flap hysteresis + cooldown + daily suppression) live in the
// pure, tested bandPostDecision; this script just acts on its verdict + writes state.
const { calm, armed, marquee, cooled, shouldPost } = bandPostDecision({ bi, state, dailyPostedToday });

// First run: seed the baseline, never post.
if (!state) {
  console.log("No prior state — seeding baseline, no post.");
  if (!dryRun) writeState({ band: bi, ts: nowIso(), armed });
  process.exit(0);
}

if (bi === state.band) {
  // Parked in the same band: re-arm if we've drifted back to a calm zone (covers
  // state written before this guard existed). Only writes on an actual flip.
  if (calm && state.armed === false && !dryRun) writeState({ ...state, armed: true });
  console.log(`No change (still ${stats.band.l}).`);
  process.exit(0);
}

const from = state.band;
console.log(`Band change ${from} -> ${bi} | marquee=${marquee} armed=${armed} cooled=${cooled} dailyPostedToday=${dailyPostedToday} => ${shouldPost ? "POST" : "skip"}`);

const post = buildBandChangePost(stats, from);

if (dryRun) {
  const media = await buildMedia(post, stats, { video: true, out: "bandchange-preview.mp4", portrait: true });
  const where = media.kind === "video" ? media.path : (writeFileSync("bandchange-preview.png", media.data), "bandchange-preview.png");
  console.log(`[DRY RUN — nothing posted, state untouched]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\n-> ${where}`);
  process.exit(0);
}

// Record the crossing immediately (keep old lastPostTs) so we never re-detect it,
// even if the post itself is skipped or fails. `armed` carries the hysteresis
// state forward (calm band re-arms; an extreme band keeps the prior arming).
writeState({ band: bi, ts: nowIso(), lastPostTs: state.lastPostTs || null, armed });

if (!shouldPost) { console.log("State updated, no post (non-marquee, disarmed, within cooldown, or daily already posted)."); process.exit(0); }
if (!hasCreds) { console.log("Marquee crossing, but X creds missing — state updated, no post."); process.exit(0); }

const media = await buildMedia(post, stats, { video: true, out: "bandchange.mp4", portrait: true });
const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  const id = await postWithMedia(client, post, stats, media);
  // Disarm on a real post: no more band alerts until price returns to a calm band.
  writeState({ band: bi, ts: nowIso(), lastPostTs: nowIso(), armed: false });
  console.log(`Posted band-change ✓ (${from} -> ${bi}, ${media.kind}) tweet ${id}`);
} catch (e) {
  console.error(`POST FAILED ✗ — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
