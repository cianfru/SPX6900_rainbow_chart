// Reusable chart cards (1200x630 PNG) for the bot + the per-tab social images —
// rendered as SVG then rasterized with resvg (no browser). Header carries the
// title + a big headline number; the plot below gives the visual punch. Keep
// text emoji-free (resvg has no emoji font).
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { renderRainbowCard } from "./rainbow-card.mjs";

const W = 1200, H = 800, mL = 88, mR = 48, mT = 188, mB = 76; // landscape card is 3:2
const pW = W - mL - mR, pH = H - mT - mB;
// Per-card canvas geometry. Defaults to the 3:2 landscape; callers (e.g. the OG
// link-unfurl endpoint) can pass {W,H} to render the same card at another size.
const geom = (o = {}) => { const DW = o.W ?? W, DH = o.H ?? H; return { DW, DH, PW: DW - mL - mR, PH: DH - mT - mB }; };
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
const chrome = (spec, inner, extraDefs = "", dims) => png(chromeSvg(spec, inner, extraDefs, dims), dims?.W ?? W);

function yearTicks(xMin, xMax) {
  const out = [];
  for (let y = new Date(xMin).getUTCFullYear(); y <= new Date(xMax).getUTCFullYear(); y++) {
    const ts = Date.UTC(y, 0, 1);
    if (ts >= xMin && ts <= xMax) out.push({ ts, label: String(y) });
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Time axis that adapts to the span: years for long ranges, month starts for
// mid ranges, and a few evenly-spaced day labels for short ones (so a recent
// rally still gets x-axis context instead of a bare baseline).
function timeTicks(xMin, xMax) {
  const days = (xMax - xMin) / 86400000;
  if (days > 540) return yearTicks(xMin, xMax);          // long span → years (as before)
  const out = [];
  if (days > 45) {                                        // medium → quarters or months
    const everyQuarter = days > 150;
    let d = new Date(xMin);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0), 1));
    for (; d.getTime() <= xMax; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const m = d.getUTCMonth();
      if (everyQuarter && m % 3 !== 0) continue;
      out.push({ ts: d.getTime(), label: m === 0 ? String(d.getUTCFullYear()) : MONTHS[m] });
    }
    return out;
  }
  const n = Math.min(4, Math.max(2, Math.round(days / 4)));  // short → a few day labels
  for (let i = 0; i <= n; i++) {
    const ts = xMin + (xMax - xMin) * (i / n);
    const dt = new Date(ts);
    out.push({ ts, label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`, anchor: i === 0 ? "start" : i === n ? "end" : "middle" });
  }
  return out;
}

// Gridline levels when a card doesn't supply usable ones (e.g. a sub-decade price
// range where decade ticks come up empty). Powers of ten for wide log ranges,
// else ~5 "nice" round levels spread across the range.
function niceTicks(min, max, yLog) {
  if (!(max > min)) return [];
  if (yLog && Math.log10(max) - Math.log10(min) >= 1.2) {
    const t = [];
    for (let e = -8; e <= 9; e++) { const v = 10 ** e; if (v >= min * 0.9 && v <= max * 1.1) t.push({ v, label: v >= 1 ? "$" + v.toLocaleString() : "$" + v }); }
    if (t.length >= 2) return t;
  }
  const raw = (max - min) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const dec = Math.max(0, -Math.floor(Math.log10(step)));
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    const val = +v.toFixed(dec + 2);
    out.push({ v: val, label: val >= 1 ? "$" + val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "$" + val.toFixed(dec) });
  }
  return out;
}

export const renderLineCard = (spec, opts = {}) => png(lineCardSvg(spec, opts), opts.W ?? W);

// Portrait/video format decisions live in card-format.mjs (dependency-free so the
// schedule endpoint can share them). Re-exported here for existing importers.
import { PORTRAIT, isPortraitCard, isVideoCard } from "./card-format.mjs";
export { PORTRAIT, isPortraitCard, isVideoCard };

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
  // opts.revealFromX starts the sweep partway in (e.g. at "now"), so the history
  // is fully drawn on frame 0 and only the projection animates — no blank opener.
  const rFrom = opts.revealFromX ?? xMin;
  const xCut = reveal >= 1 ? Infinity : rFrom + reveal * (xMax - rFrom);

  // Soft vertical gradients for area fills + a glow blur for the marker.
  let defs = `<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>`;
  series.forEach((s, i) => {
    if (s.fill) defs += `<linearGradient id="fill${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="${Math.min(0.5, s.fill * 2.4)}"/>
      <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
  });

  // gridlines + y labels. Fall back to auto levels when the card didn't supply
  // usable ticks (e.g. decade ticks came up empty for a sub-decade range).
  let grid = "";
  const yTicks = (spec.yTicks && spec.yTicks.length >= 2) ? spec.yTicks : niceTicks(yMin, yMax, spec.yLog);
  for (const t of yTicks) {
    if (t.v < Math.min(yMin, yMax) || t.v > Math.max(yMin, yMax)) continue;
    const yy = Y(t.v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">${esc(t.label)}</text>`;
  }
  // x-axis ticks: calendar (timeTicks) by default, or caller-supplied {x,label}
  // for non-time axes like "age since launch" (the SPX-vs-BTC overlay).
  const xticks = spec.xTicks
    ? spec.xTicks.map(t => ({ x: t.x, label: t.label, anchor: t.anchor }))
    : timeTicks(xMin, xMax).map(t => ({ x: t.ts, label: t.label, anchor: t.anchor }));
  for (const t of xticks) {
    grid += `<text x="${X(t.x).toFixed(1)}" y="${DH - 50}" fill="#64748b" font-size="20" text-anchor="${t.anchor || "middle"}" font-family="sans-serif">${esc(t.label)}</text>`;
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

  // Extra fixed markers (e.g. where a projection crosses each milestone line).
  // Drawn only on the finished card, not during a video reveal sweep.
  if (spec.markers && reveal >= 1) {
    for (const m of spec.markers) {
      const px = X(m.x).toFixed(1), py = Y(m.y).toFixed(1);
      marker += `<circle cx="${px}" cy="${py}" r="9" fill="${m.color}" fill-opacity="0.9" filter="url(#glow)"/>`
        + `<circle cx="${px}" cy="${py}" r="6" fill="#fff" stroke="${m.color}" stroke-width="2.5"/>`;
    }
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

export function renderBarCard(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const bars = spec.bars;
  const vals = bars.map(b => Math.abs(b.value));
  const max = Math.max(...vals, 1);
  // Reserve headroom at the top of the plot for the value label that sits above
  // each bar, so the tallest bar's label can't ride up into the headline.
  const labelPad = 44;
  const usableH = PH - labelPad;
  const h = spec.logBars
    ? v => (Math.log10(Math.abs(v) + 1) / (Math.log10(max + 1) || 1)) * usableH
    : v => (Math.abs(v) / max) * usableH;
  const n = bars.length, gap = PW / n, bw = Math.min(gap * 0.6, 150);
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
    const yTop = mT + PH - bh;
    svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="9" fill="url(#bar${i})"${b.outline ? ` stroke="#fff" stroke-width="2"` : ""}/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(yTop - 14).toFixed(1)}" fill="#e2e8f0" font-size="26" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(b.text ?? b.value)}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${(mT + PH + 32).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(b.label)}</text>`;
  });
  return chrome(spec, svg, defs, { W: DW, H: DH });
}

// Monthly-returns column chart: each month is a bar growing from a floating 0%
// axis — green up for gains, red down for losses. The zero line floats so the
// biggest gain AND the worst loss both reach the frame; with SPX6900's fat green
// tail the axis sits low and the green months tower over the red. A different cut
// of the same month-over-month data as the seasonality heatmap.
export function renderMonthBars(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const bars = spec.bars;
  const vals = bars.map(b => b.value);
  const posMax = Math.max(1e-6, ...vals.filter(v => v > 0));
  const negMax = Math.max(1e-6, ...vals.filter(v => v < 0).map(v => -v));
  const span = posMax + negMax;
  const padT = 0.13, padB = 0.10;                  // headroom for the top label / x-axis ticks
  const usable = PH * (1 - padT - padB);
  const zeroY = mT + PH * padT + (posMax / span) * usable; // 0% axis floats by the up/down ratio
  const k = usable / span;                          // px per unit of return
  const n = bars.length, slot = PW / n, bw = Math.min(slot * 0.72, 26);

  const defs = `
    <linearGradient id="mbUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c55e" stop-opacity="1"/><stop offset="100%" stop-color="#22c55e" stop-opacity="0.5"/></linearGradient>
    <linearGradient id="mbDn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.75"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0.95"/></linearGradient>`;

  // Faint % gridlines above zero — monthly returns can be huge, so a few "nice"
  // steps give the eye a scale without crowding.
  const niceStep = m => { const raw = m / 4, mag = 10 ** Math.floor(Math.log10(raw)), nn = raw / mag; return (nn < 1.5 ? 1 : nn < 3 ? 2 : nn < 7 ? 5 : 10) * mag; };
  const step = niceStep(posMax);
  let grid = "";
  for (let v = step; v <= posMax + 1e-9; v += step) {
    const yy = (zeroY - v * k).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">+${Math.round(v * 100)}%</text>`;
  }

  let body = "";
  bars.forEach((b, i) => {
    const cx = mL + slot * i + slot / 2;
    const up = b.value >= 0;
    const bh = Math.max(1, Math.abs(b.value) * k);
    const y = up ? zeroY - bh : zeroY;
    body += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="url(#${up ? "mbUp" : "mbDn"})"/>`;
  });

  // Call out the standout months (biggest gain above its bar, worst loss below).
  const best = bars.reduce((a, b) => b.value > a.value ? b : a, bars[0]);
  const worst = bars.reduce((a, b) => b.value < a.value ? b : a, bars[0]);
  const tag = (b, above) => {
    const cx = mL + slot * bars.indexOf(b) + slot / 2, bh = Math.abs(b.value) * k;
    const y = above ? zeroY - bh - 12 : zeroY + bh + 26;
    return `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" fill="${above ? "#86efac" : "#fca5a5"}" font-size="22" font-weight="700" text-anchor="middle" font-family="sans-serif">${b.value >= 0 ? "+" : ""}${Math.round(b.value * 100)}%</text>`;
  };
  let labels = tag(best, true);
  if (worst.value < 0) labels += tag(worst, false);

  // The 0% axis, drawn brighter than the gridlines and labeled at the left.
  const axis = `<line x1="${mL}" y1="${zeroY.toFixed(1)}" x2="${DW - mR}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>`
    + `<text x="${mL - 12}" y="${(zeroY + 6).toFixed(1)}" fill="#cbd5e1" font-size="20" text-anchor="end" font-family="sans-serif">0%</text>`;

  // Year labels under the first bar of each calendar year.
  let years = "", seen = -1;
  bars.forEach((b, i) => {
    if (b.year === seen) return;
    seen = b.year;
    years += `<text x="${(mL + slot * i + slot / 2).toFixed(1)}" y="${(mT + PH + 30).toFixed(1)}" fill="#64748b" font-size="22" text-anchor="middle" font-family="sans-serif">${b.year}</text>`;
  });

  return chrome(spec, grid + axis + body + labels + years, defs, { W: DW, H: DH });
}

// Seasonality heatmap card — the website's Monthly grid, condensed. rows:
// [{label, cells:[12 returns|null], year}]. Green up / red down, opacity scaled
// by size; a right-hand "Year" column compounds each row. Mirrors SeasonalityGrid.
const HM_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hmFmt = r => {
  if (r == null || !isFinite(r)) return "";
  const p = r * 100;
  if (Math.abs(p) >= 1000) { const k = p / 1000; return (p >= 0 ? "+" : "") + (Math.abs(k) >= 10 ? k.toFixed(0) : k.toFixed(1)) + "k%"; }
  return (p >= 0 ? "+" : "") + Math.round(p) + "%";
};
const hmCell = r => {
  if (r == null || !isFinite(r)) return { fill: "#11151f", op: 1 };
  const mag = Math.min(1, Math.log1p(Math.abs(r)) / Math.log(3.2));
  return { fill: r >= 0 ? "#22c55e" : "#ef4444", op: 0.12 + mag * 0.62 };
};
export function renderHeatmap(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const rows = spec.rows, hasYear = spec.yearCol !== false;
  const dataCols = 12 + (hasYear ? 1 : 0);
  const labW = 58, gap = 6;
  const cw = (PW - labW - gap * dataCols) / dataCols;
  const nR = rows.length + 1;                       // header row + one per year
  const ch = (PH - gap * (nR - 1)) / nR;
  const x0 = mL + labW;
  const colX = j => x0 + j * (cw + gap);
  const rowY = i => mT + i * (ch + gap);
  const cFs = Math.min(20, Math.round(cw * 0.27));
  const labFs = Math.min(20, Math.round(ch * 0.34));
  let svg = "";
  const mid = (cx, cy, t, fill, fs, w = 600) =>
    `<text x="${cx.toFixed(1)}" y="${(cy + fs * 0.35).toFixed(1)}" fill="${fill}" font-size="${fs}" font-weight="${w}" text-anchor="middle" font-family="sans-serif">${esc(t)}</text>`;

  // header: month labels + Year
  HM_MONTHS.forEach((m, j) => { svg += mid(colX(j) + cw / 2, rowY(0) + ch / 2, m, "#94a3b8", Math.min(20, cFs + 2), 700); });
  if (hasYear) svg += mid(colX(12) + cw / 2, rowY(0) + ch / 2, "Year", "#cbd5e1", Math.min(20, cFs + 2), 700);

  rows.forEach((row, ri) => {
    const i = ri + 1;
    svg += mid(mL + labW / 2, rowY(i) + ch / 2, row.label, "#cbd5e1", labFs, 700);
    const draw = (j, r, bold) => {
      const { fill, op } = hmCell(r);
      svg += `<rect x="${colX(j).toFixed(1)}" y="${rowY(i).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="7" fill="${fill}" fill-opacity="${op.toFixed(3)}" stroke="rgba(255,255,255,0.05)"/>`;
      const t = hmFmt(r);
      if (t) svg += mid(colX(j) + cw / 2, rowY(i) + ch / 2, t, "#f1f5f9", cFs, bold ? 700 : 600);
    };
    row.cells.forEach((r, j) => draw(j, r));
    if (hasYear) draw(12, row.year, true);
  });

  svg += `<text x="64" y="${(DH - 48).toFixed(1)}" fill="#64748b" font-size="20" font-family="sans-serif">Each cell = that month's return · green up, red down</text>`;
  return chrome(spec, svg, "", { W: DW, H: DH });
}

// Dollar-cost-averaging card. Two series over time (log $): `invested` (the flat
// staircase of contributions) and `value` (the stack's worth). The band BETWEEN
// them is filled green — that gap IS the profit — over a muted amber "what you
// put in" base. Built for the "$100/mo since launch" story.
export function renderDca(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const inv = spec.invested, val = spec.value;            // [[ts, $], …]
  const xs = val.map(p => p[0]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const ys = [...val, ...inv].map(p => p[1]).filter(y => y > 0);
  // Linear axis (spec.linear) reads dollars the way people actually feel them —
  // a flat run, then the payoff exploding at the end (the classic DCA hockey
  // stick). Log is the default and keeps the early-years texture visible.
  const linear = !!spec.linear;
  const yMin = linear ? 0 : Math.max(50, Math.min(...ys) * 0.85);
  const yMax = Math.max(...ys) * (linear ? 1.08 : 1.18);
  const X = x => mL + ((x - xMin) / ((xMax - xMin) || 1)) * PW;
  const Y = linear
    ? y => mT + (1 - (Math.max(y, 0) - yMin) / ((yMax - yMin) || 1)) * PH
    : y => mT + ((Math.log(yMax) - Math.log(Math.max(y, 1e-9))) / ((Math.log(yMax) - Math.log(yMin)) || 1)) * PH;
  const pl = pts => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const baseY = (mT + PH).toFixed(1);
  const green = "#34d399", amber = "#fbbf24";

  const defs = `
    <linearGradient id="dcaProfit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${green}" stop-opacity="0.55"/><stop offset="100%" stop-color="${green}" stop-opacity="0.10"/></linearGradient>
    <linearGradient id="dcaInv" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${amber}" stop-opacity="0.34"/><stop offset="100%" stop-color="${amber}" stop-opacity="0.04"/></linearGradient>
    <filter id="dcaGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="dcaSpark" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="3"/></filter>`;

  // gridlines: powers of ten on log, ~5 nice round steps on linear
  const fK = v => v >= 1e6 ? "$" + (v / 1e6) + "M" : v >= 1e3 ? "$" + (v / 1e3).toLocaleString() + "K" : "$" + Math.round(v);
  let gridVals = [];
  if (linear) {
    const raw = yMax / 4, mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)) || mag;
    for (let v = step; v <= yMax; v += step) gridVals.push(v);
  } else {
    for (let e = 1; e <= 8; e++) { const v = 10 ** e; if (v >= yMin && v <= yMax) gridVals.push(v); }
  }
  let grid = "";
  for (const v of gridVals) {
    const yy = Y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${DW - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
    grid += `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="20" text-anchor="end" font-family="sans-serif">${fK(v)}</text>`;
  }
  for (const t of timeTicks(xMin, xMax)) {
    grid += `<text x="${X(t.ts).toFixed(1)}" y="${DH - 50}" fill="#64748b" font-size="20" text-anchor="${t.anchor || "middle"}" font-family="sans-serif">${esc(t.label)}</text>`;
  }

  // invested area (amber, to baseline) — the "what you put in" floor
  const invArea = `<polygon points="${X(xMin).toFixed(1)},${baseY} ${pl(inv)} ${X(xMax).toFixed(1)},${baseY}" fill="url(#dcaInv)"/>`;
  // profit band: value on top (l→r) → invested on bottom (r→l)
  const profit = `<polygon points="${pl(val)} ${[...inv].reverse().map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}" fill="url(#dcaProfit)"/>`;
  const invLine = `<polyline points="${pl(inv)}" fill="none" stroke="${amber}" stroke-width="2.5" stroke-dasharray="7 6" stroke-linejoin="round"/>`;
  const valLine = `<polyline points="${pl(val)}" fill="none" stroke="${green}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  // a sparkle on the value line for every monthly buy: a soft green glow with a
  // bright core. The latest buy is left for the big end marker below.
  const buys = (spec.buys || []).slice(0, -1);
  const sparks = buys.map(([x, y]) => {
    const cx = X(x).toFixed(1), cy = Y(y).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="6" fill="${green}" fill-opacity="0.7" filter="url(#dcaSpark)"/>`
      + `<circle cx="${cx}" cy="${cy}" r="2.6" fill="#eafff5"/>`;
  }).join("");
  const ex = X(val.at(-1)[0]).toFixed(1), ey = Y(val.at(-1)[1]).toFixed(1);
  const marker = `<circle cx="${ex}" cy="${ey}" r="11" fill="${green}" fill-opacity="0.9" filter="url(#dcaGlow)"/><circle cx="${ex}" cy="${ey}" r="7" fill="#fff" stroke="${green}" stroke-width="3"/>`;

  // legend chip top-left of plot
  const lx = mL + 16, ly = mT + 14;
  const legend = `<rect x="${lx}" y="${ly}" width="208" height="76" rx="9" fill="rgba(5,5,14,0.62)" stroke="rgba(255,255,255,0.10)"/>`
    + `<rect x="${lx + 14}" y="${ly + 18}" width="24" height="8" rx="4" fill="${green}"/><text x="${lx + 48}" y="${ly + 27}" fill="#cbd5e1" font-size="22" font-family="sans-serif">Stack value</text>`
    + `<rect x="${lx + 14}" y="${ly + 48}" width="24" height="8" rx="4" fill="${amber}"/><text x="${lx + 48}" y="${ly + 57}" fill="#cbd5e1" font-size="22" font-family="sans-serif">Invested</text>`;

  return chrome(spec, grid + invArea + profit + invLine + valLine + sparks + marker + legend, defs, { W: DW, H: DH });
}

