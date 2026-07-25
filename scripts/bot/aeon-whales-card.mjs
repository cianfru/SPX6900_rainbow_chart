// PROJECT AEON — "what the whales did" card.
//
// The concentration card answers how much the top-N wallets hold. This answers a
// different question: what has the whale COHORT been doing over time, which the
// holder-age waves cannot show and the wallet count actively hides.
//
// The finding is in the gap between the two lines. Whale headcount has sat at roughly
// forty wallets the whole way through — but the supply those wallets hold peaked near
// 40% in May 2024 and has drained to about 31% since, while one-token holders more than
// doubled. That is the same wallets each holding less, not whales leaving: a cohort
// quietly distributing into a widening retail base. Read the count alone and you would
// conclude nothing had happened.
//
// Data: public/aeon-onchain.json → series[].dist { whale, whaleTok, one } and held.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const SUP = "#f59e0b";   // whale share of supply — the line that moved
const ONE = "#22d3ee";   // one-token holders — named in the footer, where the supply went

export function aeonWhalesSvg(data, opts = {}) {
  const s = (data?.series || []).filter(r => r?.held > 0 && r?.dist?.whaleTok != null);
  if (s.length < 40) return null;

  const rows = s.map(r => ({
    t: Date.parse(r.d),
    pct: (r.dist.whaleTok / r.held) * 100,
    n: r.dist.whale,
    one: r.dist.one,
  })).filter(r => Number.isFinite(r.t));
  const cur = rows.at(-1);
  const peak = rows.reduce((a, b) => (b.pct > a.pct ? b : a));

  const W = opts.W ?? 1200, H = opts.H ?? 1200;
  const mL = 104, mR = 108, mT = 196, mB = 108;
  const pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  // Left axis: share of supply, 0 to a little above the peak. Right axis carries both
  // counts (whale wallets and one-token holders) on their own scale.
  const pMax = Math.ceil(Math.max(...rows.map(r => r.pct)) / 10) * 10 + 5;
  const y = v => mT + (1 - v / pMax) * pH;

  let grid = "";
  for (let v = 0; v <= pMax; v += 10) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="${F}">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 60}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  const path = (sel, yf) => rows.map(r => `${x(r.t).toFixed(1)},${yf(sel(r)).toFixed(1)}`).join(" ");
  const supLine = path(r => r.pct, y);
  const area = `${mL},${(mT + pH).toFixed(1)} ${supLine} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}`;

  const px = x(peak.t), py = y(peak.pct);
  const cx = x(cur.t), cy = y(cur.pct);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("wh", ["#f59e0b", "#2dd4bf"])}
<linearGradient id="whFill" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="${SUP}" stop-opacity="0.34"/><stop offset="100%" stop-color="${SUP}" stop-opacity="0"/></linearGradient>
</defs>
${aeonBgRects(W, H, "wh")}
${aeonHeader("PROJECT AEON — WHAT THE WHALES DID",
  `Wallets holding 11+ AEON. Still ${cur.n} of them — the same cohort, each holding less.`,
  `Whales hold ${cur.pct.toFixed(0)}% — down from a ${peak.pct.toFixed(0)}% peak`, SUP, F)}
${grid}${xlab}
<polygon points="${area}" fill="url(#whFill)"/>
<polyline points="${supLine}" fill="none" stroke="${SUP}" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" fill="${SUP}" stroke="#05050b" stroke-width="3"/>
<text x="${px.toFixed(1)}" y="${(py - 22).toFixed(1)}" fill="${SUP}" font-size="21" font-weight="700" text-anchor="middle" font-family="${F}">peak ${peak.pct.toFixed(0)}%</text>
<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10" fill="${SUP}" stroke="#05050b" stroke-width="3"/>
<text x="60" y="${H - 22}" fill="#6b7688" font-size="19" font-family="${F}">${esc(`whale = 11+ AEON · reconstructed from every transfer on-chain · ${rows[0].one} one-token holders at the start, ${cur.one} now`)}</text>
</svg>`;
}

export function renderAeonWhalesCard(data, opts = {}) {
  const svg = aeonWhalesSvg(data, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
