// ============================================================================
// PROJECT AEON — FIRE SALE watcher
// ============================================================================
// Posts to X when a live listing is priced BELOW what its rarity actually sells for — a
// buy-now alert: the piece, the ask, how far under market, its rarity + rarest traits.
// Fair value comes from realized sales (aeon-market.json `fairModel`), the same model the
// listings chart uses — never from the asks. Listings come from the daily OpenSea pull
// (aeon-listings.json); a faster poll (true real-time) + a Telegram alert are the next step.
//
// Its OWN lane ("firesale"), capped at one per day, so it never eats the daily rotation's
// slot. Already-posted (token@price) pairs are remembered in public/aeon-firesale-state.json
// so a standing listing never re-fires. DRY_RUN=1 (or no X creds) renders a preview + the
// control-panel candidate and posts nothing. Runs hourly in aeon-sale-watch.yml.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickFiresale, renderAeonFiresaleCard } from "./aeon-firesale-card.mjs";
import { fetchArt, traitsFor, tierOf } from "./aeon-sale-card.mjs";
import { postWithMedia } from "./media.mjs";
import { lanePostedToday, recordLanePost, withFooter } from "./posts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (f, d) => { try { return JSON.parse(readFileSync(join(ROOT, "public", f), "utf8")); } catch { return d; } };
const day = () => new Date().toISOString().slice(0, 10);
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

const LANE = "firesale";
const STATE = join(ROOT, "public/aeon-firesale-state.json");
const CAND = join(ROOT, "public/aeon-firesale.json");
const ALCHEMY = (process.env.ALCHEMY_KEY || "").trim();
const NETWORK = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const MIN_DISC = Number(process.env.AEON_FIRESALE_MIN_DISC || 0.20);   // a fire sale is a genuine steal
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const force = process.env.BOT_FORCE === "1" || process.argv.includes("--force");

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);

// House-style copy: 3 short lines, single \n. withFooter() airs them out + adds the footer.
export function firesaleCopy(deal, { total, tier, traits }) {
  const pct = Math.round(deal.disc * 100);
  const rarest = traits?.[0];
  const rareBit = rarest?.pct != null ? ` ${rarest.v} shows on just ${rarest.pct}% of the collection.` : "";
  return `🔥 Fire sale — AEON #${deal.id} is listed ${pct}% below what its rarity trades at: ${fEth(deal.price)}, with comparable pieces around ${fEth(deal.exp)}.
Rank ${deal.rank.toLocaleString()} of ${total.toLocaleString()} (${tier.name}).${rareBit} A live OpenSea listing, under the going rate for pieces this rare.
Fair value from realized sales, rarity from on-chain metadata — reproducible, not a valuation. Verify before buying.`;
}

async function main() {
  const listings = rd("aeon-listings.json", null), market = rd("aeon-market.json", null);
  const total = listings?.total || market?.supply || 3333;
  const deal = pickFiresale(listings?.listings, market, total, { minDisc: MIN_DISC });

  if (!deal) {
    writeFileSync(CAND, JSON.stringify({ none: true, minDisc: MIN_DISC, updated: day() }));
    console.log(`aeon-firesale: nothing listed ≥${Math.round(MIN_DISC * 100)}% below market — no post.`);
    return;
  }

  const state = rd("aeon-firesale-state.json", { posted: [] });
  const posted = new Set(force ? [] : (state.posted || []));
  const key = `${deal.id}@${deal.price}`;
  const { traits, total: tot } = traitsFor(deal.id);
  const t2 = tot || total;
  const tier = tierOf(deal.rank, t2);
  console.log(`aeon-firesale: AEON #${deal.id} · ${Math.round(deal.disc * 100)}% below market · ${deal.price}Ξ (fair ${deal.exp.toFixed(3)}Ξ, rank ${deal.rank})`);

  // Always refresh the control-panel candidate, even if we won't post (already fired / capped / dry).
  writeFileSync(CAND, JSON.stringify({
    id: deal.id, price: deal.price, exp: +deal.exp.toFixed(4), disc: +deal.disc.toFixed(3), rank: deal.rank,
    tier: tier.name, opensea: `https://opensea.io/assets/ethereum/${CONTRACT}/${deal.id}`, img: deal.img, updated: day(),
  }));

  if (!force && posted.has(key)) { console.log(`aeon-firesale: #${deal.id} at ${deal.price}Ξ already posted — skipping.`); return; }
  if (!force && lanePostedToday(LANE)) { console.log(`aeon-firesale: lane "${LANE}" already posted today — skipping.`); return; }

  // The piece IS the post: fetch + embed the art; if every source fails, skip rather than post a
  // placeholder (nothing recorded, so the next run retries). DRY still renders the placeholder.
  const art = await fetchArt(deal.img, { key: ALCHEMY, tokenId: deal.id, contract: CONTRACT, network: NETWORK }).catch(() => null);
  if (!art && !dryRun) { console.error(`aeon-firesale: no art for #${deal.id} — skipping (retries next run).`); return; }

  const png = renderAeonFiresaleCard(deal, { total: t2, art, traits });
  const text = withFooter(firesaleCopy(deal, { total: t2, tier, traits }));
  console.log(`--- copy (${[...text].length} chars) ---\n${text}\n---`);

  if (dryRun || !hasCreds) {
    if (png) writeFileSync(join(ROOT, "aeon-firesale-preview.png"), png);
    console.log(dryRun ? "DRY RUN — wrote aeon-firesale-preview.png, no post." : "No X creds — wrote preview, no post.");
    return;
  }

  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  const tweetId = await postWithMedia(client, { text }, null, { kind: "image", data: png, mediaType: "image/png" });
  console.log("posted", tweetId || "");
  posted.add(key);
  writeFileSync(STATE, JSON.stringify({ posted: [...posted].slice(-200), lastId: deal.id, lastAt: new Date().toISOString() }, null, 2) + "\n");
  recordLanePost(LANE, tweetId);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main().catch(e => { console.error("aeon-firesale:", e.message); process.exitCode = 0; });
