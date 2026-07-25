// PROJECT AEON — "notable sale" event card. One fresh sale, shown with the actual piece:
// what it fetched, where it sits on the rarity curve, how that price compares to what
// pieces of the same rarity have been trading at, and the traits that make it rare.
//
// The art is fetched and EMBEDDED as a data URI: resvg does not resolve remote hrefs, so a
// plain <image href="https://…"> renders as nothing. If the fetch fails the card still
// renders with a placeholder rather than failing the post.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

const TIERS = [
  { name: "Legendary", max: 0.01, c: "#f59e0b" },
  { name: "Epic", max: 0.05, c: "#a855f7" },
  { name: "Rare", max: 0.15, c: "#3b82f6" },
  { name: "Uncommon", max: 0.40, c: "#22d3ee" },
  { name: "Common", max: 1.01, c: "#64748b" },
];
// Tier colour is for CHROME only — chip fill, borders, glows. Card TEXT is white:
// Common (#64748b) is a dim slate that vanishes on the dark background, and Common is
// most of any collection, so tier-coloured text was least readable exactly where it
// mattered most. The chip keeps its tinted fill and border, so the tier still reads.
export const tierOf = (rank, total) => TIERS.find(t => rank / total <= t.max) || TIERS.at(-1);
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// The piece IS the post, so the art is not optional — the watcher refuses to publish
// without it. Servers mislabel content-type often enough that we sniff magic bytes
// instead of trusting the header: resvg needs to know what it is actually decoding.
const MAGIC = [
  { type: "image/png", test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  // WEBP = "RIFF"…"WEBP". resvg cannot decode it, so it is rejected and we try the next
  // candidate URL (Alchemy's thumbnail is usually PNG/JPEG).
  { type: null, test: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 },
];
const sniff = buf => {
  for (const m of MAGIC) if (buf.length > 12 && m.test(buf)) return m.type;
  const head = buf.slice(0, 200).toString("utf8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
};

/** Fetch one URL → data URI resvg can draw, or null. */
async function tryArt(url, fetchImpl, tries = 3) {
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, 600 * 2 ** (i - 1)));
    try {
      const res = await fetchImpl(url, { headers: { accept: "image/*" } });
      if (!res.ok) { if (res.status === 404 || res.status === 410) return null; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 128) continue;                       // truncated / placeholder body
      const type = sniff(buf);
      if (!type) return null;                               // decodable-by-resvg check failed
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch { /* retry */ }
  }
  return null;
}

/**
 * Resolve the token art, trying every source we have before giving up:
 *   1. the URL cached in aeon-rarity.json
 *   2. a FRESH pull of the token's metadata from Alchemy (cachedUrl → thumbnail → original)
 * Returns a data URI, or null if every source failed.
 */
export async function fetchArt(url, { fetchImpl = fetch, key, tokenId, contract, network = "eth-mainnet" } = {}) {
  const candidates = [];
  if (url) candidates.push(url);
  if (key && tokenId != null && contract) {
    try {
      const meta = await fetchImpl(
        `https://${network}.g.alchemy.com/nft/v3/${key}/getNFTMetadata?contractAddress=${contract}&tokenId=${tokenId}&refreshCache=false`,
        { headers: { accept: "application/json" } });
      if (meta.ok) {
        const j = await meta.json();
        for (const u of [j?.image?.cachedUrl, j?.image?.thumbnailUrl, j?.image?.pngUrl, j?.image?.originalUrl]) {
          if (u && !candidates.includes(u)) candidates.push(u);
        }
      }
    } catch { /* fall through to whatever we already have */ }
  }
  for (const c of candidates) {
    const art = await tryArt(c, fetchImpl);
    if (art) return art;
  }
  return null;
}

/** Traits for a token, rarest first, from public/aeon-rarity.json. */
export function traitsFor(tokenId, rarityPath = "public/aeon-rarity.json") {
  try {
    const r = JSON.parse(readFileSync(rarityPath, "utf8"));
    const t = r.tokens.find(x => x.id === tokenId);
    if (!t) return { traits: [], total: r.total };
    const rows = t.traits.map(a => ({ t: a.t, v: a.v, pct: r.traits?.[a.t]?.[a.v]?.pct ?? null }))
      .sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));
    return { traits: rows, total: r.total, score: t.score };
  } catch { return { traits: [], total: 3333 }; }
}

