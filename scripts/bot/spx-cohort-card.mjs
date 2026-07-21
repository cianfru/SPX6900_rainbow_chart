// "SPX6900 moves with the memecoin cohort" — the RELATIONSHIP card, market-adjusted.
// Peers were selected by MARKET-ADJUSTED (partial) correlation vs SPX daily returns — coins that
// track SPX BEYOND the common crypto beta (ETH regressed out), not by raw co-movement (which is
// mostly shared market beta ~0.7). This REFINES the earlier "SPX has no twin" finding: no unique
// twin, but SPX clearly moves with the memecoin cohort (partial r ~0.4) beyond the market.
// The card LEADS with the market-adjusted r (the rigorous number the selection is based on) and
// keeps the indexed price overlay as the visual. Both raw AND partial r are computed HERE from the
// plotted series (ETH control in the same bundle), so the numbers always match the lines.
// Data: src/cohort-daily.js (Dune prices.day, canonical addresses, same source, incl. ETH control).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { COHORT } from "../../src/cohort-daily.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();

// SPX is the reference. ETH is the market control (not plotted). Peers ordered by partial r.
const COINS = [
  { key: "SPX6900", sym: "SPX", c: "#5eead4", hero: true },
  { key: "FARTCOIN", sym: "FARTCOIN", c: "#f472b6" },
  { key: "WIF", sym: "WIF", c: "#c084fc" },
  { key: "BRETT", sym: "BRETT", c: "#60a5fa" },
  { key: "BITCOIN", sym: "BITCOIN", c: "#fb923c" },
];
const MARKET = "ETH";

const fMult = m => m >= 10 ? m.toFixed(0) + "×" : m >= 1 ? m.toFixed(1) + "×" : m >= 0.1 ? m.toFixed(2) + "×" : m.toFixed(3) + "×";

const pearson = (x, y) => {
  const n = x.length, mean = a => a.reduce((s, v) => s + v, 0) / a.length, mx = mean(x), my = mean(y);
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return c / Math.sqrt(vx * vy);
};
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; idx.forEach(([, i], k) => r[i] = k + 1); return r; };
const spearman = (x, y) => pearson(rank(x), rank(y));

let _cache = null;
export function spxCohortStats() {
  if (_cache) return _cache;
  const maps = Object.fromEntries([...COINS.map(c => c.sym), MARKET].map(s => [s, new Map(COHORT[s].map(([d, p]) => [d, p]))]));
  // Common anchor = the first day EVERY plotted coin has a price (the youngest peer's launch).
  const anchor = COINS.map(c => COHORT[c.sym][0][0]).sort().at(-1);
  const spx = maps.SPX, eth = maps[MARKET];

  const out = COINS.map(({ key, sym, c, hero }) => {
    const m = maps[sym];
    const pts = COHORT[sym].filter(([d]) => d >= anchor);
    const p0 = pts[0][1];
    const series = pts.map(([d, v]) => ({ ts: Date.parse(d), m: v / p0 }));
    let raw = null, partial = null;
    if (!hero) {
      // daily returns over the shared window (need SPX, peer, and ETH all present)
      const days = [...spx.keys()].filter(d => m.has(d) && eth.has(d) && d >= anchor).sort();
      const rs = [], rt = [], re = [];
      for (let i = 1; i < days.length; i++) {
        const s0 = spx.get(days[i - 1]), s1 = spx.get(days[i]);
        const t0 = m.get(days[i - 1]), t1 = m.get(days[i]);
        const e0 = eth.get(days[i - 1]), e1 = eth.get(days[i]);
        if (s0 > 0 && t0 > 0 && e0 > 0) { rs.push(s1 / s0 - 1); rt.push(t1 / t0 - 1); re.push(e1 / e0 - 1); }
      }
      raw = spearman(rs, rt);
      const rSE = spearman(rs, re), rTE = spearman(rt, re);
      partial = (raw - rSE * rTE) / Math.sqrt((1 - rSE ** 2) * (1 - rTE ** 2)); // partial corr, ETH removed
    }
    return { key, c, hero, series, now: series.at(-1).m, raw, partial, lastTs: series.at(-1).ts };
  });
  const peers = out.filter(o => !o.hero);
  const avgPartial = peers.reduce((s, o) => s + o.partial, 0) / peers.length;
  return (_cache = { anchor, coins: out, avgPartial });
}

