// Reusable chart cards (1200x630 PNG) for the bot + the per-tab social images —
// rendered as SVG then rasterized with resvg (no browser). Header carries the
// title + a big headline number; the plot below gives the visual punch. Keep
// text emoji-free (resvg has no emoji font).
import { Resvg } from "@resvg/resvg-js";
import { renderRainbowCard } from "./rainbow-card.mjs";

const W = 1200, H = 630, mL = 88, mR = 48, mT = 188, mB = 76;
const pW = W - mL - mR, pH = H - mT - mB;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const png = (svg, w = W) => new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng();

function chromeSvg(spec, inner, extraDefs = "", dims) {
  const DW = dims?.W ?? W, DH = dims?.H ?? H;     // default = landscape card
  const accent = spec.accent || "#4ade80";
  const footer = spec.footer || "spx6900rainbow.xyz · not financial advice";
  return `<svg width="${DW}" height="${DH}" viewBox="0 0 ${DW} ${DH}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="g" cx="50%" cy="0%" r="80%">
    <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/><stop offset="55%" stop-color="${accent}" stop-opacity="0"/>
  </radialGradient>
  ${extraDefs}
</defs>
<rect width="${DW}" height="${DH}" fill="#05050e"/>
<rect width="${DW}" height="${DH}" fill="url(#g)"/>
<text x="64" y="52" fill="#94a3b8" font-size="30" font-weight="700" letter-spacing="3" font-family="sans-serif">SPX6900</text>
<text x="${DW - 64}" y="52" fill="#475569" font-size="24" text-anchor="end" font-family="sans-serif">${esc(spec.date || "")}</text>
<text x="64" y="112" fill="#e2e8f0" font-size="38" font-weight="700" font-family="sans-serif">${esc(spec.title)}</text>
${spec.headline ? `<text x="64" y="166" fill="${accent}" font-size="58" font-weight="800" font-family="sans-serif">${esc(spec.headline)}</text>` : ""}
${inner}
<text x="64" y="${DH - 22}" fill="#475569" font-size="22" font-family="sans-serif">${esc(footer)}</text>
</svg>`;
}
const chrome = (spec, inner, extraDefs = "") => png(chromeSvg(spec, inner, extraDefs));

function yearTicks(xMin, xMax) {
  const out = [];
  for (let y = new Date(xMin).getUTCFullYear(); y <= new Date(xMax).getUTCFullYear(); y++) {
    const ts = Date.UTC(y, 0, 1);
    if (ts >= xMin && ts <= xMax) out.push({ ts, label: String(y) });
  }
  return out;
}

export const renderLineCard = (spec, opts = {}) => png(lineCardSvg(spec, opts), opts.W ?? W);

// Posted-media portrait canvas (4:5) for mobile feeds. OG/link images stay landscape.
export const PORTRAIT = { W: 1080, H: 1350 };
const PORTRAIT_TYPES = new Set(["rainbow", "line", "scale", "model"]);

