// ============================================================================
// PROJECT AEON — notable-sale watcher
// ============================================================================
// Posts when a genuinely notable AEON sale lands: the piece itself, what it fetched,
// and how that compares to what its rarity normally trades at.
//
// LANES, not one global slot. The bot used to allow one post per day across everything,
// which meant a real event had to wait for tomorrow if the rotation had already gone out.
// Each lane now carries its own budget (see postLane/lanePostedToday in posts.mjs), so a
// rainbow band crossing and a notable sale can both fire on the same day as the daily —
// but each is still capped at one per day and gated on being genuinely notable.
//
// Notability (any one, evaluated against sales from the last NOTABLE_DAYS):
//   • a STEAL      — sold >=20% under what that rarity trades at
//   • a RARE piece — rank <= 150 changing hands at all (they seldom do)
//   • a BIG sale   — >=2x the current market level
// Ties break on the strongest signal. Already-posted token/date pairs are remembered in
// public/aeon-sale-state.json, so the same sale never fires twice.
//
// Runs after the Aeon banker rebuilds aeon-market.json (aeon.yml), and on dispatch.
// DRY_RUN=1 does detection + card render only, writing aeon-sale-preview.png.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAeonSaleCard, fetchArt, traitsFor, tierOf } from "./aeon-sale-card.mjs";
import { postWithMedia } from "./media.mjs";
import { lanePostedToday, recordLanePost, withFooter } from "./posts.mjs";
import { fetchLiveSales } from "./aeon-live-sales.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MARKET = join(ROOT, "public/aeon-market.json");
const STATE = join(ROOT, "public/aeon-sale-state.json");
const RARITY = join(ROOT, "public/aeon-rarity.json");
const LANE = "aeonsale";
const ALCHEMY = (process.env.ALCHEMY_KEY || "").trim();
const NETWORK = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
// AEON is thin — 1-3 sales on a busy day, some days none — so a 48h window routinely
// returns nothing. Fetch a week; NOTABLE_DAYS still bounds what is fresh enough to post.
const LIVE_HOURS = Number(process.env.AEON_SALE_HOURS || 168);

const NOTABLE_DAYS = 3;      // only fire on a genuinely FRESH sale
const STEAL_DISC = 0.20;     // >=20% under what that rarity trades at
const RARE_RANK = 150;       // rank at/below which any trade is newsworthy
const BIG_MULT = 2.0;        // >=2x the market level

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const force = process.env.BOT_FORCE === "1" || process.argv.includes("--force");
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

const creds = {
  appKey: (process.env.X_API_KEY || "").trim(),
  appSecret: (process.env.X_API_SECRET || "").trim(),
  accessToken: (process.env.X_ACCESS_TOKEN || "").trim(),
  accessSecret: (process.env.X_ACCESS_SECRET || "").trim(),
};
const hasCreds = Object.values(creds).every(Boolean);

/**
 * Score every fresh sale and return the most notable, or null.
 * Pure — unit-tested in test/aeon-sale-watch.test.mjs.
 */
export function pickNotable(recentSales, { level, today, posted = new Set(), days = NOTABLE_DAYS } = {}) {
  const cutoff = Date.parse(today) - days * 86400e3;
  let best = null;
  for (const s of recentSales || []) {
    if (!(s.price > 0) || !(s.rank > 0)) continue;
    if (Date.parse(s.d) < cutoff) continue;
    if (posted.has(`${s.id}@${s.d}`)) continue;
    const reasons = [];
    if (s.disc >= STEAL_DISC) reasons.push({ kind: "steal", strength: s.disc });
    if (s.rank <= RARE_RANK) reasons.push({ kind: "rare", strength: 1 - s.rank / RARE_RANK });
    if (level > 0 && s.price >= level * BIG_MULT) reasons.push({ kind: "big", strength: s.price / level / BIG_MULT });
    if (!reasons.length) continue;
    // a steal outranks a rare outranks a big sale at equal strength; the deal is the story
    const order = { steal: 3, rare: 2, big: 1 };
    reasons.sort((a, b) => order[b.kind] - order[a.kind] || b.strength - a.strength);
    const top = reasons[0];
    const score = order[top.kind] * 10 + top.strength;
    if (!best || score > best.score) best = { sale: s, kind: top.kind, reasons, score };
  }
  return best;
}

/**
 * Where this price sits among EVERY realized sale — a fact, not a fitted estimate.
 * A big sale does not need the rarity model at all, and the model is at its weakest
 * exactly where big sales happen (rare tokens, almost no comparables).
 */
export function superlative(price, milestones) {
  if (!milestones?.top?.length || !(price > 0)) return null;
  const above = milestones.top.filter(t => t.price > price + 1e-9).length;
  if (above === 0) return "the highest price this collection has ever traded at";
  if (above < 5) {
    const ord = ["2nd", "3rd", "4th", "5th"][above - 1];
    return `the ${ord}-highest sale in the collection's history`;
  }
  const wh = milestones.windowHigh || {};
  for (const [days, label] of [[365, "a year"], [180, "six months"], [90, "three months"], [30, "a month"]]) {
    if (wh[days] != null && price >= wh[days] - 1e-9) return `the highest in ${label}`;
  }
  return null;
}

