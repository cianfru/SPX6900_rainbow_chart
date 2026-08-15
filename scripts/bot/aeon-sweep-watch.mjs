// ============================================================================
// PROJECT AEON — wallet-sweep watcher
// ============================================================================
// Fires when ONE wallet scoops several AEON in a short window — the accumulation
// event the single-sale watcher can't express. Shows the actual haul (a grid of
// the pieces), what it spent, and over how long.
//
// Sibling of aeon-sale-watch, its own LANE ("aeonsweep") so a sweep and a notable
// single sale can both fire on the same day, each capped at one/day. Fires only on
// a FRESH sweep (window end within NOTABLE_DAYS) so the July pump doesn't re-post;
// already-posted (wallet@end) pairs are remembered in public/aeon-sweep-state.json.
//
// Runs after the Aeon banker rebuilds the sale data (aeon.yml), and on dispatch.
// DRY_RUN=1 renders aeon-sweep-preview.png without posting.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectSweeps, renderAeonSweepCard } from "./aeon-sweep-card.mjs";
import { fetchArt } from "./aeon-sale-card.mjs";
import { postWithMedia } from "./media.mjs";
import { lanePostedToday, recordLanePost, withFooter } from "./posts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SALES = join(ROOT, "public/aeon-sales.json");
const RARITY = join(ROOT, "public/aeon-rarity.json");
const STATE = join(ROOT, "public/aeon-sweep-state.json");
const LANE = "aeonsweep";
const ALCHEMY = (process.env.ALCHEMY_KEY || "").trim();
const NETWORK = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();

const NOTABLE_DAYS = 3;      // window end must be this fresh
const SWEEP_DAYS = 3;        // "a single day or a few days"
const SWEEP_MIN = 3;         // >2 pieces
const MAX_TILES = 12;        // pieces shown on the card (art fetched for these)

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const force = process.env.BOT_FORCE === "1" || process.argv.includes("--force");
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(), appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(), accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);

/** House-style copy, 3 lines (withFooter airs them out). */
export function sweepCopy(sw) {
  const single = sw.span <= 1;
  const spent = `${fEth(sw.eth)}${sw.usd ? ` ($${Math.round(sw.usd).toLocaleString("en-US")})` : ""}`;
  const ids = sw.tokens.slice(0, 6).map(t => "#" + t).join(" ") + (sw.tokens.length > 6 ? " …" : "");
  return `🖼️ One wallet swept ${sw.n} Project AEON ${single ? "in a single day" : `in ${sw.span} days`} — ${spent}.\n`
    + `The haul: ${ids}. Average ${fEth(sw.eth / sw.n)} a piece — real accumulation, not a floor sweep bot.\n`
    + `Straight off the public sale log. Open the city, flip on ARCS, and you'll see the lines converge on one building.`;
}

async function main() {
  const sales = readJson(SALES, null);
  if (!sales?.trades?.length) { console.log("aeon-sweep: no trades — nothing to do"); return; }
  const asOf = new Date().toISOString().slice(0, 10);
  const sweeps = detectSweeps(sales.trades, { days: SWEEP_DAYS, minN: SWEEP_MIN, freshDays: NOTABLE_DAYS, asOf });
  if (!sweeps.length) { console.log(`aeon-sweep: no fresh sweep (≥${SWEEP_MIN} pieces in ${SWEEP_DAYS}d, ending within ${NOTABLE_DAYS}d) — no post.`); return; }

  const state = readJson(STATE, { posted: [] });
  const posted = new Set(force ? [] : (state.posted || []));
  const sweep = sweeps.find(s => !posted.has(`${s.a}@${s.end}`));
  if (!sweep) { console.log("aeon-sweep: the fresh sweep(s) were already posted — no post."); return; }
  console.log(`aeon-sweep: ${sweep.a} swept ${sweep.n} in ${sweep.span}d (${sweep.start}→${sweep.end}) for ${sweep.eth.toFixed(2)}Ξ`);

  if (!force && lanePostedToday(LANE)) { console.log(`aeon-sweep: lane "${LANE}" already posted today — skipping.`); return; }

  // rank + art url per token from the rarity file
  const rarity = readJson(RARITY, null);
  const byId = new Map((rarity?.tokens || []).map(t => [t.id, t]));
  const ranks = {}; for (const id of sweep.tokens) { const t = byId.get(id); if (t?.rank) ranks[id] = t.rank; }

  // fetch art for the tiles actually shown
  const arts = {};
  for (const id of sweep.tokens.slice(0, MAX_TILES)) {
    const t = byId.get(id);
    arts[id] = await fetchArt(t?.img, { key: ALCHEMY, tokenId: id, contract: CONTRACT, network: NETWORK });
  }
  const got = Object.values(arts).filter(Boolean).length;
  console.log(`aeon-sweep: art fetched for ${got}/${Math.min(sweep.n, MAX_TILES)} tiles`);
  // A card that is all placeholders isn't worth posting (the pieces ARE the point). In a
  // real run require at least half; the dry run always renders so the layout is reviewable.
  if (!dryRun && got < Math.ceil(Math.min(sweep.n, MAX_TILES) / 2)) {
    console.error("aeon-sweep: too little art resolved — skipping (nothing recorded, next run retries).");
    return;
  }

  const png = renderAeonSweepCard(sweep, { arts, ranks });
  const text = withFooter(sweepCopy(sweep));
  console.log(`--- copy (${[...text].length} chars) ---\n${text}\n---`);

  if (dryRun || !hasCreds) {
    writeFileSync(join(ROOT, "aeon-sweep-preview.png"), png);
    console.log(dryRun ? "DRY RUN — wrote aeon-sweep-preview.png, no post." : "No X creds — wrote aeon-sweep-preview.png, no post.");
    return;
  }
  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  const tweetId = await postWithMedia(client, { text }, null, { kind: "image", data: png, mediaType: "image/png" });
  console.log("posted", tweetId || "");
  posted.add(`${sweep.a}@${sweep.end}`);
  writeFileSync(STATE, JSON.stringify({ posted: [...posted].slice(-200), last: `${short(sweep.a)} ×${sweep.n}`, lastAt: new Date().toISOString() }, null, 2) + "\n");
  recordLanePost(LANE, tweetId);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main().catch(e => { console.error("aeon-sweep: failed —", e.message); process.exitCode = 1; });