// Donut for composition (e.g. supply by holder tier). segments: [{label,value,color}].
export function renderDonut(spec, opts = {}) {
  const { DW, DH, PH } = geom(opts);
  const segs = spec.segments.filter(s => s.value > 0);
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const cx = mL + 150, cy = mT + PH / 2, r = 132, sw = 58;
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
  const unit = spec.legendUnit || "of supply";   // e.g. "of classified" when the pie isn't the full supply
  let legend = "";
  segs.forEach((s, i) => {
    const ly = mT + 34 + i * 64;
    const pct = Math.round((s.value / total) * 100);
    legend += `<rect x="${lx}" y="${ly - 22}" width="30" height="30" rx="7" fill="${s.color}"/>`;
    legend += `<text x="${lx + 44}" y="${ly}" fill="#e2e8f0" font-size="28" font-weight="700" font-family="sans-serif">${esc(s.label)}</text>`;
    legend += `<text x="${lx + 44}" y="${ly + 28}" fill="#94a3b8" font-size="23" font-family="sans-serif">${pct}% ${esc(unit)}</text>`;
  });
  return chrome(spec, ring + center + legend, "", { W: DW, H: DH });
}

// Single horizontal 100%-stacked bar for proportions (e.g. locked vs free float).
export function renderStackBar(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const segs = spec.segments.filter(s => s.value > 0);
  const total = spec.total || segs.reduce((a, s) => a + s.value, 0) || 1;
  const barY = mT + PH / 2 - 46, barH = 96;
  let defs = "", body = "", x = mL;
  segs.forEach((s, i) => {
    defs += `<linearGradient id="seg${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="1"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0.6"/></linearGradient>`;
    const w = (s.value / total) * PW;
    const pct = Math.round((s.value / total) * 100);
    body += `<rect x="${(x + 2).toFixed(1)}" y="${barY}" width="${Math.max(0, w - 4).toFixed(1)}" height="${barH}" rx="8" fill="url(#seg${i})"/>`;
    if (w > 120) body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY + barH / 2 + 10}" fill="#05050e" font-size="30" font-weight="800" text-anchor="middle" font-family="sans-serif">${pct}%</text>`;
    body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY - 18}" fill="#e2e8f0" font-size="26" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(s.text ?? "")}</text>`;
    body += `<text x="${(x + w / 2).toFixed(1)}" y="${barY + barH + 38}" fill="#94a3b8" font-size="23" text-anchor="middle" font-family="sans-serif">${esc(s.label)}</text>`;
    x += w;
  });
  return chrome(spec, body, defs, { W: DW, H: DH });
}

