// Entry point for the X bot. Computes live stats, builds the post text + rainbow
// card, and either posts to X or (safely) dry-runs.
//
// Dry-run (writes bot-preview.png + prints the text, posts nothing) happens when:
//   - DRY_RUN=1 or --dry-run is passed, OR
//   - any X credential is missing.
//
// Required secrets to actually post (OAuth 1.0a user context for the bot account):
//   X_API_KEY  X_API_SECRET  X_ACCESS_TOKEN  X_ACCESS_SECRET
import { writeFileSync } from "node:fs";
import { fetchLivePrice, computeStats } from "./stats.mjs";
import { renderRainbowCard } from "./rainbow-card.mjs";
import { buildPost } from "./templates.mjs";

const creds = {
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
};
const hasCreds = Object.values(creds).every(Boolean);
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run") || !hasCreds;

let live = await fetchLivePrice();
if (!live) {
  if (!dryRun) {
    console.error("No live price available (GeckoTerminal + Coinbase both failed) — skipping, no post.");
    process.exit(0);
  }
  // Offline preview only: fall back to the last bundled price so dry-runs still render.
  const { DEFAULT_RAW } = await import("../../src/data.js");
  live = { price: DEFAULT_RAW.at(-1).price, source: "bundled-fallback" };
}

const stats = computeStats(live.price);
const { kind, text } = buildPost(stats);
const png = renderRainbowCard(stats);

console.log(`price ${live.price} (${live.source}) · band ${stats.band.l} · ${kind} post · ${text.length} chars`);

if (dryRun) {
  writeFileSync("bot-preview.png", png);
  console.log(`\n[DRY RUN — nothing posted]\n${"-".repeat(40)}\n${text}\n${"-".repeat(40)}\ncard -> bot-preview.png (${png.length} bytes)`);
  if (!hasCreds) console.log("Reason: X credentials not set. Add the four X_* secrets to post for real.");
  process.exit(0);
}

const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
const mediaId = await client.v1.uploadMedia(png, { mimeType: "image/png" });
const res = await client.v2.tweet({ text, media: { media_ids: [mediaId] } });
console.log(`Posted ✓ tweet id ${res?.data?.id}`);