// Line/area card as an SVG string. opts.reveal (0..1) draws the series in
// progressively for video (marker rides the leading edge); opts.pulse (0..1)
// adds an expanding glow ring on the marker for the hold. Defaults render the
// full static card unchanged.
export function lineCardSvg(spec, opts = {}) {
  const reveal = opts.reveal ?? 1;
  const DW = opts.W ?? W, DH = opts.H ?? H, PW = DW - mL - mR, PH = DH - mT - mB; // canvas (default landscape)
  const series = spec.series;
  const xs = [], ys = [];
  for (const s of series) for (const [x, y] of s.pts) { xs.push(x); if (!spec.yLog || y > 0) ys.push(y); }
  // Reference lines and the cone widen the value range too, so axes fit them.
  for (const h of (spec.hlines || [])) ys.push(h.y);
  if (spec.cone) for (const [, y] of [...spec.cone.lo, ...spec.cone.hi]) if (!spec.yLog || y > 0) ys.push(y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = spec.yMin ?? Math.min(...ys), yMax = spec.yMax ?? Math.max(...ys);
  if (yMin === yMax) { yMax = yMin + 1; }
  const X = x => mL + ((x - xMin) / ((xMax - xMin) || 1)) * PW;
  const Y = y => spec.yLog
    ? mT + ((Math.log(yMax) - Math.log(Math.max(y, 1e-9))) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * PH
    : mT + ((yMax - y) / ((yMax - yMin) || 1)) * PH;
  const path = pts => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  // Reveal as a single left→right sweep by x (timestamp), so earlier series (e.g.
  // actual history) finish before later ones (e.g. the forward projection) start.
  const xCut = reveal >= 1 ? Infinity : xMin + reveal * (xMax - xMin);

  // Soft vertical gradients for area fills + a glow blur for the marker.
  let defs = `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>`;
  series.forEach((s, i) => {
    if (s.fill) defs += `<linearGradient id="fill${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="${Math.min(0.5, s.fill * 2.4)}"/>
      <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
  });

  // gridlines + y labels
  let grid = "";
  for (const t of (spec.yTicks || [])) {
    if (t.v < Math.min(yMin, yMax) || t.v > Math.max(yMin, yMax)) continue;
    const yy = Y(t.v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">${esc(t.label)}</text>`;
  }
  for (const t of yearTicks(xMin, xMax)) {
    grid += `<text x="${X(t.ts).toFixed(1)}" y="${DH - 50}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${t.label}</text>`;
  }

  // bear–bull cone (drawn behind the lines), clipped to the reveal sweep
  let cone = "";
  if (spec.cone) {
    const hi = spec.cone.hi.filter(([x]) => x <= xCut), lo = spec.cone.lo.filter(([x]) => x <= xCut);
    if (hi.length >= 2 && lo.length >= 2) {
      const top = hi.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
      const bot = lo.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).reverse();
      cone = `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${spec.cone.color}" fill-opacity="${spec.cone.opacity ?? 0.15}"/>`;
    }
  }

  let plot = "";
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    let pts = s.pts.filter(([, y]) => !spec.yLog || y > 0);
    if (reveal < 1) pts = pts.filter(([x]) => x <= xCut);
    if (pts.length < 2) continue; // this series hasn't been reached by the sweep yet
    if (s.fill) {
      const base = Y(spec.fillBase ?? yMin).toFixed(1);
      plot += `<polygon points="${X(pts[0][0]).toFixed(1)},${base} ${path(pts)} ${X(pts.at(-1)[0]).toFixed(1)},${base}" fill="url(#fill${i})"/>`;
    }
    plot += `<polyline points="${path(pts)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="7 7"` : ""}/>`;
  }

  // horizontal reference lines (e.g. price targets, milestones, cost basis) with
  // right-aligned labels. Labels are nudged apart so stacked lines never collide.
  let hl = "";
  const hlSorted = (spec.hlines || []).map(h => ({ ...h, py: Y(h.y) })).sort((a, b) => a.py - b.py);
  let lastLabelY = -1e9;
  for (const h of hlSorted) {
    const yy = h.py.toFixed(1);
    hl += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="${h.color}" stroke-opacity="0.8" stroke-width="2"${h.dash === false ? "" : ` stroke-dasharray="6 6"`}/>`;
    let ly = h.py - 9;
    if (ly < lastLabelY + 27) ly = lastLabelY + 27; // keep labels from overlapping
    lastLabelY = ly;
    hl += `<text x="${DW - mR - 6}" y="${ly.toFixed(1)}" fill="${h.color}" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">${esc(h.label)}</text>`;
  }

  let marker = "";
  let mx, my, mc = spec.marker?.color || spec.accent;
  if (reveal < 1) {
    // ride the global leading edge of the sweep — the revealed point with the
    // largest x across all series (e.g. green history first, then orange proj)
    let lead = null;
    for (const s of series) {
      const last = s.pts.filter(([x, y]) => (!spec.yLog || y > 0) && x <= xCut).at(-1);
      if (last && (!lead || last[0] > lead[0])) { lead = last; mc = s.color || mc; }
    }
    if (lead) { mx = X(lead[0]); my = Y(lead[1]); }
  } else if (spec.marker) {
    mx = X(spec.marker.x); my = Y(spec.marker.y);
  }
  if (mx != null) {
    const ring = opts.pulse != null
      ? `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${(11 + opts.pulse * 18).toFixed(1)}" fill="none" stroke="${mc}" stroke-width="2.5" stroke-opacity="${(0.55 * (1 - opts.pulse)).toFixed(2)}"/>`
      : `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="11" fill="${mc}" fill-opacity="0.9" filter="url(#glow)"/>`;
    marker = `${ring}<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7" fill="#fff" stroke="${mc}" stroke-width="3"/>`;
  }

  // legend with a backing chip, parked top-left of the plot (clear of the data)
  let legend = "";
  const items = spec.legend || [];
  if (items.length) {
    const lw = 30 + Math.max(...items.map(l => l.label.length)) * 11.5;
    const lh = items.length * 30 + 16;
    const lx = mL + 16, ly = mT + 14;
    legend += `<rect x="${lx}" y="${ly}" width="${lw.toFixed(0)}" height="${lh}" rx="9" fill="rgba(5,5,14,0.62)" stroke="rgba(255,255,255,0.10)"/>`;
    items.forEach((l, i) => {
      const ey = ly + 24 + i * 30;
      legend += `<rect x="${lx + 14}" y="${ey - 11}" width="24" height="7" rx="3.5" fill="${l.color}"/>`;
      legend += `<text x="${lx + 48}" y="${ey - 3}" fill="#cbd5e1" font-size="22" font-family="sans-serif">${esc(l.label)}</text>`;
    });
  }

  return chromeSvg(spec, grid + cone + plot + hl + marker + legend, defs, { W: DW, H: DH });
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
  let defs = "";
  bars.forEach((b, i) => {
    defs += `<linearGradient id="bar${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${b.color}" stop-opacity="${b.dim ? 0.5 : 1}"/>
      <stop offset="100%" stop-color="${b.color}" stop-opacity="${b.dim ? 0.25 : 0.55}"/></linearGradient>`;
  });
  let svg = "";
  bars.forEach((b, i) => {
    const bh = Math.max(2, h(b.value));
    const cx = mL + gap * i + gap / 2;
    const yTop = mT + pH - bh;
    svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="9" fill="url(#bar${i})"${b.outline ? ` stroke="#fff" stroke-width="2"` : ""}/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(yTop - 14).toFixed(1)}" fill="#e2e8f0" font-size="26" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(b.text ?? b.value)}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(mT + pH + 32).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(b.label)}</text>`;
  });
  return chrome(spec, svg, defs);
}

