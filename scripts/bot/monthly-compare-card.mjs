// "Monthly returns, year vs year" — a grouped column chart where each calendar
// month holds the two most recent years' month-over-month returns side by side
// (Jan '25 next to Jan '26, Feb next to Feb, …). Diverging from a 0% line; older
// year in blue, current year in gold. Self-contained from DEFAULT_RAW.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../../src/data.js";
import { FONT } from "./font.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const C_OLD = "#38bdf8", C_NEW = "#fbbf24"; // older year = sky, current year = gold
const fpct = v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const yy = y => "'" + String(y).slice(2);

// month-over-month returns keyed by year*12+month, with the current month using
// the live price so the latest bar is month-to-date. `series` is the daily history to
// read (default DEFAULT_RAW); the card passes the MERGED history (stats.drawn) so the
// recent months banked since the bundle date (e.g. June) aren't a gap. Sorted so the
// last point of each month = that month's close.
export function monthlyCompareData(price, dateStr, series = DEFAULT_RAW) {
  const byMonth = new Map();
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) { if (!(r.price > 0)) continue; const d = new Date(r.date); byMonth.set(d.getUTCFullYear() * 12 + d.getUTCMonth(), r.price); }
  const cd = new Date(dateStr); byMonth.set(cd.getUTCFullYear() * 12 + cd.getUTCMonth(), price);
  const keys = [...byMonth.keys()].sort((a, b) => a - b);
  const ret = new Map();
  for (let i = 1; i < keys.length; i++) ret.set(keys[i], byMonth.get(keys[i]) / byMonth.get(keys[i - 1]) - 1);
  const years = [...new Set([...ret.keys()].map(k => Math.floor(k / 12)))].sort((a, b) => a - b);
  const yOld = years.at(-2), yNew = years.at(-1);
  const at = (y, m) => (ret.has(y * 12 + m) ? ret.get(y * 12 + m) : null);
  return { yOld, yNew, at };
}

export function monthlyCompareSvg(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const { yOld, yNew, at } = monthlyCompareData(price, dateStr, opts.series);
  const months = MON.map((name, m) => ({ name, m, old: at(yOld, m), now: at(yNew, m) }));
  let maxAbs = 0.1;
  for (const mo of months) for (const v of [mo.old, mo.now]) if (v != null) maxAbs = Math.max(maxAbs, Math.abs(v));
  const R = Math.ceil(maxAbs / 0.2) * 0.2; // symmetric range, rounded to 20%

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 34, mT = 100, mB = 76, pW = W - mL - mR, pH = H - mT - mB;
  const y0 = mT + pH / 2;
  const y = v => mT + ((R - v) / (2 * R)) * pH;
  const groupW = pW / 12;
  const barW = Math.min(34, groupW * 0.32);
  const off = barW * 0.58; // half-gap between the pair

  // gridlines + % labels
  let grid = `<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>`;
  for (let v = -R; v <= R + 1e-9; v += 0.2) {
    if (Math.abs(v) < 1e-9) continue;
    const gy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${gy}" x2="${W - mR}" y2="${gy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL - 10}" y="${(+gy + 5).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${v > 0 ? "+" : ""}${Math.round(v * 100)}%</text>`;
  }

  // bars + value labels + month labels
  let bars = "", labels = "", xlab = "";
  months.forEach((mo, i) => {
    const cx = mL + (i + 0.5) * groupW;
    xlab += `<text x="${cx.toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${mo.name}</text>`;
    const draw = (v, bx, color) => {
      if (v == null) return;
      const yv = y(v), top = Math.min(yv, y0), h = Math.max(2, Math.abs(yv - y0));
      bars += `<rect x="${(bx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"/>`;
      const ly = v >= 0 ? top - 6 : top + h + 16;
      labels += `<text x="${bx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${color}" font-size="15" font-weight="700" text-anchor="middle" font-family="sans-serif">${fpct(v)}</text>`;
    };
    draw(mo.old, cx - off, C_OLD);
    draw(mo.now, cx + off, C_NEW);
  });

  // legend chip — parked upper-right, clear of the tall early-year bars
  const lx = mL + pW * 0.58, ly = mT + 6;
  const legend = `<rect x="${lx}" y="${ly}" width="232" height="42" rx="9" fill="rgba(5,5,14,0.6)" stroke="rgba(255,255,255,0.10)"/>`
    + `<rect x="${lx + 16}" y="${ly + 14}" width="24" height="15" rx="3" fill="${C_OLD}"/><text x="${lx + 48}" y="${ly + 27}" fill="#cbd5e1" font-size="25" font-family="sans-serif">${yOld}</text>`
    + `<rect x="${lx + 128}" y="${ly + 14}" width="24" height="15" rx="3" fill="${C_NEW}"/><text x="${lx + 160}" y="${ly + 27}" fill="#cbd5e1" font-size="25" font-family="sans-serif">${yNew}</text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="mcTop" cx="50%" cy="0%" r="85%"><stop offset="0%" stop-color="#fbbf24" stop-opacity="0.12"/><stop offset="60%" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<rect width="${W}" height="${H}" fill="url(#mcTop)"/>
${cardDepth(W, H)}${brandStripe(H)}
${grid}${bars}${labels}${xlab}${legend}
<text x="64" y="42" fill="#e2e8f0" font-size="29" font-weight="700" font-family="sans-serif" letter-spacing="1">SPX6900 MONTHLY RETURNS — ${yy(yOld)} vs ${yy(yNew)}</text>
<text x="${W - mR}" y="42" fill="#fbbf24" font-size="26" font-weight="800" font-family="sans-serif" text-anchor="end">month by month</text>
<text x="64" y="70" fill="#94a3b8" font-size="17" font-family="sans-serif">each month's close-to-close return, ${yOld} vs ${yNew} side by side — bars rise on a gain, drop on a loss</text>
<text x="64" y="${H - 14}" fill="#475569" font-size="15" font-family="sans-serif">spx6900rainbow.xyz · not financial advice · month-over-month close returns</text>
</svg>`;
}

export function renderMonthlyCompareCard(stats, opts = {}) {
  // Use the MERGED daily history (bundled + live snapshots), not the frozen bundle, so
  // recent months banked since the bundle date show up (fixes a missing June bar).
  return png(monthlyCompareSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), opts.W ?? 1200);
}
