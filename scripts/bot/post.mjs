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
//
// Required secrets to actually post (OAuth 1.0a user context for the bot account):
//   X_API_KEY  X_API_SECRET  X_ACCESS_TOKEN  X_ACCESS_SECRET
import { writeFileSync } from "node:fs";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "./stats.mjs";
import { renderPostCard } from "./charts.mjs";
import { buildPost, allIds } from "./posts.mjs";

const arg = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : null; };
const cliPostId = arg("post");                          // local --post=<id>: select + force dry-run (safe)
const overrideId = cliPostId || process.env.BOT_POST || null; // BOT_POST selects topic without forcing dry-run
const renderAll = process.argv.includes("--all");
// Post text only, no image — used to A/B the per-post cost of attaching media.
const noMedia = process.argv.includes("--no-media") || process.env.BOT_NO_MEDIA === "1";

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);
const checkOnly = process.argv.includes("--check") || process.env.BOT_CHECK === "1";
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
const png = renderPostCard(post, stats);
console.log(`price ${live.price} (${live.source}) · post "${post.id}" · ${post.text.length} chars`);

if (dryRun) {
  writeFileSync("bot-preview.png", png);
  console.log(`\n[DRY RUN — nothing posted]\n${"-".repeat(44)}\n${post.text}\n${"-".repeat(44)}\ncard -> bot-preview.png (${png.length} bytes)`);
  if (!hasCreds) console.log("Reason: X credentials not set. Add the four X_* secrets to post for real.");
  process.exit(0);
}

const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
try {
  let res;
  if (noMedia) {
    res = await client.v2.tweet({ text: post.text });
    console.log(`Posted ✓ (text only, no media) "${post.id}" tweet id ${res?.data?.id}`);
  } else {
    // Use the v2 chunked media endpoint (/2/media/upload). The legacy v1.1
    // media/upload endpoint now returns 403 on the current X API access tier.
    const mediaId = await client.v2.uploadMedia(png, { media_type: "image/png" });
    res = await client.v2.tweet({ text: post.text, media: { media_ids: [mediaId] } });
    console.log(`Posted ✓ "${post.id}" tweet id ${res?.data?.id}`);
  }
} catch (e) {
  console.error(`POST FAILED ✗ at ${e.request?.path?.includes("media") ? "media upload" : "tweet"} — code ${e.code ?? "?"}: ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