// Donut for composition (e.g. supply by holder tier). segments: [{label,value,color}].
export function renderDonut(spec) {
  const segs = spec.segments.filter(s => s.value > 0);
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const cx = mL + 150, cy = mT + pH / 2, r = 132, sw = 58;
  const C = 2 * Math.PI * r;
  let ring = "", acc = 0;
  for (const s of segs) {
    const frac = s.value / total, len = frac * C;
    ring += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-opacity="0.92"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    acc += len;
  }
  const c = spec.center || {};
  let center = "";
  if (c.big) center += `<text x="${cx}" y="${cy + 4}" fill="#f8fafc" font-size="62" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(c.big)}</text>`;
  if (c.small) center += `<text x="${cx}" y="${cy + 40}" fill="#94a3b8" font-size="24" text-anchor="middle" font-family="sans-serif">${esc(c.small)}</text>`;

  // legend on the right, value as % of total
  const lx = cx + r + 70;
  let legend = "";
  segs.forEach((s, i) => {
    const ly = mT + 34 + i * 64;
    const pct = Math.round((s.value / total) * 100);
    legend += `<rect x="${lx}" y="${ly - 22}" width="30" height="30" rx="7" fill="${s.color}"/>`;
    legend += `<text x="${lx + 44}" y="${ly}" fill="#e2e8f0" font-size="28" font-weight="700" font-family="sans-serif">${esc(s.label)}</text>`;
    legend += `<text x="${lx + 44}" y="${ly + 28}" fill="#94a3b8" font-size="23" font-family="sans-serif">${pct}% of supply</text>`;
  });
  return chrome(spec, ring + center + legend);
}

