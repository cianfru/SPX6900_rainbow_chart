// "Where today's float bought in" card — the SPX6900 supply held TODAY, placed on the real price
// curve at the price each cohort first paid. Bubble = SPX still held; a green ring = in profit,
// a red ring = underwater. The honest companion to survivorship, coupled with price: the old
// wallets left, so today's float is a spread of cost bases across the whole cycle — and ~40% of
// it bought ABOVE today's price and still hasn't sold (the conviction story a bar chart can't show).
// Not a "bought the bottom" story (the biggest bag came in near the $1.08 top); a "the float turned
// over, and the survivors are sitting through the drawdown" one.
//
// Data: stats.cohorts (public/cohort-survival.json — startWk + supplyNow + medPrice per era),
//       stats.drawn (the merged price history) and stats.price (today).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return `#${[0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("")}`; };
const vintage = (i, n) => mix("#22d3ee", "#f6a23c", n <= 1 ? 0 : i / (n - 1));
const fmtM = v => v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : (v / 1e3).toFixed(0) + "k";
const fmtP = p => p == null ? "" : p < 0.01 ? "$" + p.toFixed(4) : "$" + p.toFixed(2);
// profit/loss vs today: a multiple when deep in profit, a % when underwater or modest
const plLabel = (med, now) => {
  const r = now / med;
  if (r >= 2) return "+" + (r >= 10 ? r.toFixed(0) : r.toFixed(1)) + "×";
  if (r >= 1) return "+" + Math.round((r - 1) * 100) + "%";
  return "−" + Math.round((1 - r) * 100) + "%";
};