// Render a built post's card to a PNG. Shared by the X bot (post.mjs) and the
// per-tab social image endpoint (api/og.js). opts.portrait renders the supported
// cards at 4:5 for the bot's posted media; the OG endpoint omits it (landscape).
// Semicircle gauge / dial. Two modes: pass `segments` ([{from,to,color}], 0..1)
// to paint colored zones around the arc — e.g. the rainbow risk bands — or omit
// them and the accent simply fills 0→value. A needle points at `value` (0..1);
// the big readout and the endpoint tick labels sit below the baseline. Shared by
// the risk dial and the "how far to DOGE-size" cycle-progress arc.
export function renderGauge(spec, opts = {}) {
  const { DW, DH, PH } = geom(opts);
  const cx = DW / 2, cy = mT + Math.round(PH * 0.57), R = 205, sw = 44; // dial centred in the plot
  const pt = (v, rad) => { const th = Math.PI * (1 - v); return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)]; };
  // Sample the arc as a polyline — an SVG `A` command's sweep flag is ambiguous
  // across orientations (a single 180° arc would wind the long way), so we trace
  // the parametric curve directly. Round joins keep it smooth.
  const arc = (v0, v1, rad) => {
    const steps = Math.max(2, Math.ceil(Math.abs(v1 - v0) * 48));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const [x, y] = pt(v0 + (v1 - v0) * (i / steps), rad);
      d += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d.trim();
  };
  const stroke = `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const accent = spec.accent || "#4ade80";
  const v = Math.min(1, Math.max(0, spec.value ?? 0));
  let svg = `<path d="${arc(0, 1, R)}" fill="none" stroke="${spec.trackColor || "#1e2433"}" ${stroke}/>`;
  if (spec.segments) {
    for (const s of spec.segments) svg += `<path d="${arc(s.from, s.to, R)}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="0.95"/>`;
  } else {
    svg += `<path d="${arc(0, v, R)}" fill="none" stroke="${accent}" ${stroke}/>`;
  }
  for (const t of (spec.ticks || [])) {
    const [ix, iy] = pt(t.at, R - sw / 2 - 6), [ox, oy] = pt(t.at, R + sw / 2 + 6);
    svg += `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#64748b" stroke-width="3"/>`;
    const anchor = t.anchor || (t.at < 0.5 ? "start" : t.at > 0.5 ? "end" : "middle");
    const lx = t.at < 0.5 ? cx - R - 6 : t.at > 0.5 ? cx + R + 6 : cx;
    svg += `<text x="${lx.toFixed(1)}" y="${(cy + 34).toFixed(1)}" fill="#94a3b8" font-size="24" text-anchor="${anchor}" font-family="sans-serif">${esc(t.label)}</text>`;
  }
  const [nx, ny] = pt(v, R - 30), [dx, dy] = pt(v, R);
  svg += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#f8fafc" stroke-width="7" stroke-linecap="round"/>`;
  svg += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="11" fill="${accent}" stroke="#05050e" stroke-width="3"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="17" fill="#0b0f1c" stroke="${accent}" stroke-width="4"/>`;
  if (spec.centerBig) svg += `<text x="${cx}" y="${(cy + 96).toFixed(1)}" fill="#f8fafc" font-size="52" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(spec.centerBig)}</text>`;
  if (spec.centerSmall) svg += `<text x="${cx}" y="${(cy + 134).toFixed(1)}" fill="#94a3b8" font-size="26" text-anchor="middle" font-family="sans-serif">${esc(spec.centerSmall)}</text>`;
  return chrome(spec, svg, "", { W: DW, H: DH });
}

// Two semicircle dials side by side, each in its own native colour scale, so you
// compare needle positions (e.g. crypto Fear & Greed vs SPX6900's own valuation
// dial). spec.left / spec.right: { title, value 0..1, big, verdict, color, segments }.
export function renderFngDial(spec, opts = {}) {
  const { DW, DH, PH } = geom(opts);
  const cy = mT + Math.round(PH * 0.5), R = 150, sw = 34;
  const dial = (cx, d) => {
    const pt = (v, rad) => { const th = Math.PI * (1 - v); return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)]; };
    const arc = (v0, v1, rad) => {
      const steps = Math.max(2, Math.ceil(Math.abs(v1 - v0) * 40));
      let s = "";
      for (let i = 0; i <= steps; i++) { const [x, y] = pt(v0 + (v1 - v0) * (i / steps), rad); s += `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)} `; }
      return s.trim();
    };
    const v = Math.min(1, Math.max(0, d.value));
    let g = `<text x="${cx}" y="${(cy - R - 26).toFixed(1)}" fill="#cbd5e1" font-size="27" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(d.title)}</text>`;
    g += `<path d="${arc(0, 1, R)}" fill="none" stroke="#1e2433" stroke-width="${sw}" stroke-linecap="round"/>`;
    for (const seg of d.segments) g += `<path d="${arc(seg.from, seg.to, R)}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-linejoin="round" stroke-opacity="0.95"/>`;
    const [nx, ny] = pt(v, R - 28), [dx, dy] = pt(v, R);
    g += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#f8fafc" stroke-width="6" stroke-linecap="round"/>`;
    g += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="10" fill="${d.color}" stroke="#05050e" stroke-width="3"/>`;
    g += `<circle cx="${cx}" cy="${cy}" r="15" fill="#0b0f1c" stroke="${d.color}" stroke-width="4"/>`;
    g += `<text x="${cx}" y="${(cy + 66).toFixed(1)}" fill="#f8fafc" font-size="58" font-weight="800" text-anchor="middle" font-family="sans-serif">${esc(d.big)}</text>`;
    g += `<text x="${cx}" y="${(cy + 104).toFixed(1)}" fill="${d.color}" font-size="27" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(d.verdict)}</text>`;
    return g;
  };
  const body = dial(mL + (DW - mL - mR) * 0.27, spec.left) + dial(mL + (DW - mL - mR) * 0.73, spec.right);
  return chrome(spec, body, "", { W: DW, H: DH });
}

// Static promo card: a finished marketing graphic posted as-is (no chart). The
// Kraken affiliate post uses this — the image ships in public/ with the repo, so
// the bot just hands X the raw PNG bytes. Falls outside the chrome/dims system.
const KRAKEN_IMG = new URL("../../public/rainbow-kraken.png", import.meta.url);
export function renderKrakenCard() {
  return readFileSync(KRAKEN_IMG);
}

// Dynamic-DCA ladder: the rainbow bands stacked richest-on-top (red) to
// cheapest-on-bottom (green/blue), each row showing how hard to buy. Cool bands
// carry a green intensity bar (buy heavier the cheaper it gets); hot bands just
// say "let it ride" (never a sell call — on-brand for a hold-forever community).
// bands: [{label,color,mult?,action}] index 0=cheapest…8=richest. current=band idx.
export function renderDcaLadder(spec, opts = {}) {
  const { DW, DH, PW, PH } = geom(opts);
  const bands = spec.bands, cur = spec.current, n = bands.length;
  const gap = 9, rowH = (PH - gap * (n - 1)) / n;
  const barX = mL + 320, maxBar = PW - 320 - 150;
  const maxMult = Math.max(...bands.filter(b => b.mult).map(b => b.mult), 1);
  const buy = "#34d399";
  let svg = "", defs = "";
  bands.forEach((b, i) => {
    const rowIndex = n - 1 - i;                  // band 0 (cheapest) → bottom row
    const y = mT + rowIndex * (rowH + gap);
    const cy = y + rowH / 2, isCur = i === cur;
    svg += `<rect x="${mL}" y="${y.toFixed(1)}" width="${PW}" height="${rowH.toFixed(1)}" rx="12" fill="${b.color}" fill-opacity="${isCur ? 0.34 : 0.13}"${isCur ? ` stroke="#fff" stroke-width="3"` : ""}/>`;
    svg += `<text x="${mL + 24}" y="${(cy + 9).toFixed(1)}" fill="#f1f5f9" font-size="27" font-weight="700" font-family="sans-serif">${esc(b.label)}</text>`;
    if (b.mult) {
      const bw = Math.max(16, (b.mult / maxMult) * maxBar), id = `lad${i}`;
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${buy}" stop-opacity="0.9"/><stop offset="100%" stop-color="${buy}" stop-opacity="0.4"/></linearGradient>`;
      svg += `<rect x="${barX}" y="${(cy - 14).toFixed(1)}" width="${bw.toFixed(1)}" height="28" rx="14" fill="url(#${id})"/>`;
      svg += `<text x="${(barX + bw + 16).toFixed(1)}" y="${(cy + 9).toFixed(1)}" fill="#f8fafc" font-size="26" font-weight="800" font-family="sans-serif">${esc(b.action)}</text>`;
    } else {
      svg += `<text x="${barX}" y="${(cy + 9).toFixed(1)}" fill="#94a3b8" font-size="24" font-style="italic" font-family="sans-serif">${esc(b.action)}</text>`;
    }
    if (isCur) {
      const tagW = 188, tx = mL + PW - tagW - 14, ty = y + (rowH - 34) / 2;
      svg += `<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tagW}" height="34" rx="17" fill="#fff"/>`;
      svg += `<text x="${(tx + tagW / 2).toFixed(1)}" y="${(ty + 24).toFixed(1)}" fill="#05050e" font-size="20" font-weight="800" text-anchor="middle" letter-spacing="1" font-family="sans-serif">YOU ARE HERE</text>`;
    }
  });
  return chrome(spec, svg, defs, { W: DW, H: DH });
}

