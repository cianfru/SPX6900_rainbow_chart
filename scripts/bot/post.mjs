// Entry point for the X bot. Computes live stats, picks the day's rotating post,
// renders its card, and either posts to X or (safely) dry-runs.
//
// Dry-run (writes bot-preview.png + prints the text, posts nothing) happens when:
//   - DRY_RUN=1 or --dry-run is passed, OR
//   - any X credential is missing.
//
// Pick a specific topic with  --post=<id>  (local, implies dry-run for safe testing)
// or  BOT_POST=<id>  (used by the workflow to publish a chosen topic for real).
// Render every topic to bot-preview-<id>.png with  --all  (implies dry-run).
// Verify the media upload reaches X without posting:  --verify-media  (needs the
// secrets; uploads the card, prints the media_id, never tweets).
//
// Required secrets to actually post (OAuth 1.0a user context for the bot account):
//   X_API_KEY  X_API_SECRET  X_ACCESS_TOKEN  X_ACCESS_SECRET
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "./stats.mjs";
import { renderPostCard } from "./charts.mjs";
import { buildMedia, postWithMedia, uploadWithRetry } from "./media.mjs";
import { buildPost, allIds } from "./posts.mjs";

// Control-page state lives in public/ so it deploys with the site and the daily
// workflow can commit it back. next-post.json = an optional queued override the
// hidden control page sets; post-state.json = the last calendar day we posted
// (a once-per-day guard so a queued/manual post and the cron can't double-fire).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const QUEUE_FILE = join(ROOT, "public/next-post.json");
const STATE_FILE = join(ROOT, "public/post-state.json");
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

const arg = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : null; };
const cliPostId = arg("post");                          // local --post=<id>: select + force dry-run (safe)
const queuedId = readJson(QUEUE_FILE, {}).id || null;   // override queued by the control page
const explicitId = cliPostId || process.env.BOT_POST || null; // CLI/env wins over the queue
const overrideId = explicitId || queuedId;
const fromQueue = !explicitId && !!queuedId;            // did we end up using the queued pick?
const renderAll = process.argv.includes("--all");
// Post text only, no image — used to A/B the per-post cost of attaching media.
const noMedia = process.argv.includes("--no-media") || process.env.BOT_NO_MEDIA === "1";
// Rainbow cards post as an animated mp4 unless disabled (BOT_NO_VIDEO=1).
const useVideo = !noMedia && process.env.BOT_NO_VIDEO !== "1";

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);
const checkOnly = process.argv.includes("--check") || process.env.BOT_CHECK === "1";
// Verify the media UPLOAD works against X without posting: builds the card,
// uploads it (real v1.1 chunked path for video), prints the media_id, then exits
// WITHOUT tweeting. Nothing shows on the timeline; the media expires unused (~24h).
const verifyMedia = process.argv.includes("--verify-media") || process.env.BOT_VERIFY_MEDIA === "1";
// Bypass the once-per-day guard for an intentional manual post (e.g. testing).
const force = process.argv.includes("--force") || process.env.BOT_FORCE === "1";
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run") || !!cliPostId || renderAll || !hasCreds;