// Single horizontal 100%-stacked bar for proportions (e.g. locked vs free float).
export function renderStackBar(spec) {
  const segs = spec.segments.filter(s => s.value > 0);
  const total = spec.total || segs.reduce((a, s) => a + s.value, 0) || 1;
  const barY = mT + pH / 2 - 46, barH = 96;
  let defs = "", body = "", x = mL;
  segs.forEach((s, i) => {
    defs += `<linearGradient id="seg${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="1"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0.6"/></linearGradient>`;
    const w = (s.value / total) * pW;
    const pct = Math.round((s.value / total) * 100);
    body += `<rect x="${(x + 2).toFixed(1)}" y="${barY}" width="${Math.max(0, w - 4).toFixed(1)}" height="${barH}" rx="8" fill="url(#seg${i})"/>`;
    if (w > 120) body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY + barH / 2 + 10}" fill="#05050e" font-size="30" font-weight="800" text-anchor="middle" font-family="sans-serif">${pct}%</text>`;
    body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY - 18}" fill="#e2e8f0" font-size="26" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(s.text ?? "")}</text>`;
    body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY + barH + 38}" fill="#94a3b8" font-size="23" text-anchor="middle" font-family="sans-serif">${esc(s.label)}</text>`;
    x += w;
  });
  return chrome(spec, body, defs);
}

// Render a built post's card to a PNG. Shared by the X bot (post.mjs) and the
// per-tab social image endpoint (api/og.js). opts.portrait renders the supported
// cards at 4:5 for the bot's posted media; the OG endpoint omits it (landscape).
export function renderPostCard(post, stats, opts = {}) {
  const { type, spec } = post.card;
  const dims = opts.portrait && PORTRAIT_TYPES.has(type) ? PORTRAIT : {};
  if (type === "rainbow") return renderRainbowCard(stats, dims);
  if (type === "bar") return renderBarCard({ ...spec, date: stats.date });
  if (type === "donut") return renderDonut({ ...spec, date: stats.date });
  if (type === "stack") return renderStackBar({ ...spec, date: stats.date });
  if (type === "model") return renderModelCard({ ...spec, date: stats.date }, dims);
  if (type === "cube") return renderCubeCard({ ...spec, date: stats.date });
  if (type === "scale") return renderScaleCard({ ...spec, date: stats.date }, dims);
  return renderLineCard({ ...spec, date: stats.date }, dims);
}

