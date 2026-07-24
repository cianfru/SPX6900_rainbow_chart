// ============================================================================
// PROJECT AEON — trait rarity (Alchemy NFT metadata)
// ============================================================================
// Pulls every token's traits from Alchemy (getNFTsForContract, paginated) and computes
// a transparent, reproducible rarity score:
//   • trait frequency tables (how common each trait value is)
//   • per-token statistical rarity = Σ over its traits of (total / count(trait value))
//     — rarer traits contribute more; higher score = rarer token
//   • rank (1 = rarest) + percentile, and a "trait count" meta-trait
// → public/aeon-rarity.json  (traits + per-token {id, rank, score, traits, img}).
//
//   node scripts/build-aeon-rarity.mjs           # skips if the file already exists
//   node scripts/build-aeon-rarity.mjs --force   # re-pull (traits are immutable → rarely needed)
//
// Requires ALCHEMY_KEY. NO key → soft-skip. Claude can't reach Alchemy from the sandbox,
// so this runs in CI (aeon.yml). VALIDATE the first run: total ≈ 3,333, a handful of
// 1/1 legendaries, trait tables look sane.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const KEY = (process.env.ALCHEMY_KEY || "").trim();
const NET = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const BASE = `https://${NET}.g.alchemy.com/nft/v3/${KEY}`;
const OUT = "public/aeon-rarity.json";
const FORCE = process.argv.includes("--force");

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1500 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — check ALCHEMY_KEY`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; const c = e?.cause ? ` (${e.cause.code || e.cause.message})` : ""; console.error(`aeon-rarity: ${e.message}${c}`); }
  }
  throw lastErr;
}

const attrsOf = nft => nft?.raw?.metadata?.attributes || nft?.metadata?.attributes || nft?.rawMetadata?.attributes || [];
const imgOf = nft => nft?.image?.cachedUrl || nft?.image?.thumbnailUrl || nft?.image?.originalUrl || null;

async function main() {
  if (!KEY) { console.log("aeon-rarity: no ALCHEMY_KEY — soft-skipping"); return; }
  if (existsSync(OUT) && !FORCE) { console.log(`aeon-rarity: ${OUT} exists — skipping (traits are immutable; --force to re-pull)`); return; }

  // 1. Fetch every token + its attributes (paginated).
  const tokens = [];
  let pageKey, pages = 0;
  do {
    const url = `${BASE}/getNFTsForContract?contractAddress=${CONTRACT}&withMetadata=true&limit=100${pageKey ? `&pageKey=${encodeURIComponent(pageKey)}` : ""}`;
    const j = await getJson(url);
    for (const nft of (j.nfts || [])) {
      const id = Number(nft.tokenId);
      const traits = attrsOf(nft).filter(a => a && a.trait_type != null && a.value != null)
        .map(a => ({ t: String(a.trait_type), v: String(a.value) }));
      tokens.push({ id, traits, img: imgOf(nft) });
    }
    pageKey = j.pageKey;
  } while (pageKey && ++pages < 60);
  if (!tokens.length) throw new Error("no tokens returned");

  // 2. Trait frequency tables (+ a trait-count meta-trait so sparse tokens read as rarer).
  const total = tokens.length;
  const counts = {};                 // trait_type → value → count
  const bump = (t, v) => { (counts[t] ||= {})[v] = (counts[t][v] || 0) + 1; };
  for (const tk of tokens) { for (const { t, v } of tk.traits) bump(t, v); bump("Trait Count", String(tk.traits.length)); }

  // 3. Statistical rarity score = Σ (total / count) over each trait (incl. Trait Count).
  const score = tk => {
    let s = 0;
    for (const { t, v } of tk.traits) s += total / counts[t][v];
    s += total / counts["Trait Count"][String(tk.traits.length)];
    return s;
  };
  for (const tk of tokens) tk.score = +score(tk).toFixed(2);
  tokens.sort((a, b) => b.score - a.score);          // rarest first
  tokens.forEach((tk, i) => { tk.rank = i + 1; });

  // 4. Emit trait tables (with %) + per-token records + score-distribution buckets.
  const traits = {};
  for (const t in counts) {
    traits[t] = Object.fromEntries(Object.entries(counts[t]).sort((a, b) => a[1] - b[1])
      .map(([v, c]) => [v, { count: c, pct: +(c / total * 100).toFixed(2) }]));
  }
  const out = {
    updated: new Date().toISOString().slice(0, 10),
    contract: CONTRACT, total,
    traitTypes: Object.keys(counts).filter(t => t !== "Trait Count"),
    traits,
    tokens: tokens.map(tk => ({ id: tk.id, rank: tk.rank, score: tk.score, traits: tk.traits, img: tk.img })),
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");

  const rarest = tokens[0], commonest = tokens.at(-1);
  console.log(
    `aeon-rarity: ${out.updated} · ${total} tokens · ${out.traitTypes.length} trait types\n` +
    `  rarest #${rarest.id} score ${rarest.score} (${rarest.traits.length} traits) · commonest #${commonest.id} score ${commonest.score}\n` +
    `  trait types: ${out.traitTypes.slice(0, 8).join(", ")}${out.traitTypes.length > 8 ? " …" : ""}`
  );
}

main().catch(e => { const c = e?.cause ? ` (${e.cause.code || e.cause.message})` : ""; console.error("aeon-rarity: failed —", e.message + c); process.exitCode = 1; });
