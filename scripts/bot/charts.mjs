// Reusable chart cards (1200x630 PNG) for the bot — line/area and bar — rendered
// as SVG then rasterized with resvg (no browser). Header carries the title + a
// big headline number; the plot below gives the visual punch. Keep text
// emoji-free (resvg has no emoji font).
import { Resvg } from "@resvg/resvg-js";
import { renderRainbowCard } from "./rainbow-card.mjs";

const W = 1200, H = 630, mL = 88, mR = 48, mT = 188, mB = 76;
const pW = W - mL - mR, pH = H - mT - mB;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function chrome(spec, inner) {
  const accent = spec.accent || "#4ade80";
  const footer = spec.footer || "spx6900rainbow.xyz · not financial advice";
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<defs><radialGradient id="g" cx="50%" cy="0%" r="80%">
  <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/><stop offset="55%" stop-color="${accent}" stop-opacity="0"/>
</radialGradient></defs>
<text x="64" y="52" fill="#94a3b8" font-size="30" font-weight="700" letter-spacing="3" font-family="sans-serif">SPX6900</text>
<text x="${W - 64}" y="52" fill="#475569" font-size="24" text-anchor="end" font-family="sans-serif">${esc(spec.date || "")}</text>
<text x="64" y="112" fill="#e2e8f0" font-size="38" font-weight="700" font-family="sans-serif">${esc(spec.title)}</text>
${spec.headline ? `<text x="64" y="166" fill="${accent}" font-size="58" font-weight="800" font-family="sans-serif">${esc(spec.headline)}</text>` : ""}
${inner}
<text x="64" y="${H - 22}" fill="#475569" font-size="22" font-family="sans-serif">${esc(footer)}</text>
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

function yearTicks(xMin, xMax) {
  const out = [];
  for (let y = new Date(xMin).getUTCFullYear(); y <= new Date(xMax).getUTCFullYear(); y++) {
    const ts = Date.UTC(y, 0, 1);
    if (ts >= xMin && ts <= xMax) out.push({ ts, label: String(y) });
  }
  return out;
}

export function renderLineCard(spec) {
  const series = spec.series;
  const xs = [], ys = [];
  for (const s of series) for (const [x, y] of s.pts) { xs.push(x); if (!spec.yLog || y > 0) ys.push(y); }
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = spec.yMin ?? Math.min(...ys), yMax = spec.yMax ?? Math.max(...ys);
  if (yMin === yMax) { yMax = yMin + 1; }
  const X = x => mL + ((x - xMin) / ((xMax - xMin) || 1)) * pW;
  const Y = y => spec.yLog
    ? mT + ((Math.log(yMax) - Math.log(Math.max(y, 1e-9))) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * pH
    : mT + ((yMax - y) / ((yMax - yMin) || 1)) * pH;

  // gridlines + y labels
  let grid = "";
  for (const t of (spec.yTicks || [])) {
    if (t.v < Math.min(yMin, yMax) || t.v > Math.max(yMin, yMax)) continue;
    const yy = Y(t.v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">${esc(t.label)}</text>`;
  }
  for (const t of yearTicks(xMin, xMax)) {
    grid += `<text x="${X(t.ts).toFixed(1)}" y="${H - 50}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${t.label}</text>`;
  }

  let plot = "";
  for (const s of series) {
    const pts = s.pts.filter(([, y]) => !spec.yLog || y > 0).map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
    if (s.fill) {
      const base = Y(spec.fillBase ?? yMin).toFixed(1);
      plot += `<polygon points="${X(s.pts[0][0]).toFixed(1)},${base} ${pts.join(" ")} ${X(s.pts.at(-1)[0]).toFixed(1)},${base}" fill="${s.color}" fill-opacity="${s.fill}"/>`;
    }
    plot += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3}"${s.dash ? ` stroke-dasharray="6 6"` : ""}/>`;
  }
  if (spec.marker) {
    plot += `<circle cx="${X(spec.marker.x).toFixed(1)}" cy="${Y(spec.marker.y).toFixed(1)}" r="7" fill="#fff" stroke="${spec.marker.color || spec.accent}" stroke-width="3"/>`;
  }
  let legend = "";
  (spec.legend || []).forEach((l, i) => {
    const lx = W - mR - 220, ly = mT + 24 + i * 30;
    legend += `<rect x="${lx}" y="${ly - 12}" width="22" height="6" rx="3" fill="${l.color}"/>`;
    legend += `<text x="${lx + 30}" y="${ly - 4}" fill="#cbd5e1" font-size="22" font-family="sans-serif">${esc(l.label)}</text>`;
  });
  return chrome(spec, grid + plot + legend);
}

export function renderBarCard(spec) {
  const bars = spec.bars;
  const vals = bars.map(b => Math.abs(b.value));
  const max = Math.max(...vals, 1);
  // Reserve headroom at the top of the plot for the value label that sits above
  // each bar, so the tallest bar's label can't ride up into the headline.
  const labelPad = 44;
  const usableH = pH - labelPad;
  const h = spec.logBars
    ? v => (Math.log10(Math.abs(v) + 1) / (Math.log10(max + 1) || 1)) * usableH
    : v => (Math.abs(v) / max) * usableH;
  const n = bars.length, gap = pW / n, bw = Math.min(gap * 0.6, 150);
  let svg = "";
  bars.forEach((b, i) => {
    const bh = Math.max(2, h(b.value));
    const cx = mL + gap * i + gap / 2;
    const yTop = mT + pH - bh;
    svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="7" fill="${b.color}" fill-opacity="${b.dim ? 0.4 : 0.9}"${b.outline ? ` stroke="#fff" stroke-width="2"` : ""}/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(yTop - 14).toFixed(1)}" fill="#e2e8f0" font-size="26" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(b.text ?? b.value)}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(mT + pH + 32).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(b.label)}</text>`;
  });
  return chrome(spec, svg);
}

// Render a built post's card to a 1200x630 PNG. Shared by the X bot (post.mjs)
// and the per-tab social image endpoint (api/og.js) so both render identically.
export function renderPostCard(post, stats) {
  const { type, spec } = post.card;
  if (type === "rainbow") return renderRainbowCard(stats);
  if (type === "bar") return renderBarCard({ ...spec, date: stats.date });
  return renderLineCard({ ...spec, date: stats.date });
}
