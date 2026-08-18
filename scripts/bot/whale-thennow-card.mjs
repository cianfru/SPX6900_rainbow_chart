// "Whales: Then vs Now" — the whale mosaic frozen at three cycle moments, side by side: the euphoric
// TOP, a capitulation FLUSH, and TODAY. Every ≥100k-SPX wallet is one square, green if it was adding
// over the ~30 days into that moment, red if reducing, dark if flat. The moments are picked OBJECTIVELY
// from the on-chain NRPL series (biggest realized-profit spike = euphoria, biggest realized-loss spike
// = capitulation) — not eyeballed. Reconstructed from spx-timeline.json (per-wallet weekly balances),
// so it refreshes as history extends. Ethereum whales (the timeline is the ETH replay).
//
// HONESTY: a falling balance = the wallet REDUCED (sold, moved, or split) — framed as "reduced", never
// "sold". Each panel's own whale set / count differs; that's the field at that moment, labelled as such.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { loadTimeline, loadOnchainSeries, nrplPeaks, whalesAtWeek, dateOfWeek } from "./whale-timeline.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const GREEN = "#22c55e", RED = "#ef4444", FLAT = "#161d2e";
const monShort = d => { const dt = new Date(d + "T00:00:00Z"); return dt.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }); };

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function flowColor(net, bal) {
  const dust = Math.max(1000, bal * 0.005);
  if (!net || Math.abs(net) < dust) return FLAT;
  const t = Math.max(0.24, Math.min(1, Math.abs(net) / (bal * 0.12 || 1)));
  return net > 0
    ? `rgb(${lerp(20, 34, t)},${lerp(83, 197, t)},${lerp(45, 94, t)})`
    : `rgb(${lerp(69, 239, t)},${lerp(10, 68, t)},${lerp(10, 68, t)})`;
}

// Prefer the small precomputed panels (public/whale-thennow.json) so the og function never has to
// bundle or scan the 3 MB timeline; fall back to a live reconstruction where the timeline is present
// (the bot in CI, or local). Same shape either way.
export function whaleThenNowStats() {
  try {
    const pre = JSON.parse(readFileSync(new URL("../../public/whale-thennow.json", import.meta.url), "utf8"));
    if (pre?.panels?.length) return pre;
  } catch { /* fall through */ }
  return computeThenNow();
}

// The heavy path: reconstruct the three panels from spx-timeline.json + the NRPL peaks. Used by the
// build step (build-whale-thennow.mjs) and as the live fallback.
export function computeThenNow() {
  const tl = loadTimeline(), oc = loadOnchainSeries();
  if (!tl?.wallets?.length) return null;
  const peaks = nrplPeaks(oc, tl);
  if (!peaks?.euphoria || !peaks?.capitulation) return null;
  const nowWk = tl.n - 1;
  const mk = (title, wk, date) => ({ title, date, ...whalesAtWeek(tl, wk) });
  const panels = [
    mk("The top", peaks.euphoria.week, peaks.euphoria.date),
    mk("The flush", peaks.capitulation.week, peaks.capitulation.date),
    mk("Today", nowWk, dateOfWeek(tl, nowWk)),
  ];
  return { panels, peaks, updated: tl.updated };
}

export function whaleThenNowSvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const st = whaleThenNowStats();
  if (!st) return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#06070f"/></svg>`;
  const P = st.panels, n = P.length;
  const pct = (a, t) => Math.round(100 * a / (t || 1));

  // three panels across
  const outer = 46, gap = 26, pw = (W - outer * 2 - gap * (n - 1)) / n;
  const gridTop = 250, gridBot = H - 92, gridH = gridBot - gridTop;
  const maxN = Math.max(...P.map(p => p.total));

  let panels = "";
  P.forEach((p, i) => {
    const px = outer + i * (pw + gap);
    // square pitch: fit the busiest panel's count into the panel box
    let sq = 12;
    for (; sq >= 5; sq--) { const cols = Math.floor(pw / (sq + 1)); const rows = Math.ceil(maxN / cols); if (rows * (sq + 1) <= gridH) break; }
    const pitch = sq + 1, cols = Math.floor(pw / pitch);
    const gridW = cols * pitch, gx = px + (pw - gridW) / 2;

    // panel header: label + date + the buy/sell readout (the story)
    const netBuyers = p.buy >= p.sell;
    const lean = netBuyers ? GREEN : RED, leanTxt = netBuyers ? "net buyers" : "net sellers";
    panels += `<text x="${(px + pw / 2).toFixed(1)}" y="188" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="800" fill="#f1f5f9">${esc(p.title)}</text>`
      + `<text x="${(px + pw / 2).toFixed(1)}" y="214" text-anchor="middle" font-family="monospace" font-size="18" fill="#94a3b8">${p.title === "Today" ? "now" : esc(monShort(p.date))} · ${p.total} whales</text>`
      + `<text x="${(px + pw / 2).toFixed(1)}" y="240" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="800" fill="${lean}">${leanTxt} · <tspan fill="${GREEN}">${pct(p.buy, p.total)}% add</tspan> <tspan fill="#64748b">/</tspan> <tspan fill="${RED}">${pct(p.sell, p.total)}% cut</tspan></text>`;

    // the mosaic grid
    let cells = "";
    p.rows.forEach((r, j) => {
      const cx = gx + (j % cols) * pitch, cy = gridTop + Math.floor(j / cols) * pitch;
      cells += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${sq}" height="${sq}" rx="1.6" fill="${flowColor(r.net, r.bal)}"/>`;
    });
    panels += cells;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="tnbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f1830"/><stop offset="55%" stop-color="#0a0f1f"/><stop offset="100%" stop-color="#06070f"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#tnbg)"/>
${brandStripe(H)}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1"><tspan fill="#f1f5f9">HOW THE WHALES PLAYED THE CYCLE</tspan></text>
<text x="60" y="98" font-size="18" font-family="sans-serif" fill="#94a3b8">Every ≥100k-SPX wallet = one square: <tspan fill="${GREEN}" font-weight="700">green</tspan> adding, <tspan fill="${RED}" font-weight="700">red</tspan> reducing into each moment. Moments = the on-chain NRPL peaks, not eyeballed.</text>
${panels}
<text x="60" y="${H - 22}" fill="#94a3b8" font-size="17" font-family="sans-serif" textLength="${W - 120}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · reconstructed from on-chain balances · Ethereum whales · a reduced balance = sold/moved/split, not necessarily a market sell · not a signal`)}</text>
</svg>`;
}

export function renderWhaleThenNowCard(opts = {}) {
  return png(whaleThenNowSvg(opts), opts.W ?? 1200);
}
