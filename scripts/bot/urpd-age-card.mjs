// "Cost Basis × Holding Age" (URPD-by-age) card — the walls of supply, each split by how long
// the coins have been held. Same "where are the bags" histogram as the `urpd` card, but instead
// of green/red profit it colours each bar by holder AGE (fresh → old). The FIFO engine emits the
// per-bucket age split (bucket.age = [0-1m, 1-3m, 3-6m, 6-12m, 1y+], % of held). The insight it
// unlocks: for a round-tripping asset the SAME price bucket holds coins of very different ages —
// launch-era coins are almost all old (1y+), while the wall at spot mixes fresh buyers with old
// on-the-way-up holders. A holder-composition POSITION, not a signal. Data: stats.urpd.
// Data-gated: renders only once buckets carry the `age` field (populates on the next extract).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const AGE_C = ["#fb7185", "#fb923c", "#fbbf24", "#a78bfa", "#22d3ee"]; // 0-1m fresh → 1y+ old
const AGE_L = ["0–1m", "1–3m", "3–6m", "6–12m", "1y+"];
const fp = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p >= 0.1 ? 3 : 4);
const fpc = p => p >= 1 ? "$" + p.toFixed(2) : p >= 0.01 ? "$" + p.toFixed(3) : "$" + p.toFixed(4);

export function urpdAgeSvg(stats, opts = {}) {
  const u = stats.urpd;
  if (!u || !Array.isArray(u.buckets) || u.buckets.length < 8) return null;
  const b = u.buckets.filter(x => x && x.pct > 0 && Array.isArray(x.age) && x.age.length === 5);
  if (b.length < 6) return null; // no age data yet → stay dormant
  const spot = stats.price > 0 ? stats.price : (u.spot || 0);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 84, mR = 44;
  const pT = 172, pB = H - 86, pW = W - mL - mR;
  const pmin = b[0].lo, pmax = b.at(-1).hi;
  const lmin = Math.log(pmin), lspan = Math.log(pmax) - lmin || 1;
  const X = p => mL + ((Math.log(p) - lmin) / lspan) * pW;
  const bw = (pW / b.length) * 0.82;
  const ymax = Math.max(...b.map(x => x.pct)) * 1.1;
  const Y = v => pB - (v / ymax) * (pB - pT);

  // headline: the biggest wall + its fresh (<3m) vs old (1y+) split
  const wall = b.reduce((a, x) => x.pct > a.pct ? x : a, b[0]);
  const fresh = (wall.age[0] + wall.age[1]) / wall.pct * 100;
  const old = wall.age[4] / wall.pct * 100;
  const old1y = b.reduce((s, x) => s + x.age[4], 0); // % of ALL held that is 1y+
  const headline = `${Math.round(old1y)}% of supply held 1y+`;
  const sub = `Biggest wall ${fpc(wall.lo)}–${fpc(wall.hi)}: ${Math.round(fresh)}% fresh (<3m) · ${Math.round(old)}% held 1y+`;

  let bars = "";
  for (const x of b) {
    const cx = X(Math.sqrt(x.lo * x.hi)); let base = 0;
    for (let a = 0; a < 5; a++) {
      const seg = x.age[a]; if (seg <= 0) continue;
      const y0 = Y(base), y1 = Y(base + seg);
      bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" fill="${AGE_C[a]}" fill-opacity="0.94"/>`;
      base += seg;
    }
  }
  let xl = "";
  for (const p of [0.003, 0.01, 0.03, 0.1, 0.3, 1, 2]) { if (p < pmin || p > pmax) continue; xl += `<text x="${X(p).toFixed(1)}" y="${pB + 34}" fill="#aab6cc" font-size="22" text-anchor="middle" font-family="sans-serif" font-weight="600">${fp(p)}</text>`; }
  let spotLine = "";
  if (spot > pmin && spot < pmax) spotLine = `<line x1="${X(spot).toFixed(1)}" y1="${pT - 6}" x2="${X(spot).toFixed(1)}" y2="${pB}" stroke="#f8fafc" stroke-width="2" stroke-dasharray="6 5"/><text x="${(X(spot) + 8).toFixed(1)}" y="${pT + 8}" fill="#f8fafc" font-size="19" font-weight="700" font-family="sans-serif">spot ${fp(spot)}</text>`;
  let legend = ""; let cx = mL + 6;
  for (let i = 0; i < 5; i++) { legend += `<rect x="${cx}" y="120" width="24" height="16" rx="3" fill="${AGE_C[i]}"/><text x="${cx + 31}" y="134" fill="#cbd5e1" font-size="20" font-weight="700" font-family="sans-serif">${AGE_L[i]}</text>`; cx += 172; }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="uabg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0e1430"/><stop offset="55%" stop-color="#0a0d1c"/><stop offset="100%" stop-color="#06070f"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#uabg)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="22" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
<text x="52" y="58" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="0.5"><tspan fill="#22d3ee">${headline}</tspan></text>
<text x="52" y="90" font-size="21" font-family="sans-serif" fill="#e2e8f0">${esc(sub)}</text>
<text x="52" y="112" font-size="16" font-family="sans-serif" fill="#64748b">where every held coin was bought (x) — coloured by how long it's been held · fresh → old</text>
${legend}${xl}${spotLine}${bars}
<text x="52" y="${H - 22}" fill="#64748b" font-size="16" font-family="sans-serif">spx6900rainbow.xyz · % of held supply by on-chain cost basis (FIFO per-lot) × holding age · not financial advice</text>
</svg>`;
}

export function renderUrpdAgeCard(stats, opts = {}) {
  const svg = urpdAgeSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
