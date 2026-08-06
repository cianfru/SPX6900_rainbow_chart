// PROJECT AEON — FIRE SALE watcher. Finds the best live listing priced below what its rarity sells
// for, renders the buy-now card (aeon-firesale-preview.png) and writes public/aeon-firesale.json for
// the control panel. Manual-post for now — a Telegram alert + auto-post is the planned next step, so
// this never posts on its own. Runs in aeon.yml (continue-on-error) after the market rebuild.
//   node scripts/bot/aeon-firesale-watch.mjs         → detect + render preview + candidate
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickFiresale, renderAeonFiresaleCard } from "./aeon-firesale-card.mjs";
import { fetchArt, traitsFor, tierOf } from "./aeon-sale-card.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => { try { return JSON.parse(readFileSync(join(ROOT, "public", f), "utf8")); } catch { return null; } };
const day = () => new Date().toISOString().slice(0, 10);   // regular Node script — Date is available here
const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const MIN_DISC = Number(process.env.AEON_FIRESALE_MIN_DISC || 0.15);

async function main() {
  const listings = rd("aeon-listings.json"), market = rd("aeon-market.json");
  const total = listings?.total || market?.supply || 3333;
  const deal = pickFiresale(listings?.listings, market, total, { minDisc: MIN_DISC });
  const out = join(ROOT, "public/aeon-firesale.json");

  if (!deal) {
    writeFileSync(out, JSON.stringify({ none: true, minDisc: MIN_DISC, updated: day() }));
    console.log(`aeon-firesale: nothing listed ≥${Math.round(MIN_DISC * 100)}% below market.`);
    return;
  }

  const art = await fetchArt(deal.img, { key: (process.env.ALCHEMY_KEY || "").trim(), tokenId: deal.id, contract: CONTRACT }).catch(() => null);
  const png = renderAeonFiresaleCard(deal, { total, art, traits: traitsFor(deal.id) });
  if (png) writeFileSync(join(ROOT, "aeon-firesale-preview.png"), png);
  writeFileSync(out, JSON.stringify({
    id: deal.id, price: deal.price, exp: +deal.exp.toFixed(4), disc: +deal.disc.toFixed(3), rank: deal.rank,
    tier: tierOf(deal.rank, total).name, opensea: `https://opensea.io/assets/ethereum/${CONTRACT}/${deal.id}`,
    img: deal.img, updated: day(),
  }));
  console.log(`aeon-firesale: AEON #${deal.id} · ${Math.round(deal.disc * 100)}% below market · ${deal.price}Ξ (fair ${deal.exp.toFixed(3)}Ξ) → wrote preview + candidate.`);
}

main().catch(e => { console.error("aeon-firesale:", e.message); process.exit(0); });  // never block the aeon job
