// Monthly recap thread.
//   node scripts/bot/recap-run.mjs --month=2026-06 --dry-run   → render previews + print thread
//   node scripts/bot/recap-run.mjs --preview                   → write public/recap/<month>/*.png + recap-pending.json (cron)
//   node scripts/bot/recap-run.mjs --post                      → post the queued thread (needs X creds)
// Default month = the one that just ended, so a 1st-of-month cron recaps last month.
// The thread itself (text + card specs) is built in recap-thread.mjs, shared with
// the control-panel preview API so both show exactly the same thread.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildRecapThread } from "./recap-thread.mjs";
import { renderPostCard } from "./charts.mjs";
import { uploadWithRetry } from "./media.mjs";

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : null; };
const dryRun = process.argv.includes("--dry-run");
const previewMode = process.argv.includes("--preview");
const postMode = process.argv.includes("--post");

const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const month = arg("month") || lastMonth();

const history = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8"));
const built = await buildRecapThread(month, history);
if (!built) { console.error(`No recap data for ${month} (need ≥2 daily snapshots).`); process.exit(0); }
const { R, endStats, thread } = built;

// length guard (X visible-weight is ~1/char here; emoji count 2 but we stay well under)
thread.forEach((t, i) => { if (t.text.length > 280) console.warn(`⚠ tweet ${i + 1} is ${t.text.length} chars (>280)`); });

const renderItem = t => t.card ? renderPostCard({ card: t.card }, endStats) : null;

if (dryRun || previewMode) {
  const outDir = previewMode ? new URL(`../../public/recap/${month}/`, import.meta.url) : null;
  if (outDir) mkdirSync(outDir, { recursive: true });
  const manifest = { month, label: R.label, generatedAt: new Date().toISOString(), tweets: [] };
  thread.forEach((t, i) => {
    const png = renderItem(t);
    let imgPath = null;
    if (png) {
      imgPath = previewMode ? `recap/${month}/${i + 1}.png` : `recap-preview-${i + 1}.png`;
      writeFileSync(previewMode ? new URL(`../../public/${imgPath}`, import.meta.url) : imgPath, png);
    }
    manifest.tweets.push({ text: t.text, image: imgPath });
    console.log(`\n── tweet ${i + 1} (${t.text.length} chars)${png ? " + image" : ""} ──\n${t.text}`);
  });
  if (previewMode) writeFileSync(new URL("../../public/recap-pending.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n[${previewMode ? "PREVIEW — queued, not posted" : "DRY RUN"}] ${R.label}: ${thread.length} tweets.`);
  process.exit(0);
}

if (postMode) {
  const creds = {
    appKey: (process.env.X_API_KEY || "").trim(), appSecret: (process.env.X_API_SECRET || "").trim(),
    accessToken: (process.env.X_ACCESS_TOKEN || "").trim(), accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
  };
  if (!Object.values(creds).every(Boolean)) { console.error("✗ X creds missing — cannot post."); process.exit(1); }
  // Don't double-post: if the queue says this month already shipped, stop.
  try {
    const pend = JSON.parse(readFileSync(new URL("../../public/recap-pending.json", import.meta.url), "utf8"));
    if (pend.posted && pend.month === month) { console.log(`${R.label} recap already posted (${pend.postedAt}). Nothing to do.`); process.exit(0); }
  } catch { /* no pending file — fine */ }
  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  let replyTo = null;
  const ids = [];
  for (let i = 0; i < thread.length; i++) {
    const t = thread[i];
    const png = renderItem(t);
    const payload = { text: t.text };
    if (png) payload.media = { media_ids: [await uploadWithRetry(client, png, "image/png", { tries: 3 })] };
    if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
    const res = await client.v2.tweet(payload);
    replyTo = res?.data?.id;
    ids.push(replyTo);
    console.log(`posted tweet ${i + 1}/${thread.length} → ${replyTo}`);
  }
  // Mark the queue consumed so it can't double-post and the control page shows it shipped.
  writeFileSync(new URL("../../public/recap-pending.json", import.meta.url),
    JSON.stringify({ month, label: R.label, posted: true, postedAt: new Date().toISOString(), tweetIds: ids }, null, 2) + "\n");
  console.log(`✓ ${R.label} recap thread posted (${thread.length} tweets).`);
  process.exit(0);
}

console.log("Pick a mode: --dry-run | --preview | --post");
