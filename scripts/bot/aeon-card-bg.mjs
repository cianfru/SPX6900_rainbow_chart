// Shared colourful, high-impact background for the Aeon cards: a dark diagonal base +
// two large soft THEMED radial glows in opposite corners + a gradient accent stripe +
// a reusable glow filter. `theme = [c1, c2]`. Keeps every Aeon card visually consistent.
export const aeonBgDefs = (id, theme = ["#2dd4bf", "#a855f7"]) =>
  `<linearGradient id="${id}B" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0c1020"/><stop offset="55%" stop-color="#080a14"/><stop offset="100%" stop-color="#05050b"/></linearGradient>` +
  `<radialGradient id="${id}G1" cx="12%" cy="8%" r="60%"><stop offset="0%" stop-color="${theme[0]}" stop-opacity="0.26"/><stop offset="55%" stop-color="${theme[0]}" stop-opacity="0.05"/><stop offset="100%" stop-color="${theme[0]}" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="${id}G2" cx="92%" cy="98%" r="62%"><stop offset="0%" stop-color="${theme[1]}" stop-opacity="0.22"/><stop offset="60%" stop-color="${theme[1]}" stop-opacity="0.04"/><stop offset="100%" stop-color="${theme[1]}" stop-opacity="0"/></radialGradient>` +
  `<linearGradient id="${id}Stripe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${theme[0]}"/><stop offset="100%" stop-color="${theme[1]}"/></linearGradient>` +
  `<filter id="${id}Glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// The painted background + accent stripe. Place right after the opening <svg>/<defs>.
export const aeonBgRects = (W, H, id) =>
  `<rect width="${W}" height="${H}" fill="url(#${id}B)"/>` +
  `<rect width="${W}" height="${H}" fill="url(#${id}G1)"/>` +
  `<rect width="${W}" height="${H}" fill="url(#${id}G2)"/>` +
  `<rect x="0" y="0" width="9" height="${H}" fill="url(#${id}Stripe)"/>`;

// ── ONE HEADER FOR THE WHOLE AEON SET ────────────────────────────────────────
// These cards had drifted into five different header specs — titles at 36/38/42, three
// greys, subtitles at 21 and 22, heroes at 30/32/34, and the skyline printing its
// subtitle BELOW the hero instead of above. Nobody notices any one of them; seen as a
// set it just looks unmade. So the header lives here now and every card calls it.
//
// Weights are 700, not 800: the bundled face has exactly two weights, so 800 renders
// identically to 700 and only pretends to be a third step.
//
// `AEON_MT` is the first y a plot may use — 40px below the hero's descenders.
export const AEON_HEAD = { title: 38, sub: 22, hero: 34, yTitle: 58, ySub: 100, yHero: 148, x: 60 };
export const AEON_MT = 188;

const escT = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Title / optional subtitle / hero, in that order, in the house treatment.
 * `heroColor` is the card's accent — the one place a card gets to differ.
 */
export const aeonHeader = (title, sub, hero, heroColor = "#5eead4", F = "sans-serif") => {
  const H = AEON_HEAD;
  return `<text x="${H.x}" y="${H.yTitle}" fill="#f1f5f9" font-size="${H.title}" font-weight="700" font-family="${F}" letter-spacing="0.5">${escT(title)}</text>`
    + (sub ? `<text x="${H.x}" y="${H.ySub}" fill="#94a3b8" font-size="${H.sub}" font-family="${F}">${escT(sub)}</text>` : "")
    + (hero ? `<text x="${H.x}" y="${sub ? H.yHero : H.ySub + 14}" fill="${heroColor}" font-size="${H.hero}" font-weight="700" font-family="${F}">${escT(hero)}</text>` : "");
};