export function supplyEraSvg(stats, opts = {}) {
  const S = stats.cohorts;
  if (!S?.cohorts) return null;
  const co = S.cohorts.filter(c => c.arrived > 0 && c.supplyNow > 0 && c.medPrice > 0);
  const nC = co.length;
  if (nC < 4) return null;
  const now = stats.price;
  const line = (stats.drawn || []).map(r => ({ t: Date.parse(r.date), p: +r.price })).filter(r => Number.isFinite(r.t) && r.p > 0).sort((a, b) => a.t - b.t);
  if (line.length < 20 || !(now > 0)) return null;

  const total = co.reduce((s, c) => s + c.supplyNow, 0);
  const underPct = Math.round(100 * co.filter(c => c.medPrice > now).reduce((s, c) => s + c.supplyNow, 0) / total);
  const week0 = Date.parse(S.week0), DAY = 864e5;
  const maxS = Math.max(...co.map(c => c.supplyNow));
  const biggest = co.reduce((a, c) => c.supplyNow > a.supplyNow ? c : a);   // the single largest surviving bag
  const inProfit = co.reduce((a, c) => (c.medPrice <= now && c.supplyNow > a.supplyNow) ? c : a, { supplyNow: 0 });

  // era mid-point date (where on the price curve each cohort bought) + current held supply
  const bubbles = co.map((c, i) => {
    const endWk = i + 1 < co.length ? co[i + 1].startWk : S.n;
    return { ...c, ci: i, midT: week0 + ((c.startWk + endWk) / 2) * 7 * DAY, prof: c.medPrice <= now, col: vintage(i, nC) };
  });

  const W = opts.W ?? 1200, H = opts.H ?? 675, mL = 76, mR = 122, mT = 214, mB = 66, pW = W - mL - mR, pH = H - mT - mB;
  const F = FONT[0] || "sans-serif";
  const t0 = week0, t1 = Math.max(line.at(-1).t, ...bubbles.map(b => b.midT));
  const x = t => mL + ((t - t0) / (t1 - t0)) * pW;
  // floor the log axis just under the true launch low so the sub-cent dip stays IN frame (SPX spent
  // ~3 weeks below $0.004 at launch) — never clamped flat against the bottom or drawn off-card.
  const pFloor = Math.min(...line.map(r => r.p), ...co.map(c => c.medPrice));
  const pMin = Math.max(0.0005, pFloor * 0.85), pMax = Math.max(...line.map(r => r.p), ...co.map(c => c.medPrice), now) * 1.18;
  const lg = v => Math.log(Math.max(v, pMin));
  const y = v => mT + (1 - (lg(v) - lg(pMin)) / (lg(pMax) - lg(pMin))) * pH;
  const r = s => 7 + 43 * Math.sqrt(s / maxS);

  // diverging valuation zones (edge-bright, like the other on-chain cards): everything ABOVE the
  // "now" line bought higher than today = underwater (warm, vivid at the top); everything BELOW is
  // in profit (cool green, vivid at the bottom). The background now carries the same profit story as
  // the bubble rings, so a cohort's zone AND ring agree at a glance.
  const yNow = y(now);
  const zones = `<rect x="${mL}" y="${mT}" width="${pW}" height="${(yNow - mT).toFixed(1)}" fill="url(#seUp)"/>`
    + `<rect x="${mL}" y="${yNow.toFixed(1)}" width="${pW}" height="${(mT + pH - yNow).toFixed(1)}" fill="url(#seDn)"/>`;

  // price y-axis gridlines at decade-ish steps
  let grid = "";
  for (const v of [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2]) {
    if (v < pMin || v > pMax) continue;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 6).toFixed(1)}" fill="#64748b" font-size="19" text-anchor="end" font-family="${F}">${v < 1 ? "$" + v : "$" + v}</text>`;
  }
  // year ticks on x
  for (let yr = 2024; yr <= new Date(t1).getUTCFullYear(); yr++) {
    const tx = x(Date.UTC(yr, 0, 1));
    if (tx < mL || tx > mL + pW) continue;
    grid += `<line x1="${tx.toFixed(1)}" y1="${mT}" x2="${tx.toFixed(1)}" y2="${mT + pH}" stroke="rgba(255,255,255,0.05)"/>`
      + `<text x="${tx.toFixed(1)}" y="${(mT + pH + 30).toFixed(1)}" fill="#64748b" font-size="19" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  // the real price line
  const path = line.map((r2, i) => `${i ? "L" : "M"}${x(r2.t).toFixed(1)} ${y(r2.p).toFixed(1)}`).join(" ");
  const priceLine = `<path d="${path}" fill="none" stroke="#aab6cc" stroke-width="2.2" stroke-opacity="0.9"/>`;

  // "now" reference
  const yn = y(now).toFixed(1);
  const nowLine = `<line x1="${mL}" y1="${yn}" x2="${mL + pW}" y2="${yn}" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="2 6" opacity="0.6"/>`
    + `<text x="${mL + pW + 8}" y="${(+yn - 8).toFixed(1)}" fill="#e2e8f0" font-size="19" font-family="${F}">now</text>`
    + `<text x="${mL + pW + 8}" y="${(+yn + 14).toFixed(1)}" fill="#e2e8f0" font-size="20" font-weight="700" font-family="${F}">${fmtP(now)}</text>`;

  // bubbles, drawn small→large so big ones sit on top
  let dots = "";
  bubbles.slice().sort((a, b) => a.supplyNow - b.supplyNow).forEach(b => {
    const cx = x(b.midT), cy = y(b.medPrice), rad = r(b.supplyNow), ring = b.prof ? "#4ade80" : "#f43f5e";
    const above = cy - rad - 10;
    dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${b.col}" fill-opacity="0.8" stroke="${ring}" stroke-width="3"/>`;
    if (rad >= 22) {
      // label inside the big bubbles
      dots += `<text x="${cx.toFixed(1)}" y="${(cy - 2).toFixed(1)}" fill="#0b1120" font-size="24" font-weight="800" text-anchor="middle" font-family="${F}">${fmtM(b.supplyNow)}</text>`
        + `<text x="${cx.toFixed(1)}" y="${(cy + 20).toFixed(1)}" fill="#0b1120" font-size="16" font-weight="700" text-anchor="middle" font-family="${F}">${plLabel(b.medPrice, now)}</text>`;
    } else {
      dots += `<text x="${cx.toFixed(1)}" y="${above.toFixed(1)}" fill="#f1f5f9" font-size="20" font-weight="700" text-anchor="middle" font-family="${F}">${fmtM(b.supplyNow)}</text>`
        + `<text x="${cx.toFixed(1)}" y="${(above - 20).toFixed(1)}" fill="${ring}" font-size="15" text-anchor="middle" font-family="${F}">${plLabel(b.medPrice, now)}</text>`;
    }
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="sebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="seUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fb7185" stop-opacity="0.42"/><stop offset="100%" stop-color="#fb7185" stop-opacity="0.03"/></linearGradient>
<linearGradient id="seDn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.03"/><stop offset="100%" stop-color="#4ade80" stop-opacity="0.4"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sebg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — WHERE TODAY'S FLOAT BOUGHT IN</text>
<text x="60" y="98" fill="#94a3b8" font-size="22" font-family="${F}">Every surviving holder placed on the price curve, at the price they first paid.</text>
<text x="60" y="150" fill="#818cf8" font-size="33" font-weight="700" font-family="${F}">${esc(`${underPct}% of the float held today is underwater — and hasn't sold.`)}</text>
<text x="60" y="188" fill="#22d3ee" font-size="24" font-weight="700" font-family="${F}">${esc(`The biggest bag, ${fmtM(biggest.supplyNow)} SPX, bought near ${fmtP(biggest.medPrice)} (${plLabel(biggest.medPrice, now)}). Still here.`)}</text>
${zones}${grid}
<!-- zone labels: the background bands carry the same profit story as the bubble rings -->
<text x="${mL + 16}" y="${mT + 30}" fill="#fca5a5" font-size="20" font-weight="700" font-family="${F}">underwater — bought above today</text>
<text x="${mL + pW - 14}" y="${mT + pH - 14}" fill="#86efac" font-size="20" font-weight="700" text-anchor="end" font-family="${F}">in profit — bought below today</text>
${priceLine}${nowLine}${dots}
<text x="60" y="${H - 18}" fill="#5b6577" font-size="19" font-family="${F}">${esc("coins held by current holders, placed at their era's median entry price · self-custody · not a forecast")}</text>
</svg>`;
}

export function renderSupplyEraCard(stats, opts = {}) {
  const svg = supplyEraSvg(stats, opts);
  return svg ? png(svg, opts.width ?? 1200) : null;
}
