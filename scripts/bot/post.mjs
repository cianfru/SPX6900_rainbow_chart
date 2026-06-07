// Entry point for the X bot. Computes live stats, picks the day's rotating post,
// renders its card, and either posts to X or (safely) dry-runs.
//
// Dry-run (writes bot-preview.png + prints the text, posts nothing) happens when:
//   - DRY_RUN=1 or --dry-run is passed, OR
//   - any X credential is missing.
//
// Test a specific topic with  --post=<id>  or  BOT_POST=<id>  (implies dry-run).
// Render every topic to bot-preview-<id>.png with  --all  (implies dry-run).
//
// Required secrets to actually post (OAuth 1.0a user context for the bot account):
//   X_API_KEY  X_API_SECRET  X_ACCESS_TOKEN  X_ACCESS_SECRET
import { writeFileSync } from "node:fs";
import { fetchLivePrice, fetchMajors, computeStats } from "./stats.mjs";
import { renderRainbowCard } from "./rainbow-card.mjs";
import { renderLineCard, renderBarCard } from "./charts.mjs";
import { buildPost, allIds } from "./posts.mjs";

const arg = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : null; };
const overrideId = arg("post") || process.env.BOT_POST || null;
const renderAll = process.argv.includes("--all");

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);
const checkOnly = process.argv.includes("--check") || process.env.BOT_CHECK === "1";
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run") || !!overrideId || renderAll || !hasCreds;

// Auth check: verify the credentials and report which account they post as. No posting.
if (checkOnly) {
  const lens = Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, v.length]));
  console.log("cred lengths (expect non-zero, no surprises):", JSON.stringify(lens));
  if (!hasCreds) { console.error("✗ One or more X_* secrets are empty."); process.exit(1); }
  const { TwitterApi } = await import("twitter-api-v2");
  try {
    const me = await new TwitterApi(creds).v1.verifyCredentials();
    console.log(`AUTH OK ✓ — credentials post as @${me.screen_name} (id ${me.id_str})`);
    process.exit(0);
  } catch (e) {
    console.error(`AUTH FAILED ✗ code ${e.code ?? "?"} — ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
    console.error("Likely: API Key/Secret and Access Token/Secret are not from the SAME app, or app permission isn't Read+Write, or tokens weren't regenerated AFTER setting Read+Write, or OAuth 1.0a isn't enabled in User authentication settings.");
    process.exit(1);
  }
}

function cardFor(post, stats) {
  const { type, spec } = post.card;
  if (type === "rainbow") return renderRainbowCard(stats);
  if (type === "bar") return renderBarCard({ ...spec, date: stats.date });
  return renderLineCard({ ...spec, date: stats.date });
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
const stats = computeStats(live.price, undefined, { coins });

if (renderAll) {
  for (const id of allIds(stats)) {
    const post = buildPost(stats, new Date(), id);
    writeFileSync(`bot-preview-${id}.png`, cardFor(post, stats));
    console.log(`\n[${id}] (${post.text.length} chars)\n${post.text}`);
  }
  console.log(`\nRendered ${allIds(stats).length} cards (price ${live.price}, ${live.source}).`);
  process.exit(0);
}

const post = buildPost(stats, new Date(), overrideId);
const png = cardFor(post, stats);
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
  // Use the v2 chunked media endpoint (/2/media/upload). The legacy v1.1
  // media/upload endpoint now returns 403 on the current X API access tier.
  const mediaId = await client.v2.uploadMedia(png, { media_type: "image/png" });
  const res = await client.v2.tweet({ text: post.text, media: { media_ids: [mediaId] } });
  console.log(`Posted ✓ "${post.id}" tweet id ${res?.data?.id}`);
} catch (e) {
  console.error(`POST FAILED ✗ at ${e.request?.path?.includes("media") ? "media upload" : "tweet"} — code ${e.code ?? "?"}: ${JSON.stringify(e.data?.errors ?? e.data ?? e.message)}`);
  process.exit(1);
}
