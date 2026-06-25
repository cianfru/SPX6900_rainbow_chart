// Monthly recap — ONE long-form X post + up to 4 image cards.
//   node scripts/bot/recap-run.mjs --month=2026-06 --dry-run   → render the 4 cards + print the post text
//   node scripts/bot/recap-run.mjs --post                      → publish the single post (needs X creds)
// Default month = the one that just ended, so a 1st-of-month cron recaps last month.
// The post (text + card specs) is built in recap-thread.mjs, shared with the
// control-panel preview API so both show exactly the same thing.
import { readFileSync, writeFileSync } from "node:fs";
import { buildRecapPost } from "./recap-thread.mjs";
import { renderPostCard } from "./charts.mjs";
import { uploadWithRetry } from "./media.mjs";

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : null; };
const dryRun = process.argv.includes("--dry-run");
const postMode = process.argv.includes("--post");

const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const month = arg("month") || lastMonth();

const history = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8"));
const built = await buildRecapPost(month, history);
if (!built) { console.error(`No recap data for ${month} (need ≥2 daily snapshots).`); process.exit(0); }
const { R, endStats, text, cards } = built;

const images = cards.map(c => renderPostCard({ card: c }, endStats));

if (dryRun || !postMode) {
  images.forEach((png, i) => writeFileSync(`recap-preview-${i + 1}.png`, png));
  console.log(`\n── recap post (${text.length} chars · ${images.length} image${images.length === 1 ? "" : "s"}) ──\n${text}`);
  console.log(`\n[DRY RUN — nothing posted] ${R.label}. Previews: recap-preview-1..${images.length}.png`);
  process.exit(0);
}

// --- publish: one post, up to 4 images ---
const creds = {
  appKey: (process.env.X_API_KEY || "").trim(), appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(), accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
if (!Object.values(creds).every(Boolean)) { console.error("✗ X creds missing — cannot post."); process.exit(1); }
// Don't double-post: if the record says this month already shipped, stop.
try {
  const pend = JSON.parse(readFileSync(new URL("../../public/recap-pending.json", import.meta.url), "utf8"));
  if (pend.posted && pend.month === month) { console.log(`${R.label} recap already posted (${pend.postedAt}). Nothing to do.`); process.exit(0); }
} catch { /* no record — fine */ }

const { TwitterApi } = await import("twitter-api-v2");
const client = new TwitterApi(creds);
const media_ids = [];
for (const png of images) media_ids.push(await uploadWithRetry(client, png, "image/png", { tries: 3 }));
const res = await client.v2.tweet({ text, ...(media_ids.length ? { media: { media_ids } } : {}) });
const tweetId = res?.data?.id;

// Record what shipped (also the double-post guard); committed by the workflow.
writeFileSync(new URL("../../public/recap-pending.json", import.meta.url),
  JSON.stringify({ month, label: R.label, posted: true, postedAt: new Date().toISOString(), tweetId, images: images.length }, null, 2) + "\n");
console.log(`✓ ${R.label} recap posted (1 post · ${images.length} images) → ${tweetId}`);
process.exit(0);