/**
 * May we quote a percentage against the fitted line for this rank?
 * Only where the fit actually has data — see rankSupport in build-aeon-market.mjs.
 */
export function mayQuoteModel(rank, rankSupport) {
  if (!rankSupport?.minRank) return true;          // no support data → behave as before
  return rank >= rankSupport.minRank;
}

/**
 * House-style copy: exactly 3 lines, single \n. withFooter() doubles them into airy
 * paragraphs and appends the branded footer — the first live post skipped it and went out
 * as a wall of text, which is the one thing CLAUDE.md says not to do.
 *
 * The tense ADAPTS to the sale's real age. "Just sold" describing a four-day-old trade is
 * the kind of small inaccuracy the honesty moat cannot afford, and the first post did
 * exactly that: it announced a 07-21 sale as "just sold" because the freshness clock was
 * the market file's build date rather than the actual date.
 */
export function saleCopy({ sale, kind }, { total, tier, traits, asOf, milestones, rankSupport, level }) {
  const rarest = traits?.[0];
  const rareBit = rarest?.pct != null ? ` ${rarest.v} shows on just ${rarest.pct}% of the collection.` : "";
  const pctBelow = Math.round(Math.abs(sale.disc) * 100);
  const sup = superlative(sale.price, milestones);
  const quotable = mayQuoteModel(sale.rank, rankSupport);
  const ageDays = Math.floor((Date.parse(asOf || new Date().toISOString().slice(0, 10)) - Date.parse(sale.d)) / 86400e3);
  const sold = ageDays <= 0 ? "just sold" : ageDays === 1 ? "sold yesterday" : `sold on ${sale.d}`;
  const moved = ageDays <= 0 ? "just changed hands" : ageDays === 1 ? "changed hands yesterday" : `changed hands on ${sale.d}`;
  const head = kind === "steal"
    ? (quotable
      ? `🖼️ AEON #${sale.id} ${sold} for ${fEth(sale.price)} — ${pctBelow}% under what its rarity normally trades at.`
      : `🖼️ AEON #${sale.id} ${sold} for ${fEth(sale.price)} — well under what the few comparable sales at this rarity have fetched.`)
    : kind === "rare"
      ? `🖼️ AEON #${sale.id} ${moved} for ${fEth(sale.price)} — rank ${sale.rank.toLocaleString()} of ${total.toLocaleString()}, ${tier.name}.`
      // No superlative? Quote the multiple of the MARKET LEVEL — that level is a rolling
      // median of real sales, so it is empirical, unlike the rarity extrapolation. Vague
      // filler ("one of the biggest trades") both says nothing and quietly overclaims.
      : `🖼️ AEON #${sale.id} ${sold} for ${fEth(sale.price)} — ${sup
          || (level > 0 ? `${(sale.price / level).toFixed(1)}× the going rate across the collection right now` : "well above the going rate")}.`;
  const body = `Rank ${sale.rank.toLocaleString()} of ${total.toLocaleString()} (${tier.name}).${rareBit}`
    + (quotable
      ? ` Pieces at this rarity have been trading around ${fEth(sale.exp)}.`
      : ` Too few pieces this rare have sold to call a typical price.`);
  const tail = quotable
    ? `Rarity from on-chain metadata, "typical" from realized sales — both reproducible. Not a valuation.`
    : `Rarity from on-chain metadata; the price comparison is measured against all realized sales. Not a valuation.`;
  return `${head}\n${body}\n${tail}`;
}

/**
 * Live Alchemy sales → the same shape pickNotable expects, by joining rank/art from
 * aeon-rarity.json and "typical for this rarity" from the daily fairModel. Pure given
 * its inputs, so it is unit-tested.
 */
export function joinLiveSales(live, { rarityTokens, fairModel, level }) {
  const byId = new Map((rarityTokens || []).map(t => [t.id, t]));
  const factor = fairModel
    ? rank => Math.exp(fairModel.a + fairModel.b * Math.log(rank))
    : () => 1;
  const lvl = fairModel?.level || level || 0;
  const out = [];
  for (const s of live || []) {
    const tk = byId.get(s.id);
    if (!tk?.rank) continue;                       // unknown token → cannot judge it
    const exp = lvl > 0 ? lvl * factor(tk.rank) : null;
    if (!(exp > 0)) continue;
    out.push({
      id: s.id, price: s.price, rank: tk.rank, img: tk.img ?? null,
      exp: +exp.toFixed(3), disc: +((exp - s.price) / exp).toFixed(3),
      d: s.d, mkt: s.mkt, tx: s.tx,
    });
  }
  return out;
}

