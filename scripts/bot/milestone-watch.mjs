// Milestone watcher — runs hourly. Posts to X only when SPX6900's market cap
// first passes a GIANT on the board (CRYPTO_MILESTONES: PEPE / SHIB / DOGE ATH
// caps, BTC market-cap levels…). Each rung is celebrated once, ever: state tracks
// the highest milestone ever crossed, so a retrace + re-cross never re-fires.
// State lives in public/milestone-state.json (committed by the workflow). The
// first run with no state seeds silently. Dry-run does detection only: no state
// writes, no post (writes milestone-preview.png so you can eyeball the card).
import { readFileSync, writeFileSync } from "node:fs";
import { fetchLivePrice, fetchHistory, computeStats } from "./stats.mjs";
import { buildMilestonePost } from "./posts.mjs";
import { buildMedia, postWithMedia } from "./media.mjs";
import { lanePostedToday, recordLanePost, bandSoloToday } from "./posts.mjs";
import { CRYPTO_MILESTONES } from "../../src/milestones.js";
import { DEFAULT_RAW } from "../../src/data.js";

const STATE = new URL("../../public/milestone-state.json", import.meta.url);
const POST_STATE = new URL("../../public/post-state.json", import.meta.url); // shared one-per-day guard
const COOLDOWN_MS = 6 * 3600 * 1000; // min gap between milestone posts (safety vs. state-commit races)
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
// One post per day across the whole bot: if anything posted today, stay quiet.
const dailyPostedToday = () => readPostState().lastPostedDate === today();

// Index of the highest milestone whose price SPX has reached (-1 = none yet).
const highestCrossed = price => {
  let hi = -1;
  CRYPTO_MILESTONES.forEach((m, i) => { if (price >= m.price) hi = i; });
  return hi;
};

const live = (await fetchLivePrice()) || { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
const history = await fetchHistory();
const stats = computeStats(live.price, undefined, { history });
const cur = highestCrossed(live.price);
const curLabel = cur >= 0 ? CRYPTO_MILESTONES[cur].label : "none";
const state = readState();
console.log(`price ${live.price} (${live.source}) · highest milestone crossed: ${cur} (${curLabel})`);

// First run: seed the baseline, never post.
if (!state) {
  console.log("No prior state — seeding baseline, no post.");
  if (!dryRun) writeState({ highest: cur, label: curLabel, ts: nowIso() });
  process.exit(0);
}

if (cur <= state.highest) { console.log(`No new milestone (still at ${state.highest}).`); process.exit(0); }

// SPX flipped one or more new giants since last seen — celebrate the highest one.
const from = state.highest;
const cooled = !state.lastPostTs || Date.now() - Date.parse(state.lastPostTs) >= COOLDOWN_MS;
const postedToday = lanePostedToday("milestone");
const soloBand = bandSoloToday();   // a rainbow band announcement owns the day
const shouldPost = cooled && !postedToday && !soloBand;
console.log(`New milestone ${from} -> ${cur} (${curLabel}) | cooled=${cooled} dailyPostedToday=${postedToday} => ${shouldPost ? "POST" : "skip"}`);

const post = buildMilestonePost(stats, cur);

if (dryRun) {
  const media = await buildMedia(post, stats, { video: false, portrait: true });
  writeFileSync("milestone-preview.png", media.data);
  console.log(`[DRY RUN — nothing posted, state untouched]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\n-> milestone-preview.png`);
  process.exit(0);
}

// Record the crossing immediately (keep old lastPostTs) so we never re-detect it,
// even if the post itself is skipped or fails.
writeState({ highest: cur, label: curLabel, ts: nowIso(), lastPostTs: state.lastPostTs || null });

if (!shouldPost) { console.log("Within cooldown or already posted today — state updated, no post."); process.exit(0); }
if (!hasCreds) { console.log("Milestone crossing, but X creds missing — state updated, no post."); process.exit(0); }

const media = await buildMedia(post, stats, { video: false, portrait: true });
const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  const id = await postWithMedia(client, post, stats, media);
  writeState({ highest: cur, label: curLabel, ts: nowIso(), lastPostTs: nowIso() }); // advance cooldown only on a real post
  // Claim the day's single post slot so the daily rotation skips today.
  recordLanePost("milestone", "milestonecross");
  console.log(`Posted milestone ✓ (${from} -> ${cur}, ${curLabel}) tweet ${id}`);
} catch (e) {
  console.error(`POST FAILED ✗ — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