// Model-fit explainer: each day's residual (distance from the power-law trend)
// scattered over time, with the rainbow bands flattened into residual space —
// literally how the bands are derived. points: [[ts, residual]], bands: offsets,
// bandColors: the 9 colors between them.
export function renderModelCard(spec, opts = {}) {
  const DW = opts.W ?? W, DH = opts.H ?? H, PW = DW - mL - mR, PH = DH - mT - mB; // canvas (default landscape)
  const pts = spec.points, bands = spec.bands, colors = spec.bandColors;
  const xs = pts.map(p => p[0]), rs = pts.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(bands[0], ...rs), yMax = Math.max(bands[bands.length - 1], ...rs);
  const pad = (yMax - yMin) * 0.04; yMin -= pad; yMax += pad;
  const X = x => mL + ((x - xMin) / ((xMax - xMin) || 1)) * PW;
  const Y = y => mT + ((yMax - y) / ((yMax - yMin) || 1)) * PH;
  const pct = r => `${r >= 0 ? "+" : ""}${Math.round((Math.exp(r) - 1) * 100)}%`;

  // rainbow bands, flattened: a colored zone between each pair of offsets
  let zones = "";
  for (let i = 0; i < colors.length; i++) {
    const yTop = Y(bands[i + 1]), h = Y(bands[i]) - yTop;
    zones += `<rect x="${mL}" y="${yTop.toFixed(1)}" width="${PW}" height="${h.toFixed(1)}" fill="${colors[i]}" fill-opacity="0.20"/>`;
  }
  // % gridlines at a few band edges + year ticks
  let grid = "";
  for (const i of [0, 2, 4, 6, 8]) {
    const v = bands[i]; if (v < yMin || v > yMax) continue;
    const yy = Y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#94a3b8" font-size="20" text-anchor="end" font-family="sans-serif">${pct(v)}</text>`;
  }
  for (const t of yearTicks(xMin, xMax)) grid += `<text x="${X(t.ts).toFixed(1)}" y="${DH - 50}" fill="#64748b" font-size="20" text-anchor="middle" font-family="sans-serif">${t.label}</text>`;

  const zy = Y(0).toFixed(1);
  const zero = `<line x1="${mL}" y1="${zy}" x2="${DW - mR}" y2="${zy}" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-dasharray="6 5"/><text x="${mL + 8}" y="${(+zy - 9).toFixed(1)}" fill="#f1f5f9" font-size="20" font-weight="700" font-family="sans-serif">trend line</text>`;

  let dots = "";
  for (const [x, r] of pts) dots += `<circle cx="${X(x).toFixed(1)}" cy="${Y(r).toFixed(1)}" r="2.6" fill="#f8fafc" fill-opacity="0.78"/>`;
  const last = pts[pts.length - 1], mc = spec.markerColor || "#f8fafc";
  const mk = `<circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="10" fill="${mc}" filter="url(#glow)"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="6.5" fill="#fff" stroke="${mc}" stroke-width="3"/>`;
  const defs = `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>`;

  return png(chromeSvg(spec, zones + grid + zero + dots + mk, defs, { W: DW, H: DH }), DW);
}

// Money-scale "cube" card (Visual Capitalist style): each milestone is a pile of
// little isometric cubes — one cube = 1× today's market cap — so the pile size
// shows how far the next ATH is. items: [{label, sub, count, color, highlight}].
// opts.spin (0..1) rotates the per-cube shading highlight for the video.
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

const fMultLbl = x => (x >= 100 ? Math.round(x).toLocaleString() : String(Math.round(x))) + "×";