// Auth check: verify the credentials and report which account they post as. No posting.
if (checkOnly) {
  const lens = Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, v.length]));
  console.log("cred lengths (expect non-zero, no surprises):", JSON.stringify(lens));
  if (!hasCreds) { console.error("✗ One or more X_* secrets are empty."); process.exit(1); }
  const { TwitterApi } = await import("twitter-api-v2");
  try {
    // Full response so we can read the x-access-level header, which tells us
    // whether the token actually carries write permission (read / read-write /
    // read-write-directmessages). A "read"-only token is the usual reason media
    // upload 403s with "oauth1 app permissions for this endpoint".
    const resp = await new TwitterApi(creds).v1.get("account/verify_credentials.json", {}, { fullResponse: true });
    const me = resp.data;
    const accessLevel = resp.headers?.["x-access-level"] ?? "unknown";
    console.log(`AUTH OK ✓ — credentials post as @${me.screen_name} (id ${me.id_str}) · access level: ${accessLevel}`);
    if (!String(accessLevel).includes("write")) {
      console.error("✗ Token is READ-ONLY — it cannot post or upload media. Set the app to Read+Write AND regenerate the access token/secret, then update the secrets.");
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error(`AUTH FAILED ✗ code ${e.code ?? "?"} — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
    console.error("Likely: API Key/Secret and Access Token/Secret are not from the SAME app, or app permission isn't Read+Write, or tokens weren't regenerated AFTER setting Read+Write, or OAuth 1.0a isn't enabled in User authentication settings.");
    process.exit(1);
  }
}

let live = await fetchLivePrice();
if (!live) {
  if (!dryRun) {
    console.error("No live price available (GeckoTerminal + Coinbase both failed) — skipping, no post.");
    process.exit(0);
  }
  const { DEFAULT_RAW } = await import("../../src/data.js");
  live = { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
}
const coins = await fetchMajors(); // each null if unreachable → those pills skip
const history = await fetchHistory(); // bundled + live daily closes (frozen model)
const stats = computeStats(live.price, undefined, { coins, history });

if (renderAll) {
  for (const id of allIds(stats)) {
    const post = buildPost(stats, new Date(), id);
    writeFileSync(`bot-preview-${id}.png`, renderPostCard(post, stats));
    console.log(`\n[${id}] (${post.text.length} chars)\n${post.text}`);
  }
  console.log(`\nRendered ${allIds(stats).length} cards (price ${live.price}, ${live.source}).`);
  process.exit(0);
}

const post = buildPost(stats, new Date(), overrideId);
console.log(`price ${live.price} (${live.source}) · post "${post.id}" · ${post.text.length} chars`);

// Animated mp4 for rainbow cards (hero valuation), static PNG otherwise; null = text only.
const media = noMedia ? null : await buildMedia(post, stats, { video: useVideo, portrait: true });

// Upload-only verification: prove the media reaches X (the v1.1 chunked video
// path we fixed) without creating a post. Hits X but never tweets.
if (verifyMedia) {
  if (!hasCreds) { console.error("✗ --verify-media needs the four X_* secrets set."); process.exit(1); }
  if (!media) { console.error("✗ Nothing to verify — media is off (--no-media)."); process.exit(1); }
  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  try {
    const t0 = Date.now();
    const mediaId = await uploadWithRetry(client, media.path ?? media.data, media.mediaType,
      { tries: media.kind === "video" ? 4 : 2 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`VERIFY OK ✓ — uploaded "${post.id}" ${media.kind} (${media.mediaType}) to X in ${secs}s · media_id ${mediaId}`);
    console.log("No tweet was posted. The upload proves the media path works; the unattached media expires in ~24h.");
    process.exit(0);
  } catch (e) {
    console.error(`VERIFY FAILED ✗ — code ${e.code ?? "?"}: ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
    process.exit(1);
  }
}

if (dryRun) {
  let note = "text only, no media";
  if (media?.kind === "video") note = `card -> ${media.path}`;
  else if (media) { writeFileSync("bot-preview.png", media.data); note = `card -> bot-preview.png (${media.data.length} bytes)`; }
  console.log(`\n[DRY RUN — nothing posted]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\n${note}`);
  if (!hasCreds) console.log("Reason: X credentials not set. Add the four X_* secrets to post for real.");
  process.exit(0);
}

// Once-per-day guard: if a real post already went out today (cron or control
// page), don't post again. Only applies to real runs (dry-runs never reach here).
// --force (BOT_FORCE=1) overrides it for an intentional manual post.
const today = new Date().toISOString().slice(0, 10);
const state = readJson(STATE_FILE, {});
if (state.lastPostedDate === today && !force) {
  console.log(`Already posted today (${state.lastId ?? "?"} on ${today}) — skipping to avoid a duplicate. (Manual workflow runs bypass this; use --force locally.)`);
  process.exit(0);
}
if (state.lastPostedDate === today && force) {
  console.log(`Already posted today (${state.lastId ?? "?"} on ${today}) — posting anyway (force).`);
}

const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  if (noMedia) {
    const res = await client.v2.tweet({ text: post.text });
    console.log(`Posted ✓ (text only) "${post.id}" tweet id ${res?.data?.id}`);
  } else {
    const id = await postWithMedia(client, post, stats, media);
    console.log(`Posted ✓ "${post.id}" (${media.kind}) tweet id ${id}`);
  }
} catch (e) {
  console.error(`POST FAILED ✗ — code ${e.code ?? "?"}: ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}

// Record the day (guard) and consume the queue if we used it, so tomorrow is auto
// again. The workflow commits these back to the repo after the run.
writeFileSync(STATE_FILE, JSON.stringify({ lastPostedDate: today, lastId: post.id }, null, 2) + "\n");
if (fromQueue) writeFileSync(QUEUE_FILE, JSON.stringify({ id: null }, null, 2) + "\n");
