// PROJECT AEON — FIRE SALE card. When a live listing is priced BELOW what its rarity actually sells
// for, this is the "buy it now" card: the piece, the ask, how far under market, its rarity + rarest
// traits, and an OpenSea CTA. Fair value comes from realized sales (aeon-market.json `fairModel`),
// never from the asks — the same model the listings chart uses. Art is fetched + embedded as a data
// URI (resvg won't resolve remote hrefs); a failed fetch falls back to a placeholder, never a crash.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects } from "./aeon-card-bg.mjs";
import { tierOf } from "./aeon-sale-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// Best live listing under fair value, from listings × the realized-sales fair model. Returns the
// deepest discount ≥ minDisc, or null. Same math as AeonValueChart so the card can't disagree.
export function pickFiresale(listings, market, total, { minDisc = 0.15 } = {}) {
  const fm = market && !market.empty ? market.fairModel : null;
  const level = fm?.level || market?.levelNow || 0;
  if (!fm || !(level > 0)) return null;
  const expOf = rank => level * Math.exp(fm.a + fm.b * Math.log(rank));
  let best = null;
  for (const l of listings || []) {
    if (!(l.rank > 0) || !(l.price > 0)) continue;
    const exp = expOf(l.rank);
    if (!(exp > 0)) continue;
    const disc = (exp - l.price) / exp;
    if (disc >= minDisc && (!best || disc > best.disc)) best = { ...l, exp, disc };
  }
  return best;
}

export function aeonFiresaleSvg(deal, opts = {}) {
  const { W = 1080, H = 1080 } = opts;
  const total = opts.total ?? 3333;
  const tier = tierOf(deal.rank, total);
  const art = opts.art || null;
  const traits = (opts.traits || []).slice(0, 4);
  const pct = Math.round(deal.disc * 100);

  const P = 54, artS = Math.round(W * 0.46), artX = P, artY = 214;
  const rightX = artX + artS + 34, rightW = W - rightX - P;

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
      `<text x="${artX + artS / 2}" y="${artY + artS / 2}" fill="#475569" font-size="30" text-anchor="middle" font-family="sans-serif">AEON #${deal.id}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("fs", ["#34d399", "#22d3ee"])}
<clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18"/></clipPath>
</defs>${aeonBgRects(W, H, "fs")}
<text x="${P}" y="86" fill="#34d399" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">PROJECT AEON — FIRE SALE</text>
<text x="${P}" y="128" fill="#94a3b8" font-size="22" font-family="sans-serif">listed below what this rarity sells for · buy now on OpenSea</text>
<text x="${P}" y="184" fill="#34d399" font-size="40" font-weight="800" font-family="sans-serif">${pct}% below market</text>
${artBlock}
<rect x="${artX}" y="${artY}" width="${artS}" height="${artS}" rx="18" fill="none" stroke="${tier.c}" stroke-width="3" stroke-opacity="0.75"/>
<text x="${rightX}" y="${artY + 52}" fill="#f1f5f9" font-size="46" font-weight="800" font-family="sans-serif">AEON #${deal.id}</text>
<rect x="${rightX}" y="${artY + 76}" width="${Math.min(rightW, 210)}" height="42" rx="10" fill="${tier.c}" fill-opacity="0.16" stroke="${tier.c}" stroke-opacity="0.7"/>
<text x="${rightX + 18}" y="${artY + 105}" fill="#f8fafc" font-size="24" font-weight="700" font-family="sans-serif">${esc(tier.name)}</text>
<text x="${rightX}" y="${artY + 190}" fill="#7c8a9e" font-size="22" font-family="sans-serif">asking</text>
<text x="${rightX}" y="${artY + 254}" fill="#34d399" font-size="64" font-weight="800" font-family="sans-serif">${esc(fEth(deal.price))}</text>
<text x="${rightX}" y="${artY + 306}" fill="#94a3b8" font-size="23" font-family="sans-serif">vs ${esc(fEth(deal.exp))} typical for this rarity</text>
<text x="${rightX}" y="${artY + 372}" fill="#7c8a9e" font-size="22" font-family="sans-serif">rarity rank</text>
<text x="${rightX}" y="${artY + 424}" fill="#f8fafc" font-size="46" font-weight="800" font-family="sans-serif">#${deal.rank.toLocaleString()}</text>
<text x="${rightX}" y="${artY + 462}" fill="#7c8a9e" font-size="23" font-family="sans-serif">of ${total.toLocaleString()} · rarer than ${(100 * (1 - (deal.rank - 1) / total)).toFixed(0)}%</text>
<text x="${P}" y="${artY + artS + 56}" fill="#cbd5e1" font-size="25" font-weight="700" font-family="sans-serif">What makes it rare — rarest traits first</text>
${traitRows}
<text x="${P}" y="${H - 34}" fill="#6b7688" font-size="19" font-family="sans-serif">${esc("fair value = realized sales for that rarity · reproducible, not a valuation · verify on OpenSea before buying")}</text>
</svg>`;
}

export function renderAeonFiresaleCard(deal, opts = {}) {
  return deal ? png(aeonFiresaleSvg(deal, opts), opts.W ?? 1080) : null;
}
