// STUDIO CARD — the renderer behind the hands-off Card Studio. Takes ANY time-series (the same data
// a chart plots), a window, and a custom title + subtitle, and draws it in the house card style:
// a fading colour-washed dark background, the rainbow brand stripe, a glowing line with a fading area
// fill, unit-aware axes, and a footer. Server-side (SVG → Resvg), so it matches the posted cards
// exactly. Owner drives it from the control panel; nothing here is chart-specific.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// ── value + date formatting ───────────────────────────────────────────────────────────────────────
const compact = v => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
  if (a >= 1) return (v % 1 ? v.toFixed(1) : String(Math.round(v)));
  return a >= 0.1 ? v.toFixed(2) : a >= 0.001 ? v.toFixed(3) : v.toFixed(5);
};
const fmtVal = (v, unit) => unit === "$" ? "$" + compact(v) : unit === "%" ? Math.round(v) + "%" : unit === "×" ? v.toFixed(2) + "×" : compact(v);

// nice linear ticks (~5) or log decades
function valueTicks(min, max, log) {
  const out = [];
  if (log) {
    const lo = Math.floor(Math.log10(Math.max(min, 1e-9))), hi = Math.ceil(Math.log10(max));
    for (let e = lo; e <= hi; e++) for (const m of [1, 3]) { const v = m * 10 ** e; if (v >= min * 0.9 && v <= max * 1.1) out.push(v); }
    return out;
  }
  const span = max - min || 1, raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  const step = (raw / mag <= 1 ? 1 : raw / mag <= 2 ? 2 : raw / mag <= 5 ? 5 : 10) * mag;
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.5; v += step) out.push(v);
  return out;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateTicks(t0, t1) {
  const span = t1 - t0, DAY = 864e5, out = [];
  if (span > 700 * DAY) { for (let y = new Date(t0).getUTCFullYear(); y <= new Date(t1).getUTCFullYear(); y++) { const t = Date.UTC(y, 0, 1); if (t >= t0 && t <= t1) out.push({ t, label: String(y) }); } }
  else if (span > 90 * DAY) { const d = new Date(t0); d.setUTCDate(1); for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); t <= t1; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) if (t >= t0) out.push({ t, label: MONTHS[new Date(t).getUTCMonth()] + " '" + String(new Date(t).getUTCFullYear()).slice(2) }); }
  else { const n = 5; for (let i = 0; i <= n; i++) { const t = t0 + span * i / n; out.push({ t, label: MONTHS[new Date(t).getUTCMonth()] + " " + new Date(t).getUTCDate() }); } }
  return out.length >= 2 ? out : [{ t: t0, label: MONTHS[new Date(t0).getUTCMonth()] + " '" + String(new Date(t0).getUTCFullYear()).slice(2) }, { t: t1, label: MONTHS[new Date(t1).getUTCMonth()] + " '" + String(new Date(t1).getUTCFullYear()).slice(2) }];
}

export function studioCardSvg(opts = {}) {
  const { points = [], title = "", subtitle = "", unit = "", color = "#38bdf8", label = "" } = opts;
  const pts = points.filter(p => Number.isFinite(p.ts) && Number.isFinite(p.v)).sort((a, b) => a.ts - b.ts);
  if (pts.length < 2) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 56, mT = 168, mB = 78, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = pts[0].ts, t1 = pts.at(-1).ts;
  const vs = pts.map(p => p.v), rawMin = Math.min(...vs), rawMax = Math.max(...vs);
  const log = !!opts.log && rawMin > 0;
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.08 || 1;
  let yMin = log ? rawMin * 0.9 : rawMin - pad, yMax = log ? rawMax * 1.1 : rawMax + pad;
  if (!log && rawMin >= 0) yMin = Math.min(yMin, rawMin >= 0 ? Math.max(0, rawMin - pad) : yMin);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => log
    ? mT + (Math.log(yMax) - Math.log(Math.max(v, 1e-9))) / ((Math.log(yMax) - Math.log(yMin)) || 1) * pH
    : mT + (yMax - v) / ((yMax - yMin) || 1) * pH;

  let grid = "";
  for (const v of valueTicks(yMin, yMax, log)) {
    if (v < Math.min(yMin, yMax) || v > Math.max(yMin, yMax)) continue;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 14}" y="${(+yy + 7).toFixed(1)}" fill="#8b98ad" font-size="22" text-anchor="end" font-family="sans-serif">${esc(fmtVal(v, unit))}</text>`;
  }
  let xlab = "";
  for (const t of dateTicks(t0, t1)) xlab += `<text x="${x(t.t).toFixed(1)}" y="${H - 46}" fill="#8b98ad" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(t.label)}</text>`;

  const line = pts.map(p => `${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${mL},${(mT + pH).toFixed(1)} ${line} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const cur = pts.at(-1), curX = x(cur.ts), curY = y(cur.v);
  const winLabel = `${MONTHS[new Date(t0).getUTCMonth()]} '${String(new Date(t0).getUTCFullYear()).slice(2)} – ${MONTHS[new Date(t1).getUTCMonth()]} '${String(new Date(t1).getUTCFullYear()).slice(2)}`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="stbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<radialGradient id="stwash" cx="18%" cy="2%" r="95%"><stop offset="0%" stop-color="${color}" stop-opacity="0.14"/><stop offset="55%" stop-color="${color}" stop-opacity="0.02"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>
<linearGradient id="stfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.42"/><stop offset="60%" stop-color="${color}" stop-opacity="0.12"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient>
<filter id="stglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#stbg)"/>
<rect width="${W}" height="${H}" fill="url(#stwash)"/>
${brandStripe(H)}
<text x="60" y="66" fill="#f8fafc" font-size="41" font-weight="800" font-family="sans-serif" letter-spacing="0.5">${esc(title || label)}</text>
${subtitle ? `<text x="60" y="110" fill="#a5b4c8" font-size="23" font-family="sans-serif">${esc(subtitle)}</text>` : ""}
${label ? `<text x="${W - mR}" y="66" fill="${color}" font-size="19" font-weight="700" text-anchor="end" font-family="sans-serif">${esc(label)}</text>` : ""}
${grid}${xlab}
<polygon points="${area}" fill="url(#stfill)"/>
<polyline points="${line}" fill="none" stroke="${color}" stroke-width="7" stroke-opacity="0.28" filter="url(#stglow)"/>
<polyline points="${line}" fill="none" stroke="${color}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="7" fill="${color}"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="13" fill="${color}" opacity="0.25"/>
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc(`spx6900rainbow.xyz${label ? " · " + label : ""} · ${winLabel} · not financial advice`)}</text>
</svg>`;
}

export function renderStudioCard(opts = {}) {
  const svg = studioCardSvg(opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
