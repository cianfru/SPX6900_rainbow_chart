// "SPX6900 exchange flow — by venue" — which exchanges GAINED vs BLED SPX over a recent
// window. Only possible because every venue's wallets are tagged: net Δ balance per venue =
// its net flow. A diverging (tornado) bar — accumulators green (right), distributors red (left).
// Data: stats.onchain[].cexVenues (per-venue balance from the FIFO engine). Net flow ≠ guaranteed
// buy/sell (OTC / listings / MM rebalancing), so it's a behaviour read, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fM = t => (t >= 0 ? "+" : "−") + (Math.abs(t) >= 1e6 ? (Math.abs(t) / 1e6).toFixed(Math.abs(t) >= 1e7 ? 0 : 1) + "M" : Math.round(Math.abs(t) / 1e3) + "K");
const WEEKS = 13;        // ~90-day window
const MIN = 50e3;        // hide venues with |flow| below this (declutter)
const POS = "#4ade80", NEG = "#f6465d";

// → { rows:[{venue, flow}] sorted desc, from, to, net, up, down } or null
export function cexVenFlowStats(stats, weeks = WEEKS) {
  const oc = (stats?.onchain || []).filter(r => r.cexVenues && Object.keys(r.cexVenues).length);
  if (oc.length < weeks + 4) return null;
  const a = oc[oc.length - 1 - weeks], b = oc.at(-1);
  const keys = new Set([...Object.keys(a.cexVenues), ...Object.keys(b.cexVenues)]);
  const rows = [...keys].map(k => ({ venue: k, flow: +(((b.cexVenues[k] || 0) - (a.cexVenues[k] || 0))).toFixed(2) }))
    .filter(r => Math.abs(r.flow) >= MIN).sort((x, y) => y.flow - x.flow);
  if (rows.length < 2) return null;
  const net = rows.reduce((s, r) => s + r.flow, 0);
  return { rows, from: a.d, to: b.d, net, up: rows[0], down: rows.at(-1) };
}

export function cexVenFlowSvg(stats, opts = {}) {
  const S = cexVenFlowStats(stats, opts.weeks ?? WEEKS);
  if (!S) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 40, mR = 40;
  const plotW = W - mL - mR;
  const maxPos = Math.max(1, ...S.rows.map(r => r.flow > 0 ? r.flow : 0));
  const maxNeg = Math.max(1, ...S.rows.map(r => r.flow < 0 ? -r.flow : 0));
  // proportional shared scale; zero line placed so both sides fit
  const padFrac = 0.30; // room for labels on each side
  const leftFrac = maxNeg / (maxNeg + maxPos);
  const cx = mL + plotW * (padFrac + (1 - 2 * padFrac) * leftFrac);
  const tpp = Math.min((cx - mL - plotW * padFrac * 0.15) / maxNeg, (W - mR - cx - plotW * padFrac * 0.15) / maxPos);

  const pT = 168, pB = H - 74;
  const n = S.rows.length;
  const band = (pB - pT) / n;
  const barH = Math.min(30, band * 0.62);
  let bars = "";
  S.rows.forEach((r, i) => {
    const yc = pT + band * (i + 0.5);
    const len = Math.abs(r.flow) * tpp;
    const pos = r.flow >= 0;
    const x0 = pos ? cx : cx - len, w = len, col = pos ? POS : NEG;
    bars += `<rect x="${x0.toFixed(1)}" y="${(yc - barH / 2).toFixed(1)}" width="${Math.max(2, w).toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${col}" fill-opacity="0.85"/>`;
    // venue name in the EMPTY quadrant (opposite the bar), value at the bar tip
    if (pos) {
      bars += `<text x="${(cx - 10).toFixed(1)}" y="${(yc + 7).toFixed(1)}" text-anchor="end" fill="#cbd5e1" font-size="21" font-family="sans-serif" font-weight="600">${esc(r.venue)}</text>`
        + `<text x="${(cx + w + 10).toFixed(1)}" y="${(yc + 7).toFixed(1)}" fill="${col}" font-size="21" font-family="sans-serif" font-weight="800">${fM(r.flow)}</text>`;
    } else {
      bars += `<text x="${(cx + 10).toFixed(1)}" y="${(yc + 7).toFixed(1)}" fill="#cbd5e1" font-size="21" font-family="sans-serif" font-weight="600">${esc(r.venue)}</text>`
        + `<text x="${(cx - w - 10).toFixed(1)}" y="${(yc + 7).toFixed(1)}" text-anchor="end" fill="${col}" font-size="21" font-family="sans-serif" font-weight="800">${fM(r.flow)}</text>`;
    }
  });

  const fmt = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const netCol = S.net >= 0 ? POS : NEG;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="vfbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#171f42"/><stop offset="52%" stop-color="#0c1122"/><stop offset="100%" stop-color="#06070f"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#vfbg)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="0.5"><tspan fill="#f1f5f9">Exchange flow by venue — </tspan><tspan fill="${S.up.flow >= 0 ? POS : NEG}">${esc(S.up.venue)} ${fM(S.up.flow)}</tspan></text>
<text x="60" y="98" font-size="20" font-family="sans-serif" fill="#94a3b8">Net change in SPX6900 held per exchange, ${esc(fmt(S.from))} → ${esc(fmt(S.to))} · ${esc(S.down.venue)} bled ${fM(S.down.flow)}</text>
<text x="60" y="132" font-size="18" font-family="sans-serif" fill="#64748b"><tspan fill="${POS}">▶ gained</tspan>   <tspan fill="${NEG}">◀ bled</tspan>   ·   net onto exchanges <tspan fill="${netCol}" font-weight="700">${fM(S.net)}</tspan></text>
<line x1="${cx.toFixed(1)}" y1="${pT}" x2="${cx.toFixed(1)}" y2="${pB}" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
${bars}
<text x="60" y="${H - 22}" fill="#94a3b8" font-size="16.5" font-family="sans-serif" textLength="${W - 96}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · per-venue net flow from tagged exchange wallets · net flow ≠ guaranteed buy/sell · a behaviour read, not a signal`)}</text>
</svg>`;
}

export function renderCexVenFlowCard(stats, opts = {}) {
  const svg = cexVenFlowSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