export function cubeCardSvg(spec, opts = {}) {
  const items = spec.items;
  const spin = opts.spin ?? null;
  const reveal = opts.reveal ?? 1;     // <1: cubes stack up and the ×label rolls
  const n = items.length;
  const baseY = mT + pH - 92;          // piles sit on this baseline; labels go below
  const availH = baseY - mT - 12;      // vertical room for the tallest pile
  const slot = pW / n;
  const colsOf = c => Math.max(1, Math.round(Math.sqrt(c) * 0.92)); // taller piles → bigger cubes

  // One cube cell size for all piles: the tallest must fit availH, widest the slot.
  let cell = 34;
  for (const it of items) {
    const cols = colsOf(it.count), rows = Math.ceil(it.count / cols);
    cell = Math.min(cell, availH / (rows + 0.3), (slot * 0.86) / (cols + 0.3));
  }
  cell = Math.max(4, cell);
  const a = cell * 0.48;               // iso half-edge; a cube spans 2a × 2a

  // Slightly animate the light direction so faces "breathe"/spin for video.
  const wob = spin == null ? 0 : Math.sin(spin * Math.PI * 2);
  const topF = 1.35 + wob * 0.14, leftF = 0.72 - wob * 0.14, rightF = 0.46 + wob * 0.12;

  const cube = (cx, cyTop, col) => {
    const top = `${cx},${cyTop} ${cx + a},${cyTop + a / 2} ${cx},${cyTop + a} ${cx - a},${cyTop + a / 2}`;
    const left = `${cx - a},${cyTop + a / 2} ${cx},${cyTop + a} ${cx},${cyTop + 2 * a} ${cx - a},${cyTop + a / 2 + a}`;
    const right = `${cx},${cyTop + a} ${cx + a},${cyTop + a / 2} ${cx + a},${cyTop + a / 2 + a} ${cx},${cyTop + 2 * a}`;
    return `<polygon points="${top}" fill="${shade(col, topF)}"/>`
      + `<polygon points="${left}" fill="${shade(col, leftF)}"/>`
      + `<polygon points="${right}" fill="${shade(col, rightF)}"/>`;
  };

  let body = "";
  items.forEach((it, i) => {
    const cx0 = mL + slot * i + slot / 2;
    const cols = colsOf(it.count), rows = Math.ceil(it.count / cols);
    const pileW = cols * cell;
    const startX = cx0 - pileW / 2;
    // soft grounding shadow
    body += `<ellipse cx="${cx0.toFixed(1)}" cy="${(baseY + 6).toFixed(1)}" rx="${(pileW / 2 + 6).toFixed(1)}" ry="9" fill="rgba(0,0,0,0.45)"/>`;
    // cubes, filled bottom row first, left→right; reveal grows the pile + count
    const shown = Math.min(it.count, Math.ceil(it.count * reveal));
    for (let k = 0; k < shown; k++) {
      const r = Math.floor(k / cols), c = k % cols;
      const cx = startX + c * cell + cell / 2;
      const cyTop = baseY - (r + 1) * cell;
      body += cube(cx, cyTop, it.color);
    }
    if (it.highlight) {
      // ring the single reference cube so "you are here" pops
      const cx = startX + cell / 2, cyTop = baseY - cell;
      body += `<circle cx="${cx.toFixed(1)}" cy="${(cyTop + a).toFixed(1)}" r="${(a * 2.1).toFixed(1)}" fill="none" stroke="${it.color}" stroke-width="2.5" opacity="0.9"/>`;
    }
    // labels under the baseline (the × number rolls up with the reveal)
    const ly = baseY + 38;
    body += `<text x="${cx0.toFixed(1)}" y="${ly}" fill="#f8fafc" font-size="30" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(fMultLbl(shown))}</text>`;
    body += `<text x="${cx0.toFixed(1)}" y="${ly + 28}" fill="${it.color}" font-size="22" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(it.label)}</text>`;
    if (it.sub) body += `<text x="${cx0.toFixed(1)}" y="${ly + 52}" fill="#94a3b8" font-size="19" text-anchor="middle" font-family="sans-serif">${esc(it.sub)}</text>`;
  });

  if (spec.note) body += `<text x="${(W / 2).toFixed(1)}" y="${mT + 30}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="sans-serif">${esc(spec.note)}</text>`;

  return chromeSvg(spec, body);
}

export const renderCubeCard = spec => png(cubeCardSvg(spec));