export function aeonSaleSvg(sale, opts = {}) {
  const { W = 1080, H = 1080 } = opts;
  const total = opts.total ?? 3333;
  const tier = tierOf(sale.rank, total);
  const art = opts.art || null;
  const traits = (opts.traits || []).slice(0, 4);
  const disc = sale.disc ?? 0;
  const cheap = disc > 0;
  // Headline framing. A percentage against the fitted line is only quoted where the fit
  // has comparables — at the rarest end it has almost none (rank 1 sees ~3 sales), which is
  // what produced "1860% above what this rarity trades at". `opts.superlative` carries the
  // empirical alternative ("the highest this collection has ever traded at") and wins when
  // present, since it is a fact rather than an extrapolation.
  const verdictC = opts.superlative && !cheap ? "#fbbf24" : cheap ? "#34d399" : "#fb7185";
  const verdictTxt = opts.superlative && !cheap
    ? opts.superlative
    : opts.quotable === false
      ? (cheap ? "under what comparable pieces have fetched" : "above what comparable pieces have fetched")
      : Math.abs(disc) < 0.05
        ? "right at market for its rarity"
        : `${Math.abs(disc * 100).toFixed(0)}% ${cheap ? "below" : "above"} what this rarity trades at`;

  const P = 54;                      // page padding
  const artS = Math.round(W * 0.46); // art square
  const artX = P, artY = 214;
  const rightX = artX + artS + 34;
  const rightW = W - rightX - P;

  let traitRows = "";
  traits.forEach((tr, i) => {
    const y = artY + artS + 96 + i * 46;
    const rare = tr.pct != null && tr.pct <= 2;
    traitRows +=
      `<text x="${P}" y="${y}" fill="#7c8a9e" font-size="21" font-family="sans-serif">${esc(tr.t)}</text>` +
      `<text x="${P + 210}" y="${y}" fill="#e2e8f0" font-size="23" font-weight="600" font-family="sans-serif">${esc(tr.v)}</text>` +
      `<text x="${W - P}" y="${y}" fill="${rare ? "#f59e0b" : "#94a3b8"}" font-size="22" font-weight="${rare ? 700 : 400}" text-anchor="end" font-family="sans-serif">${tr.pct != null ? tr.pct + "%" : "—"}</text>`;
  });

  const artBlock = art
    ? `<image href="${art}" x="${artX}" y="${artY}" width="${artS}" height="${artS}" preserveAspectRatio="xMidYMid slice" clip-path="url(#artClip)"/>`
    : `<rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18" fill="#0a0e1c"/>` +
      `<text x="${artX + artS / 2}" y="${artY + artS / 2}" fill="#475569" font-size="30" text-anchor="middle" font-family="sans-serif">AEON #${sale.id}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("as", [tier.c, "#22d3ee"])}
<clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18"/></clipPath>
</defs>${aeonBgRects(W, H, "as")}
<text x="${P}" y="86" fill="#e2e8f0" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">PROJECT AEON — NOTABLE SALE</text>
<text x="${P}" y="128" fill="#94a3b8" font-size="22" font-family="sans-serif">${esc(sale.d)} · on-chain marketplace trade</text>
<text x="${P}" y="182" fill="${verdictC}" font-size="34" font-weight="800" font-family="sans-serif">${esc(verdictTxt)}</text>
${artBlock}
<rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18" fill="none" stroke="${tier.c}" stroke-width="3" stroke-opacity="0.75"/>
<text x="${rightX}" y="${artY + 52}" fill="#f1f5f9" font-size="46" font-weight="800" font-family="sans-serif">AEON #${sale.id}</text>
<rect x="${rightX}" y="${artY + 76}" width="${Math.min(rightW, 210)}" height="42" rx="10" fill="${tier.c}" fill-opacity="0.16" stroke="${tier.c}" stroke-opacity="0.7"/>
<text x="${rightX + 18}" y="${artY + 105}" fill="#f8fafc" font-size="24" font-weight="700" font-family="sans-serif">${esc(tier.name)}</text>
<text x="${rightX}" y="${artY + 190}" fill="#7c8a9e" font-size="22" font-family="sans-serif">sold for</text>
<text x="${rightX}" y="${artY + 254}" fill="#f8fafc" font-size="64" font-weight="800" font-family="sans-serif">${esc(fEth(sale.price))}</text>
<text x="${rightX}" y="${artY + 306}" fill="#94a3b8" font-size="23" font-family="sans-serif">${opts.quotable === false ? "too few comparables to price it" : `vs ${esc(fEth(sale.exp))} typical for this rarity`}</text>
<text x="${rightX}" y="${artY + 372}" fill="#7c8a9e" font-size="22" font-family="sans-serif">rarity rank</text>
<text x="${rightX}" y="${artY + 424}" fill="#f8fafc" font-size="46" font-weight="800" font-family="sans-serif">#${sale.rank.toLocaleString()}</text>
<text x="${rightX}" y="${artY + 462}" fill="#7c8a9e" font-size="23" font-family="sans-serif">of ${total.toLocaleString()} · rarer than ${(100 * (1 - (sale.rank - 1) / total)).toFixed(0)}%</text>
<text x="${P}" y="${artY + artS + 56}" fill="#cbd5e1" font-size="25" font-weight="700" font-family="sans-serif">What makes it rare — rarest traits first</text>
${traitRows}
<text x="${P}" y="${H - 34}" fill="#6b7688" font-size="19" font-family="sans-serif">${esc("rarity from on-chain metadata · “typical” = realized sales for that rarity · reproducible, not a valuation")}</text>
</svg>`;
}

export function renderAeonSaleCard(sale, opts = {}) {
  const svg = aeonSaleSvg(sale, opts);
  return svg ? png(svg, opts.W ?? 1080) : null;
}