export function renderPostCard(post, stats, opts = {}) {
  const { type, spec } = post.card;
  // Portrait for the supported cards; otherwise landscape — 3:2 by default, but a
  // caller (the OG link-unfurl endpoint) can pass opts.landscape={W,H} to render
  // the same card at another size (e.g. 1.91:1 so X doesn't crop shared links).
  const dims = opts.portrait && isPortraitCard(type) ? PORTRAIT : (opts.landscape ?? {});
  const s = { ...spec, date: stats.date };
  if (type === "rainbow") return renderRainbowCard(stats, dims);
  if (type === "kraken") return renderKrakenCard();
  if (type === "gauge") return renderGauge(s, dims);
  if (type === "fngdial") return renderFngDial(s, dims);
  if (type === "heatmap") return renderHeatmap(s, dims);
  if (type === "dca") return renderDca(s, dims);
  if (type === "dcaladder") return renderDcaLadder(s, dims);
  if (type === "bar") return renderBarCard(s, dims);
  if (type === "mbars") return renderMonthBars(s, dims);
  if (type === "donut") return renderDonut(s, dims);
  if (type === "stack") return renderStackBar(s, dims);
  if (type === "model") return renderModelCard(s, dims);
  if (type === "cube") return renderCubeCard(s);
  if (type === "scale") return renderScaleCard(s, dims);
  return renderLineCard(s, dims);
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