// Scale card: SPX6900 = one glowing origin cube vs a vast field (e.g. the S&P
// 500). The field is a big cube grid (illustrative — the exact ratio is in the
// headline number, which rolls up as you zoom out). opts.reveal (0..1) zooms the
// camera from the origin cube out to the full field and rolls the ×label.
export function scaleCardSvg(spec, opts = {}) {
  const reveal = opts.reveal ?? 1;
  const pulse = opts.pulse ?? null;
  const col = spec.fieldColor || "#3b82f6";
  const oc = spec.originColor || "#facc15";
  const mult = spec.mult;                       // true multiple (e.g. ~160000)
  const DW = opts.W ?? W, DH = opts.H ?? H;      // canvas (default landscape)

  // Field grid fills the plot. Cube count is illustrative, not literal.
  const x0 = mL, y0 = mT + 8, fw = DW - mL - mR, fh = DH - mB - y0 - 8;
  const cell = 11, a = cell * 0.46;
  const cols = Math.floor(fw / cell), rows = Math.floor(fh / cell);

  const cube = (cx, cyTop, c, f = 1) => {
    const top = `${cx},${cyTop} ${cx + a},${cyTop + a / 2} ${cx},${cyTop + a} ${cx - a},${cyTop + a / 2}`;
    const left = `${cx - a},${cyTop + a / 2} ${cx},${cyTop + a} ${cx},${cyTop + 2 * a} ${cx - a},${cyTop + a / 2 + a}`;
    const right = `${cx},${cyTop + a} ${cx + a},${cyTop + a / 2} ${cx + a},${cyTop + a / 2 + a} ${cx},${cyTop + 2 * a}`;
    return `<polygon points="${top}" fill="${shade(c, 1.3 * f)}"/><polygon points="${left}" fill="${shade(c, 0.72 * f)}"/><polygon points="${right}" fill="${shade(c, 0.48 * f)}"/>`;
  };

  // Origin cube sits bottom-left of the field.
  const oCx = x0 + cell / 2, oCyTop = y0 + (rows - 1) * cell;
  const fx = oCx, fy = oCyTop + a;                // focus point (origin centre)

  // Camera: scale around the origin and glide the focus from screen-centre (zoomed
  // in, reveal 0) to its natural spot (full field, reveal 1).
  const zMax = 11;
  const z = zMax - (zMax - 1) * reveal;
  const midY = (mT + (DH - mB)) / 2;
  const sx = (DW / 2) + (fx - DW / 2) * reveal, sy = midY + (fy - midY) * reveal;
  const cam = `translate(${sx.toFixed(2)},${sy.toFixed(2)}) scale(${z.toFixed(3)}) translate(${(-fx).toFixed(2)},${(-fy).toFixed(2)})`;

  let field = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const isO = r === rows - 1 && c === 0;
    field += cube(x0 + c * cell + cell / 2, y0 + r * cell, isO ? oc : col, isO ? 1.0 : 0.92);
  }
  // glow ring on the origin so it's findable even when tiny
  const ringR = (pulse == null ? 1 : 1 + pulse * 0.8) * a * 3.4;
  field += `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="${ringR.toFixed(1)}" fill="none" stroke="${oc}" stroke-width="${(2.4 / z).toFixed(2)}" opacity="${pulse == null ? 0.95 : (0.8 * (1 - pulse) + 0.2).toFixed(2)}"/>`;

  const shown = Math.max(1, Math.round(Math.exp(Math.log(mult) * reveal))); // 1 → mult, log-paced
  const fM = x => x >= 1000 ? Math.round(x).toLocaleString() : String(Math.round(x));

  // Title + rolling number drawn ON TOP of the field (with a backing chip) so they
  // stay legible while the camera is zoomed in over the cubes.
  const overlay =
    `<rect x="48" y="74" width="560" height="116" rx="14" fill="rgba(5,5,14,0.62)" stroke="rgba(255,255,255,0.08)"/>`
    + `<text x="68" y="116" fill="#e2e8f0" font-size="34" font-weight="700" font-family="sans-serif">${esc(spec.title || "")}</text>`
    + `<text x="68" y="172" fill="${spec.accent || oc}" font-size="56" font-weight="800" font-family="sans-serif">${esc(fM(shown))}×</text>`;

  const inner =
    `<g transform="${cam}">${field}</g>`
    + overlay
    + `<text x="64" y="${DH - 50}" fill="${oc}" font-size="24" font-weight="800" font-family="sans-serif">${esc(spec.originLabel || "SPX6900")} = 1 cube</text>`
    + `<text x="${DW - 64}" y="${DH - 50}" fill="#cbd5e1" font-size="24" font-weight="700" text-anchor="end" font-family="sans-serif">${esc(spec.fieldLabel || "")}${spec.fieldSub ? `  ·  ${esc(spec.fieldSub)}` : ""}</text>`;

  // Title/headline are drawn in the overlay (layered over the field), so suppress
  // the chrome's own title/headline.
  return chromeSvg({ ...spec, title: "", headline: "" }, inner, "", { W: DW, H: DH });
}

export const renderScaleCard = (spec, opts = {}) => png(scaleCardSvg(spec, opts), opts.W ?? W);