async function main() {
  const market = readJson(MARKET, null);
  if (!market?.recentSales?.length) { console.log("aeon-sale: no recentSales in aeon-market.json — nothing to do"); return; }
  const state = readJson(STATE, { posted: [] });
  const posted = new Set(state.posted || []);
  const today = (market.updated || new Date().toISOString().slice(0, 10));
  const level = market.levelNow || market.fairModel?.level || 0;

  // LIVE feed first (Alchemy getNFTSales) so the post lands while the trade is still
  // news; the daily Dune-derived recentSales is the fallback when there is no key or the
  // call fails. Rarity + fair value come from the banked files either way.
  let candidates = market.recentSales, source = "dune-daily";
  if (ALCHEMY) {
    try {
      const live = await fetchLiveSales({ key: ALCHEMY, hours: LIVE_HOURS, contract: CONTRACT });
      const rarity = readJson(RARITY, null);
      const joined = joinLiveSales(live, { rarityTokens: rarity?.tokens, fairModel: market.fairModel, level });
      console.log(`aeon-sale: live feed returned ${live.length} sale(s) in ${LIVE_HOURS}h, ${joined.length} joined to rarity`);
      if (joined.length) { candidates = joined; source = "alchemy-live"; }
    } catch (e) { console.error(`aeon-sale: live feed failed (${e.message}) — falling back to the daily Dune pull`); }
  }
  // Freshness is judged against the REAL clock on BOTH paths. Using the market file's
  // build date let a 4-day-old sale through as "just sold" when that file was 2 days
  // stale. If the data is old, nothing qualifies — which is the correct outcome.
  const asOf = new Date().toISOString().slice(0, 10);
  const pick = pickNotable(candidates, { level, today: asOf, posted: force ? new Set() : posted });
  if (!pick) {
    console.log(`aeon-sale: nothing notable in the last ${NOTABLE_DAYS} days (checked ${candidates.length} sales from ${source}) — no post.`);
    return;
  }
  const { sale, kind } = pick;
  console.log(`aeon-sale: ${kind} [${source}] — #${sale.id} at ${sale.price}Ξ (rank ${sale.rank}, ${(sale.disc * 100).toFixed(0)}% vs typical) on ${sale.d}`);

  if (!force && lanePostedToday(LANE)) {
    console.log(`aeon-sale: lane "${LANE}" already posted today — skipping (one notable sale per day).`);
    return;
  }

  const { traits, total } = traitsFor(sale.id, RARITY);
  const tier = tierOf(sale.rank, total);
  // The piece IS the post. Try the cached URL, then a fresh Alchemy metadata pull; if
  // every source fails, DON'T publish a placeholder — skip and let the next run retry
  // (nothing is recorded as posted, so the sale stays eligible).
  const art = await fetchArt(sale.img, { key: ALCHEMY, tokenId: sale.id, contract: CONTRACT, network: NETWORK });
  if (!art && !dryRun) {
    console.error(`aeon-sale: could not fetch art for #${sale.id} from any source — skipping the post rather than publishing a card without the piece. Nothing recorded, so the next run retries it.`);
    return;
  }
  if (!art) console.error("aeon-sale: art unavailable here (sandboxed egress?) — dry-run renders the placeholder so the layout is still reviewable; a REAL run would skip.");
  const png = renderAeonSaleCard(sale, {
    traits, total, art,
    superlative: superlative(sale.price, market.priceMilestones),
    quotable: mayQuoteModel(sale.rank, market.rankSupport),
  });
  const text = withFooter(saleCopy(pick, { total, tier, traits, asOf, milestones: market.priceMilestones, rankSupport: market.rankSupport, level }));
  console.log(`--- copy (${[...text].length} chars) ---\n${text}\n---`);

  if (dryRun || !hasCreds) {
    writeFileSync(join(ROOT, "aeon-sale-preview.png"), png);
    console.log(dryRun ? "DRY RUN — wrote aeon-sale-preview.png, no post." : "No X creds — wrote aeon-sale-preview.png, no post.");
    return;
  }
  // postWithMedia takes (client, post, stats, media) — NOT raw creds. Passing creds made
  // `client.v2` undefined and the run died on `uploadMedia`. `stats` is only used by the
  // video-fallback branch, which a PNG never reaches.
  const { TwitterApi } = await import("twitter-api-v2");
  const client = new TwitterApi(creds);
  const tweetId = await postWithMedia(client, { text }, null, { kind: "image", data: png, mediaType: "image/png" });
  console.log("posted", tweetId || "");
  posted.add(`${sale.id}@${sale.d}`);
  // keep the memory bounded; only recent pairs can ever re-match anyway
  writeFileSync(STATE, JSON.stringify({ posted: [...posted].slice(-200), lastId: sale.id, lastAt: new Date().toISOString() }, null, 2) + "\n");
  recordLanePost(LANE, tweetId);
}

// Only run when invoked directly — importing this module (tests) must not fire a post.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main().catch(e => { console.error("aeon-sale: failed —", e.message); process.exitCode = 1; });
