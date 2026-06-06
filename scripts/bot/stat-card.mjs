// Generic branded "stat" card (1200x630 PNG) used by most rotating posts.
// SVG -> PNG via resvg (no browser). Note: resvg has no emoji font, so keep
// card text emoji-free (emojis live in the tweet text instead).
import { Resvg } from "@resvg/resvg-js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// spec: { title, big, sub, rows:[{label,value}], accent, footer }
export function renderStatCard(spec) {
  const W = 1200, H = 630, accent = spec.accent || "#4ade80";
  const rows = spec.rows || [];
  const footer = spec.footer || "spx6900rainbow.xyz · not financial advice";

  let rowsSvg = "";
  if (rows.length) {
    const n = rows.length, gap = W / n;
    rows.forEach((r, i) => {
      const cx = gap * i + gap / 2;
      rowsSvg += `<text x="${cx.toFixed(1)}" y="498" fill="#64748b" font-size="24" font-weight="600" text-anchor="middle" font-family="sans-serif" letter-spacing="1">${esc(r.label)}</text>`;
      rowsSvg += `<text x="${cx.toFixed(1)}" y="552" fill="${r.color || "#e2e8f0"}" font-size="46" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(r.value)}</text>`;
    });
  }

  const subSvg = spec.sub
    ? `<text x="64" y="430" fill="#94a3b8" font-size="30" font-family="sans-serif">${esc(spec.sub)}</text>`
    : "";

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<defs><radialGradient id="g" cx="50%" cy="0%" r="75%">
  <stop offset="0%" stop-color="${accent}" stop-opacity="0.20"/>
  <stop offset="55%" stop-color="${accent}" stop-opacity="0"/>
</radialGradient></defs>
<text x="64" y="92" fill="#94a3b8" font-size="32" font-weight="700" font-family="sans-serif" letter-spacing="3">SPX6900</text>
<text x="${W - 64}" y="92" fill="#475569" font-size="26" text-anchor="end" font-family="sans-serif">${esc(spec.date || "")}</text>
<text x="64" y="190" fill="#e2e8f0" font-size="40" font-weight="700" font-family="sans-serif">${esc(spec.title)}</text>
<text x="64" y="340" fill="${accent}" font-size="128" font-weight="800" font-family="sans-serif">${esc(spec.big)}</text>
${subSvg}
<line x1="64" y1="452" x2="${W - 64}" y2="452" stroke="rgba(255,255,255,0.08)"/>
${rowsSvg}
<text x="64" y="612" fill="#475569" font-size="24" font-family="sans-serif">${esc(footer)}</text>
</svg>`;

  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
