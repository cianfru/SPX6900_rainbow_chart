// ⭐ HOUSE BRAND MARK — the one element every SPX6900 card shares.
//
// The card roster grew two different header styles (a small wordmark + date stamp from the
// generic builder in charts.mjs, and a big folded-in headline on the hand-built on-chain
// cards). Unifying the headers would have meant rewriting 40 layouts, and the bold headline
// style is the house north star anyway — so instead every card carries ONE signature: a
// rainbow stripe down the left edge, painted in the rainbow chart's OWN band colours.
//
// Why the left edge: it survives cropping and thumbnailing (the feed shows cards small), it
// costs no layout — nothing else is drawn in the first 10px — and it is the project's actual
// palette rather than a decorative rainbow, so it reads as the chart's signature, not clip art.
// The Aeon cards carry the same stripe in their own teal→violet theme (aeon-card-bg.mjs), so
// the two tracks look like siblings without looking identical.
//
// USAGE — one line, right after the background rects:
//   `<svg …>…<rect width="W" height="H" fill="…"/>${brandStripe(H)}…</svg>`
// It emits its own <defs>, so there is nothing to wire into the card's gradient block.

// The rainbow chart's band colours, top (most expensive) → bottom (cheapest). Mirrors
// BAND_LABELS in src/models.js, minus the near-black Max Bubble step which reads as a
// smudge at 7px wide.
export const BRAND_STRIPE = ["#dc2626", "#ea580c", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1"];

/** The signature: a rainbow-banded stripe down the left edge. Self-contained. */
export const brandStripe = (H, { w = 7, id = "brandRb", opacity = 0.95 } = {}) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
  + BRAND_STRIPE.map((c, i) => `<stop offset="${(i / (BRAND_STRIPE.length - 1) * 100).toFixed(1)}%" stop-color="${c}"/>`).join("")
  + `</linearGradient></defs>`
  + `<rect x="0" y="0" width="${w}" height="${H}" fill="url(#${id})" opacity="${opacity}"/>`;

// ⭐ THE AURA — a soft accent-tinted radial wash that lifts a card off the flat near-black ground.
// Several hand-built cards draw a bare #05050e / vertical-grey background and read as dead/flat next
// to the full-colour north-star cards (hodlwaves et al). One line right after the background rect
// adds a gentle glow in the card's own accent (or a two-stop blend for multi-series cards), fading
// to nothing before it reaches the edges so it never fights the text. Emits its own <defs>.
//   `…<rect … fill="#05050e"/>${auraBg("#22d3ee", W, H)}${brandStripe(H)}…`
let _auraSeq = 0;
export const auraBg = (accent, W = 1200, H = 630, { cx = "50%", cy = "-6%", r = "70%", opacity = 0.16, accent2 = null } = {}) => {
  const id = `aura${_auraSeq++}`;
  const stops = a => `<stop offset="0%" stop-color="${a}" stop-opacity="${opacity}"/>`
    + `<stop offset="45%" stop-color="${a}" stop-opacity="${(opacity * 0.3).toFixed(3)}"/>`
    + `<stop offset="100%" stop-color="${a}" stop-opacity="0"/>`;
  let defs = `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(accent)}</radialGradient>`;
  let body = `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
  if (accent2) {   // a second glow from the lower-right for two-series cards, so both hues read
    const id2 = `aura${_auraSeq++}`;
    defs += `<radialGradient id="${id2}" cx="88%" cy="96%" r="72%">${stops(accent2)}</radialGradient>`;
    body += `<rect width="${W}" height="${H}" fill="url(#${id2})"/>`;
  }
  return defs + `</defs>` + body;
};

// ⭐ DEPTH — make a flat card read as a lit, layered surface (owner: "colourful AND polished").
// Two cheap, tasteful moves, no hue change, no per-card work:
//  • cardDepth(W,H): a soft VIGNETTE (edges fall into shadow so the centre lifts) + a thin TOP
//    SHEEN (a glass-like highlight along the top edge). Drawn once over the background, under content.
//  • plotPanel(x,y,w,h): the chart area as a RAISED panel — a soft drop shadow beneath + a bevel
//    (light top lip, dark bottom lip) — so the data sits on its own surface instead of on the ink.
// Both emit their own <defs> and are self-contained; ids are sequenced so several can coexist.
let _depthSeq = 0;
export const cardDepth = (W = 1200, H = 630, { vignette = 0.26, sheen = 0.07 } = {}) => {
  const v = `vg${_depthSeq++}`, s = `sh${_depthSeq++}`;
  return `<defs>`
    + `<radialGradient id="${v}" cx="50%" cy="44%" r="82%">`
      + `<stop offset="0%" stop-color="#000000" stop-opacity="0"/>`
      + `<stop offset="72%" stop-color="#000000" stop-opacity="0"/>`
      + `<stop offset="100%" stop-color="#000000" stop-opacity="${vignette}"/>`
    + `</radialGradient>`
    + `<linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0%" stop-color="#ffffff" stop-opacity="${sheen}"/>`
      + `<stop offset="6%" stop-color="#ffffff" stop-opacity="0"/>`
    + `</linearGradient>`
    + `</defs>`
    + `<rect width="${W}" height="${H}" fill="url(#${v})"/>`
    + `<rect width="${W}" height="${H}" fill="url(#${s})"/>`;
};

/** The chart area as a raised panel: soft drop shadow beneath + a top-light / bottom-dark bevel. */
export const plotPanel = (x, y, w, h, { rx = 10, bg = "#080810", bgOpacity = 0.34 } = {}) => {
  const f = `psh${_depthSeq++}`;
  return `<defs><filter id="${f}" x="-20%" y="-20%" width="140%" height="160%">`
    + `<feDropShadow dx="0" dy="7" stdDeviation="11" flood-color="#000000" flood-opacity="0.55"/></filter></defs>`
    // shadow-casting body (blurred), then the panel surface, then the two bevel lips
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bg}" fill-opacity="${bgOpacity}" filter="url(#${f})"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>`
    + `<rect x="${(x + 1).toFixed(1)}" y="${(y + h - rx).toFixed(1)}" width="${(w - 2).toFixed(1)}" height="${rx}" fill="none" stroke="#000000" stroke-opacity="0.28" stroke-width="1" rx="${rx}"/>`;
};

/** A horizontal rainbow rule — the same palette, for separating a header from a plot. */
export const brandRule = (x, y, w, { h = 3, id = "brandRbH", opacity = 0.85 } = {}) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">`
  + BRAND_STRIPE.slice().reverse().map((c, i) => `<stop offset="${(i / (BRAND_STRIPE.length - 1) * 100).toFixed(1)}%" stop-color="${c}"/>`).join("")
  + `</linearGradient></defs>`
  + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h / 2).toFixed(1)}" fill="url(#${id})" opacity="${opacity}"/>`;
