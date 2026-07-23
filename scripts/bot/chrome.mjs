// ⭐ HOUSE "CHROME" — the SPX6900 Rainbow Chart signature, shared by every card.
// The point: make a card unmistakably OURS (and hard to copy) via a persistent rainbow
// identity — a rainbow ARC MARK (our logo), a rainbow LEFT-EDGE stripe (visible even when
// cropped/thumbnailed), rainbow RULES under the title + above the footer, and a mono footer
// wordmark. Font-independent (pure SVG) so it drops onto any card. Owner chose Style B
// (serif headline) + a non-"dev-tool" mono for numbers (Fraunces + DM Mono, once wired).
//
// USAGE in a card SVG:
//   `<svg …>${chromeDefs()}${chromeBg(W,H)}${chromeHeader(...)}${…card content…}${chromeFooter(W,H,...)}</svg>`
// Font families the cards should reference once the TTFs are embedded:
//   HEAD = serif headline · MONO = numerals · SANS = body/labels.
export const RAINBOW = ["#ff3b3b", "#ff8c1a", "#ffd21a", "#3ddc84", "#22d3ee", "#3b82f6", "#a855f7"];
export const HEAD = "Fraunces";   // serif headline (Style B)
export const MONO = "DM Mono";    // numerals — NOT JetBrains/Plex ("very Claude")
export const SANS = "Space Grotesk"; // body/labels

// <defs> — the reusable rainbow gradient + a subtle brand glow. Include once per card.
export const chromeDefs = (id = "rb") => `<defs>
<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1) * 100).toFixed(0)}%" stop-color="${c}"/>`).join("")}</linearGradient>
<linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0b0c14"/><stop offset="100%" stop-color="#070709"/></linearGradient>
<radialGradient id="${id}glow" cx="88%" cy="10%" r="55%"><stop offset="0%" stop-color="#a855f7" stop-opacity="0.13"/><stop offset="42%" stop-color="#22d3ee" stop-opacity="0.045"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
</defs>`;

// Full-bleed background + the signature rainbow left-edge stripe.
export const chromeBg = (W, H, id = "rb") =>
  `<rect width="${W}" height="${H}" fill="url(#${id}bg)"/><rect width="${W}" height="${H}" fill="url(#${id}glow)"/><rect x="0" y="0" width="7" height="${H}" fill="url(#${id})"/>`;

// The rainbow ARC MARK — our logo, concentric semicircle arcs.
export const arcMark = (cx, cy, r0 = 12, dr = 5.5, sw = 3.4) =>
  RAINBOW.map((c, i) => { const r = r0 + i * dr; return `<path d="M ${(cx - r).toFixed(1)} ${cy} A ${r} ${r} 0 0 1 ${(cx + r).toFixed(1)} ${cy}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`; }).join("");

// A rainbow rule (thin gradient bar) — under a title or above the footer.
export const rainbowRule = (x, y, w, h = 4, id = "rb", opacity = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h / 2).toFixed(1)}" fill="url(#${id})" opacity="${opacity}"/>`;

// Top-left brand lockup: arc mark + SPX6900 / RAINBOW CHART wordmark.
export const chromeHeader = (x = 40, y = 40) =>
  `${arcMark(x + 34, y + 34, 12, 5.5, 3.4)}<text x="${x + 70}" y="${y + 26}" font-family="${SANS}" font-weight="700" font-size="24" letter-spacing="3" fill="#e9eef7">SPX6900</text><text x="${x + 70}" y="${y + 50}" font-family="${MONO}" font-size="15" letter-spacing="4" fill="#7b8496">RAINBOW CHART</text>`;

// Footer: rainbow rule + mono wordmark left, optional tag right.
export const chromeFooter = (W, H, note = "spx6900rainbow.xyz  ·  every number checkable  ·  on-chain", tag = "", id = "rb") =>
  `${rainbowRule(120, H - 47, W - 240, 2, id, 0.5)}<text x="120" y="${H - 21}" font-family="${MONO}" font-size="16" fill="#8b95a7">${note}</text>${tag ? `<text x="${W - 40}" y="${H - 21}" text-anchor="end" font-family="${SANS}" font-size="15" fill="#5b6577">${tag}</text>` : ""}`;
