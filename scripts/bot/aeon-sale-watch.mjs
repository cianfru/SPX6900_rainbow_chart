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
import { lanePostedToday, recordLanePost } from "./posts.mjs";
import { fetchLiveSales } from "./aeon-live-sales.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MARKET = join(ROOT, "public/aeon-market.json");
const STATE = join(ROOT, "public/aeon-sale-state.json");
const RARITY = join(ROOT, "public/aeon-rarity.json");
const LANE = "aeonsale";
const ALCHEMY = (process.env.ALCHEMY_KEY || "").trim();
const NETWORK = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const LIVE_HOURS = Number(process.env.AEON_SALE_HOURS || 48);

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

/** House-style 3-line copy. Leads with the number, states the method, no advice. */
export function saleCopy({ sale, kind }, { total, tier, traits }) {
  const rarest = traits?.[0];
  const rareBit = rarest?.pct != null ? ` ${rarest.v} shows on just ${rarest.pct}% of the collection.` : "";
  const pctBelow = Math.round(Math.abs(sale.disc) * 100);
  const head = kind === "steal"
    ? `🖼️ AEON #${sale.id} just sold for ${fEth(sale.price)} — ${pctBelow}% under what its rarity normally trades at.`
    : kind === "rare"
      ? `🖼️ AEON #${sale.id} just changed hands for ${fEth(sale.price)} — rank ${sale.rank.toLocaleString()} of ${total.toLocaleString()}, ${tier.name}.`
      : `🖼️ AEON #${sale.id} just sold for ${fEth(sale.price)} — ${pctBelow}% ABOVE what its rarity normally trades at.`;
  const body = `Rank ${sale.rank.toLocaleString()} of ${total.toLocaleString()} (${tier.name}).${rareBit} Pieces at this rarity have been trading around ${fEth(sale.exp)}.`;
  const tail = `Rarity from on-chain metadata, "typical" from realized sales — both reproducible. Not a valuation.`;
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
  // Live sales are dated from the chain, so judge freshness against NOW, not the
  // market file's build date (which lags by up to a day).
  const asOf = source === "alchemy-live" ? new Date().toISOString().slice(0, 10) : today;
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
  const png = renderAeonSaleCard(sale, { traits, total, art });
  const text = saleCopy(pick, { total, tier, traits });
  console.log(`--- copy (${[...text].length} chars) ---\n${text}\n---`);

  if (dryRun || !hasCreds) {
    writeFileSync(join(ROOT, "aeon-sale-preview.png"), png);
    console.log(dryRun ? "DRY RUN — wrote aeon-sale-preview.png, no post." : "No X creds — wrote aeon-sale-preview.png, no post.");
    return;
  }
  const res = await postWithMedia(creds, text, png, "image/png");
  console.log("posted", res?.data?.id || "");
  posted.add(`${sale.id}@${sale.d}`);
  // keep the memory bounded; only recent pairs can ever re-match anyway
  writeFileSync(STATE, JSON.stringify({ posted: [...posted].slice(-200), lastId: sale.id, lastAt: new Date().toISOString() }, null, 2) + "\n");
  recordLanePost(LANE, res?.data?.id);
}

// Only run when invoked directly — importing this module (tests) must not fire a post.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main().catch(e => { console.error("aeon-sale: failed —", e.message); process.exitCode = 1; });
