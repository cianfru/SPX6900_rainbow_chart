// Shared "city dusk" background for the SPX City cards — gives them a distinct, coloured identity
// (a deep blue night sky + a lit skyline), the way the Aeon cards carry a teal→violet theme. The
// on-chain cards sit on near-black; the city cards sit on this, so the two tracks read apart at a
// glance. Self-contained: emits its own <defs>, so a card just drops `cityBg(W, H)` right after its
// opening <svg> tag (before the headline + brandStripe).

// Deterministic skyline: fixed silhouette + window pattern, so a card renders identically every time
// (no Math.random drift between the feed image and a re-render).
const SKYLINE = [
  [0.00, 0.34, 1], [0.05, 0.52, 1], [0.10, 0.28, 0], [0.135, 0.66, 1], [0.19, 0.44, 1],
  [0.235, 0.80, 1], [0.30, 0.38, 0], [0.345, 0.58, 1], [0.40, 0.30, 1], [0.44, 0.72, 1],
  [0.50, 0.46, 1], [0.55, 0.90, 1], [0.62, 0.34, 0], [0.665, 0.60, 1], [0.72, 0.42, 1],
  [0.765, 0.78, 1], [0.83, 0.32, 0], [0.875, 0.56, 1], [0.93, 0.40, 1], [0.965, 0.68, 1],
];

/** City-dusk background: gradient sky + horizon glow + (optional) a lit skyline along the foot.
 *  Pass skyline:false when the card's own chart is the skyline (e.g. a stacked-area cityscape). */
export function cityBg(W, H, { glow = "#22d3ee", maxTower = 0.26, skyline: withSkyline = true } = {}) {
  const groundY = H;                         // skyline sits on the bottom edge
  const towerW = W * 0.052;
  let skyline = "";
  for (const [fx, fh, lit] of (withSkyline ? SKYLINE : [])) {
    const x = fx * W, h = fh * maxTower * H, y = groundY - h;
    skyline += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${towerW.toFixed(1)}" height="${h.toFixed(1)}" fill="#0d1c3a" opacity="0.9"/>`;
    if (lit) {                               // a few warm/cool lit windows
      const cols = 3, rows = Math.max(1, Math.floor(h / 34));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ((r * 7 + c * 3 + Math.round(fx * 100)) % 4 === 0) continue;   // deterministic gaps
        const wx = x + towerW * (0.22 + c * 0.28), wy = y + 12 + r * 30;
        const col = (r + c) % 5 === 0 ? "#fbbf24" : glow;
        skyline += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="6" height="7" rx="1" fill="${col}" opacity="0.55"/>`;
      }
    }
  }
  return `<defs>
<linearGradient id="cbgSky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#0a1734"/><stop offset="42%" stop-color="#0a1430"/>
  <stop offset="78%" stop-color="#070d20"/><stop offset="100%" stop-color="#05060f"/>
</linearGradient>
<radialGradient id="cbgGlow" cx="50%" cy="96%" r="70%">
  <stop offset="0%" stop-color="${glow}" stop-opacity="0.22"/><stop offset="55%" stop-color="${glow}" stop-opacity="0.05"/><stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#cbgSky)"/>
<rect width="${W}" height="${H}" fill="url(#cbgGlow)"/>
${skyline}`;
}
