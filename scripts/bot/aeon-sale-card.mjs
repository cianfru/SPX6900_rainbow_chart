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
export const tierOf = (rank, total) => TIERS.find(t => rank / total <= t.max) || TIERS.at(-1);
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

/** Fetch the token art and return a data URI resvg can draw. Null on any failure. */
export async function fetchArt(url, fetchImpl = fetch) {
  if (!url) return null;
  try {
    const res = await fetchImpl(url, { headers: { accept: "image/*" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const type = res.headers?.get?.("content-type") || "image/png";
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch { return null; }
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
  // headline framing: cheap vs dear vs simply notable for its rarity
  const verdictC = cheap ? "#34d399" : "#fb7185";
  const verdictTxt = Math.abs(disc) < 0.05
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
<text x="${P}" y="182" fill="${verdictC}" font-size="34" font-weight="800" font-family="sans-serif" filter="url(#asGlow)">${esc(verdictTxt)}</text>
${artBlock}
<rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18" fill="none" stroke="${tier.c}" stroke-width="3" stroke-opacity="0.75"/>
<text x="${rightX}" y="${artY + 52}" fill="#f1f5f9" font-size="46" font-weight="800" font-family="sans-serif">AEON #${sale.id}</text>
<rect x="${rightX}" y="${artY + 76}" width="${Math.min(rightW, 210)}" height="42" rx="10" fill="${tier.c}" fill-opacity="0.16" stroke="${tier.c}" stroke-opacity="0.7"/>
<text x="${rightX + 18}" y="${artY + 105}" fill="${tier.c}" font-size="24" font-weight="700" font-family="sans-serif">${esc(tier.name)}</text>
<text x="${rightX}" y="${artY + 190}" fill="#7c8a9e" font-size="22" font-family="sans-serif">sold for</text>
<text x="${rightX}" y="${artY + 254}" fill="#f8fafc" font-size="64" font-weight="800" font-family="sans-serif" filter="url(#asGlow)">${esc(fEth(sale.price))}</text>
<text x="${rightX}" y="${artY + 306}" fill="#94a3b8" font-size="23" font-family="sans-serif">vs ${esc(fEth(sale.exp))} typical for this rarity</text>
<text x="${rightX}" y="${artY + 372}" fill="#7c8a9e" font-size="22" font-family="sans-serif">rarity rank</text>
<text x="${rightX}" y="${artY + 424}" fill="${tier.c}" font-size="46" font-weight="800" font-family="sans-serif">#${sale.rank.toLocaleString()}</text>
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
