// ============================================================================
// PROJECT AEON — active listings × rarity (the "underpriced rare" deal finder)
// ============================================================================
// Pulls every active listing from OpenSea (api v2), joins each to the token's rarity
// (from public/aeon-rarity.json) + its image, and writes public/aeon-listings.json —
// the feed for the rarity-vs-price chart that flags rare pieces listed below their
// rarity-implied fair value.
//
//   node scripts/build-aeon-listings.mjs
//
// Requires OPENSEA_KEY (a free OpenSea API key — backend only). NO key → soft-skip; a bad/
// expired key (401) or any OpenSea error → soft-FAIL (keeps last-good listings, banker stays green).
// Reservoir (our first plan) shut down 2025-10; OpenSea is the standard listings source.
// Claude can't reach OpenSea from the sandbox → runs in CI (aeon.yml, daily — listings
// change constantly). VALIDATE first run: a plausible listing count, prices in ETH,
// ranks joined for most.
//
// VERIFY on first run (OpenSea response shapes evolve): a listing carries the token id at
// protocol_data.parameters.offer[0].identifierOrCriteria and price at price.current.{value,
// decimals,currency}. The collection slug is resolved from the contract, or set AEON_OS_SLUG.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const KEY = (process.env.OPENSEA_KEY || "").trim();
const CHAIN = process.env.AEON_OS_CHAIN || "ethereum";
const OUT = "public/aeon-listings.json";
const RARITY = "public/aeon-rarity.json";
const BASE = "https://api.opensea.io/api/v2";

async function os(path) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(`${BASE}/${path}`, { headers: { accept: "application/json", "x-api-key": KEY } });
      if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — check OPENSEA_KEY`);
      if (res.status === 429) throw new Error("rate limited (429)");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; console.error(`aeon-listings: ${path.split("?")[0]} — ${e.message}`); }
  }
  throw lastErr;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function main() {
  if (!KEY) { console.log("aeon-listings: no OPENSEA_KEY — soft-skipping"); return; }

  // rarity join table (rank/score/img by token id)
  let rar = {};
  try { const r = JSON.parse(readFileSync(RARITY, "utf8")); for (const t of r.tokens) rar[t.id] = { rank: t.rank, score: t.score, img: t.img }; }
  catch { console.error("aeon-listings: no aeon-rarity.json — rank/img won't be joined"); }
  const total = Object.keys(rar).length || 3333;

  // resolve the collection slug from the contract (or AEON_OS_SLUG override)
  let slug = process.env.AEON_OS_SLUG;
  if (!slug) { const c = await os(`chain/${CHAIN}/contract/${CONTRACT}`); slug = c?.collection; }
  if (!slug) throw new Error("could not resolve OpenSea collection slug (set AEON_OS_SLUG)");

  // page through all active listings
  const best = new Map();   // token id -> lowest ETH ask
  let next, pages = 0;
  do {
    const j = await os(`listings/collection/${slug}/all?limit=100${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    for (const L of (j.listings || [])) {
      const cur = L.price?.current || {};
      if (cur.currency && !["ETH", "WETH"].includes(cur.currency)) continue;      // ETH-denominated only
      const price = num(cur.value) != null ? Number(cur.value) / 10 ** (num(cur.decimals) ?? 18) : null;
      const offer = L.protocol_data?.parameters?.offer?.[0];
      const id = offer ? Number(offer.identifierOrCriteria) : null;
      if (!(price > 0) || id == null || !Number.isFinite(id)) continue;
      if (!best.has(id) || price < best.get(id)) best.set(id, price);            // cheapest listing per token
    }
    next = j.next;
  } while (next && ++pages < 200);

  const all = [...best.entries()].map(([id, price]) => ({
    id, price: +price.toFixed(4), rank: rar[id]?.rank ?? null, score: rar[id]?.score ?? null, img: rar[id]?.img ?? null,
  })).filter(l => l.rank != null).sort((a, b) => a.rank - b.rank);

  // ── Drop "not really for sale" asks ──────────────────────────────────────────
  // NFT holders routinely park an absurd ask (69, 690, 6900, 69000, even 1e9 ETH) so a
  // piece shows as listed but can never sell. Those aren't offers, and on a log axis a
  // single 1e9 ask spans 9 orders of magnitude — it flattens every real listing into an
  // invisible sliver AND poisons the log-log fair-value fit (huge leverage point).
  // Rule: keep asks within MAX_FLOOR_MULT× the cheapest listing. It's a real gap, not a
  // slice through a continuum (Jul-2026: real asks stop at 10Ξ, the joke tier starts at
  // 69Ξ), and it's reported below + on the chart rather than silently dropped.
  const MAX_FLOOR_MULT = 25;
  const floorAsk = Math.min(...all.map(l => l.price));
  const cap = floorAsk * MAX_FLOOR_MULT;
  const listings = all.filter(l => l.price <= cap);
  const parked = all.filter(l => l.price > cap);

  writeFileSync(OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10), contract: CONTRACT, slug, total,
    count: listings.length, parked: parked.length, cap: +cap.toFixed(4), floorMult: MAX_FLOOR_MULT, listings,
  }) + "\n");

  const cheapest = [...listings].sort((a, b) => a.price - b.price)[0];
  const rarestListed = listings[0];
  console.log(
    `aeon-listings: ${listings.length} genuine listings (${slug}) · ${parked.length} parked above ${cap.toFixed(2)} ETH excluded\n` +
    `  floor listing ${cheapest?.price} ETH (#${cheapest?.id}, rank ${cheapest?.rank})\n` +
    `  rarest listed #${rarestListed?.id} rank ${rarestListed?.rank} at ${rarestListed?.price} ETH` +
    (parked.length ? `\n  parked asks: ${parked.slice(0, 5).map(p => p.price).join(", ")}${parked.length > 5 ? "…" : ""}` : "")
  );
}

main().catch(e => {
  // The deal-finder listings are an OPTIONAL feature that needs a live OpenSea key. A bad or
  // expired key (401/403), a rate limit, or any OpenSea hiccup must NOT red the whole daily
  // banker — floor/owners/rarity/sales have already banked, and the last-good aeon-listings.json
  // is left untouched (we never wrote over it). Log loudly so a broken key is visible in the run,
  // then exit clean. Mirrors build-aeon-dune-refresh.mjs's soft-fail. Fix the key → next run heals.
  console.error("aeon-listings: soft-fail (keeping last-good listings) —", e.message);
});
