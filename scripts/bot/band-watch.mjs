// Band watcher — runs hourly. Posts to X only when SPX6900 crosses INTO a
// marquee band (Fire Sale / BUY / SELL / Max Bubble), at most once per cooldown.
// State lives in public/band-state.json (committed by the workflow). The first
// run with no state seeds silently. Dry-run does detection only: no state writes,
// no post (writes bandchange-preview.png so you can eyeball the card).
import { readFileSync, writeFileSync } from "node:fs";
import { fetchLivePrice, fetchHistory, computeStats } from "./stats.mjs";
import { buildBandChangePost, MARQUEE_BANDS } from "./posts.mjs";
import { renderPostCard } from "./charts.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

const STATE = new URL("../../public/band-state.json", import.meta.url);
const COOLDOWN_MS = 6 * 3600 * 1000; // min gap between band-change posts (anti-flap)
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

const live = (await fetchLivePrice()) || { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
const history = await fetchHistory();
const stats = computeStats(live.price, undefined, { history });
const bi = stats.bandIndex;
const state = readState();
console.log(`price ${live.price} (${live.source}) · band ${bi} (${stats.band.l})`);

// First run: seed the baseline, never post.
if (!state) {
  console.log("No prior state — seeding baseline, no post.");
  if (!dryRun) writeState({ band: bi, ts: nowIso() });
  process.exit(0);
}

if (bi === state.band) { console.log(`No change (still ${stats.band.l}).`); process.exit(0); }

const from = state.band;
const marquee = MARQUEE_BANDS.has(bi);
const cooled = !state.lastPostTs || Date.now() - Date.parse(state.lastPostTs) >= COOLDOWN_MS;
const shouldPost = marquee && cooled;
console.log(`Band change ${from} -> ${bi} | marquee=${marquee} cooled=${cooled} => ${shouldPost ? "POST" : "skip"}`);

const post = buildBandChangePost(stats, from);
const png = renderPostCard(post, stats);

if (dryRun) {
  writeFileSync("bandchange-preview.png", png);
  console.log(`[DRY RUN — nothing posted, state untouched]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\n-> bandchange-preview.png (${png.length} bytes)`);
  process.exit(0);
}

// Record the crossing immediately (keep old lastPostTs) so we never re-detect it,
// even if the post itself is skipped or fails.
writeState({ band: bi, ts: nowIso(), lastPostTs: state.lastPostTs || null });

if (!shouldPost) { console.log("State updated, no post (non-marquee band or within cooldown)."); process.exit(0); }
if (!hasCreds) { console.log("Marquee crossing, but X creds missing — state updated, no post."); process.exit(0); }

const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  const mediaId = await client.v2.uploadMedia(png, { media_type: "image/png" });
  const res = await client.v2.tweet({ text: post.text, media: { media_ids: [mediaId] } });
  writeState({ band: bi, ts: nowIso(), lastPostTs: nowIso() }); // advance cooldown only on a real post
  console.log(`Posted band-change ✓ (${from} -> ${bi}) tweet ${res?.data?.id}`);
} catch (e) {
  console.error(`POST FAILED ✗ — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
