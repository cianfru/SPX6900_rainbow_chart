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