export function spxCohortSvg(opts = {}) {
  const { anchor, coins: S } = spxCohortStats();
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 128, mR = 108;
  const pT = 168, pB = H - 108, footY = H - 24, pW = W - mL - mR;
  const t0 = Math.min(...S.map(s => s.series[0].ts)), t1 = Math.max(...S.map(s => s.lastTs));
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  let mMin = Infinity, mMax = 0;
  for (const s of S) for (const p of s.series) { if (p.m < mMin) mMin = p.m; if (p.m > mMax) mMax = p.m; }
  mMin *= 0.85; mMax *= 1.15;
  const lo = Math.log(mMin), hi = Math.log(mMax);
  const y = m => pT + ((hi - Math.log(Math.max(m, 1e-6))) / ((hi - lo) || 1)) * (pB - pT);

  let grid = "";
  for (const m of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]) {
    if (m < mMin || m > mMax) continue;
    const yy = y(m).toFixed(1), is1 = m === 1;
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="${is1 ? "#f8fafc" : "rgba(255,255,255,0.09)"}" stroke-width="${is1 ? 1.8 : 1}" ${is1 ? 'stroke-dasharray="7 6" stroke-opacity="0.85"' : ""}/>`
      + `<text x="${mL - 16}" y="${(+yy + 8).toFixed(1)}" fill="${is1 ? "#e2e8f0" : "#aab6cc"}" font-size="24" text-anchor="end" font-family="sans-serif" font-weight="600">${fMult(m)}</text>`;
  }

  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${pB + 44}" fill="#aab6cc" font-size="24" text-anchor="middle" font-family="sans-serif" font-weight="600">${yr}</text>`;
  }

  let lines = "", ends = "";
  S.forEach(s => {
    const pline = s.series.map(p => `${x(p.ts).toFixed(1)},${y(p.m).toFixed(1)}`).join(" ");
    const sw = s.hero ? 4.6 : 3, op = s.hero ? 1 : 0.97;
    lines += `<polyline points="${pline}" fill="none" stroke="${s.c}" stroke-width="${s.hero ? 12 : 8}" stroke-opacity="0.18" stroke-linejoin="round" filter="url(#chglow)"/>`
      + `<polyline points="${pline}" fill="none" stroke="${s.c}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"/>`;
    ends += `<circle cx="${x(s.lastTs).toFixed(1)}" cy="${y(s.now).toFixed(1)}" r="${s.hero ? 9 : 6.5}" fill="${s.c}" stroke="#06070f" stroke-width="2.5"/>`;
  });
  ends += `<circle cx="${x(t0).toFixed(1)}" cy="${y(1).toFixed(1)}" r="5.5" fill="#e2e8f0"/>`;

  // horizontal legend strip under the title (never overlaps the plot): swatch · name · r (or "ref").
  // Auto-size the label font so the widest item fits its slot at any aspect ratio.
  const slotW = pW / S.length;
  const labelLen = s => s.key.length + (s.hero ? 4 : 8); // "  ref" / "  r 0.00"
  let lf = 23; while (lf > 14 && !S.every(s => 40 + labelLen(s) * lf * 0.58 <= slotW - 8)) lf--;
  const lgY = 128;
  let legend = "";
  S.forEach((s, i) => {
    const cx = mL + i * slotW;
    const tag = s.hero
      ? `<tspan dx="8" fill="#94a3b8" font-weight="500">ref</tspan>`
      : `<tspan dx="8" fill="#94a3b8" font-weight="500">r</tspan><tspan dx="6" fill="#e2e8f0" font-weight="800">${s.partial.toFixed(2)}</tspan>`;
    legend += `<line x1="${cx}" y1="${lgY - 6}" x2="${cx + 26}" y2="${lgY - 6}" stroke="${s.c}" stroke-width="5" stroke-linecap="round"/>`
      + `<text x="${cx + 38}" y="${lgY}" fill="${s.c}" font-size="${lf}" font-weight="800" font-family="sans-serif">${esc(s.key)}${tag}</text>`;
  });

  const aLabel = new Date(Date.parse(anchor)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="chbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171f42"/><stop offset="52%" stop-color="#0c1122"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
<radialGradient id="chaccent" cx="18%" cy="4%" r="78%"><stop offset="0%" stop-color="#5eead4" stop-opacity="0.13"/><stop offset="46%" stop-color="#5eead4" stop-opacity="0"/><stop offset="100%" stop-color="#5eead4" stop-opacity="0"/></radialGradient>
<radialGradient id="chvig" cx="82%" cy="100%" r="80%"><stop offset="0%" stop-color="#000000" stop-opacity="0.35"/><stop offset="60%" stop-color="#000000" stop-opacity="0"/></radialGradient>
<filter id="chglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#chbg)"/>
<rect width="${W}" height="${H}" fill="url(#chvig)"/>
<rect width="${W}" height="${H}" fill="url(#chaccent)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="70" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1.2"><tspan fill="#5eead4">SPX6900</tspan><tspan fill="#f1f5f9"> &amp; ITS MEMECOIN COHORT</tspan></text>
${grid}${xlab}
${lines}${ends}${legend}
<text x="60" y="${footY}" fill="#94a3b8" font-size="17" font-family="sans-serif" textLength="${W - 96}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · Dune prices.day · partial daily-return corr, ETH removed (raw co-move ~0.7) · indexed to 1× on ${aLabel}`)}</text>
</svg>`;
}

export function renderSpxCohortCard(opts = {}) {
  return png(spxCohortSvg(opts), opts.W ?? 1200);
}
