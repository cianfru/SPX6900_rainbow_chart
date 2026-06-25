// Band watcher — runs hourly. Posts to X only when SPX6900 crosses INTO a
// marquee band (Fire Sale / BUY / SELL / Max Bubble) AND the crossing is
// CONFIRMED (held for a few consecutive checks, so a transient wick can't fire),
// at most once per cooldown, and never more than one post per day across the bot.
// State lives in public/band-state.json (committed by the workflow). The first
// run with no state seeds silently. Dry-run does detection only: no state writes,
// no post (writes bandchange-preview.png so you can eyeball the card).
import { readFileSync, writeFileSync } from "node:fs";
import { fetchLivePrice, fetchHistory, computeStats } from "./stats.mjs";
import { buildBandChangePost, bandPostDecision, confirmBandCrossing, MARQUEE_BANDS, BAND_CONFIRM_READINGS } from "./posts.mjs";
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
const readPostState = () => { try { return JSON.parse(readFileSync(POST_STATE, "utf8")); } catch { return {}; } };
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10); // UTC calendar day

// Did ANY post (daily rotation OR a prior band alert) already go out today? One
// post per day across the whole bot — so we never stack on the daily, and a band
// alert claims the day's single slot (the daily then skips, seeing post-state).
const dailyPostedToday = readPostState().lastPostedDate === today();

const live = (await fetchLivePrice()) || { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
const history = await fetchHistory();
const stats = computeStats(live.price, undefined, { history });
const bi = stats.bandIndex;
const state = readState();
console.log(`price ${live.price} (${live.source}) · band ${bi} (${stats.band.l}) · dailyPostedToday=${dailyPostedToday}`);

// First run: seed the baseline, never post.
if (!state) {
  console.log("No prior state — seeding baseline, no post.");
  if (!dryRun) writeState({ band: bi, ts: nowIso(), armed: true, pendingBand: null, pendingCount: 0 });
  process.exit(0);
}

// Anti-spike confirmation: a band different from the last confirmed one must hold
// for BAND_CONFIRM_READINGS consecutive checks before it counts as a crossing.
const { pendingBand, pendingCount, confirmed } = confirmBandCrossing({ bi, state });

if (!confirmed) {
  // Parked, reverted, or still pending — update bookkeeping only, never post.
  // Re-arm only when genuinely parked back in a calm (non-marquee) confirmed band.
  const reArm = bi === state.band && !MARQUEE_BANDS.has(state.band) && state.armed === false;
  console.log(bi === state.band
    ? `No change (still ${stats.band.l}).`
    : `Pending band ${bi} (${pendingCount}/${BAND_CONFIRM_READINGS}) — unconfirmed, no post.`);
  if (!dryRun) writeState({ ...state, ts: nowIso(), pendingBand, pendingCount, armed: reArm ? true : state.armed });
  process.exit(0);
}

// --- a CONFIRMED crossing: state.band -> bi ---
const from = state.band;
const { marquee, armed, cooled, shouldPost } = bandPostDecision({ bi, state, dailyPostedToday });
console.log(`Confirmed band change ${from} -> ${bi} | marquee=${marquee} armed=${armed} cooled=${cooled} dailyPostedToday=${dailyPostedToday} => ${shouldPost ? "POST" : "skip"}`);

const post = buildBandChangePost(stats, from);

if (dryRun) {
  const media = await buildMedia(post, stats, { video: true, out: "bandchange-preview.mp4", portrait: true });
  const where = media.kind === "video" ? media.path : (writeFileSync("bandchange-preview.png", media.data), "bandchange-preview.png");
  console.log(`[DRY RUN — nothing posted, state untouched]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\n-> ${where}`);
  process.exit(0);
}

// Record the confirmed crossing immediately (clear pending, keep old lastPostTs)
// so we never re-detect it, even if the post is skipped or fails. `armed` carries
// the hysteresis state forward (calm re-arms; an extreme band keeps prior arming).
writeState({ band: bi, ts: nowIso(), lastPostTs: state.lastPostTs || null, armed, pendingBand: null, pendingCount: 0 });

if (!shouldPost) { console.log("State updated, no post (non-marquee, disarmed, within cooldown, or already posted today)."); process.exit(0); }
if (!hasCreds) { console.log("Marquee crossing, but X creds missing — state updated, no post."); process.exit(0); }

const media = await buildMedia(post, stats, { video: true, out: "bandchange.mp4", portrait: true });
const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  const id = await postWithMedia(client, post, stats, media);
  // Disarm on a real post: no more band alerts until price returns to a calm band.
  writeState({ band: bi, ts: nowIso(), lastPostTs: nowIso(), armed: false, pendingBand: null, pendingCount: 0 });
  // Claim the day's single post slot so the daily rotation skips today.
  writeFileSync(POST_STATE, JSON.stringify({ lastPostedDate: today(), lastId: "bandchange" }, null, 2) + "\n");
  console.log(`Posted band-change ✓ (${from} -> ${bi}, ${media.kind}) tweet ${id}`);
} catch (e) {
  console.error(`POST FAILED ✗ — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
