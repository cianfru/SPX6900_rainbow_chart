// PROJECT AEON — market/trader postable cards, from the keyless reconstructions:
//   renderAeonTradersCard   ← aeon-traders.json  (top realized P&L)
//   renderAeonValuationCard ← aeon-market.json   (MVRV + supply-in-profit + URPD)
//   renderAeonTraitsCard    ← aeon-market.json   (trait premiums)
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonHeader } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fE = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "Ξ";
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";

// Colourful, high-impact shell: dark base + two large soft themed glows (opposite
// corners) + a bright accent stripe + a glow filter for the data viz. theme = [c1, c2].
const shell = (W, H, id, title, sub, hero, heroC, body, foot, theme = ["#2dd4bf", "#a855f7"]) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0c1020"/><stop offset="55%" stop-color="#080a14"/><stop offset="100%" stop-color="#05050b"/></linearGradient>
<radialGradient id="${id}g1" cx="12%" cy="8%" r="60%"><stop offset="0%" stop-color="${theme[0]}" stop-opacity="0.26"/><stop offset="55%" stop-color="${theme[0]}" stop-opacity="0.05"/><stop offset="100%" stop-color="${theme[0]}" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}g2" cx="92%" cy="98%" r="62%"><stop offset="0%" stop-color="${theme[1]}" stop-opacity="0.22"/><stop offset="60%" stop-color="${theme[1]}" stop-opacity="0.04"/><stop offset="100%" stop-color="${theme[1]}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}stripe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${theme[0]}"/><stop offset="100%" stop-color="${theme[1]}"/></linearGradient>
<filter id="${id}glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id}b)"/>
<rect width="${W}" height="${H}" fill="url(#${id}g1)"/>
<rect width="${W}" height="${H}" fill="url(#${id}g2)"/>
<rect x="0" y="0" width="9" height="${H}" fill="url(#${id}stripe)"/>
${aeonHeader(title, sub, hero, heroC, F)}
${body}
<text x="60" y="${H - 28}" fill="#6b7688" font-size="18" font-family="${F}">${esc(foot)}</text></svg>`;

// horizontal bar list: rows of {label, value(0..1 width), text, color}. `gid` = the glow filter.
const hBars = (rows, x, y, w, rowH, fmtLabel, gid) => rows.map((r, i) => {
  const yy = y + i * rowH, bw = Math.max(2, r.frac * w);
  return `<text x="${x}" y="${yy + rowH * 0.62}" fill="#dbe3f0" font-size="18" font-family="${F}">${esc(fmtLabel(r))}</text>` +
    `<rect x="${x + 300}" y="${yy + 5}" width="${bw.toFixed(1)}" height="${rowH - 12}" rx="5" fill="${r.color}" ${gid ? `filter="url(#${gid})"` : ""}/>` +
    `<text x="${x + 300 + bw + 12}" y="${yy + rowH * 0.62}" fill="#f4f7fc" font-size="19" font-weight="700" font-family="${F}">${esc(r.text)}</text>`;
}).join("");

export function renderAeonTradersCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const top = (data.top || []).slice(0, 12); if (top.length < 4) return null;
  const max = Math.max(...top.map(t => t.realized), 1);
  const rows = top.map(t => ({ frac: t.realized / max, color: "#34d399", label: short(t.a), text: fE(t.realized), t }));
  const body = hBars(rows, 60, 214, W - 60 - 300 - 130, (H - 310) / 12, r => r.label, "atrglow") +
    `<text x="60" y="${H - 58}" fill="#8a95a8" font-size="18" font-family="${F}">${esc(`${data.traders.toLocaleString()} traders · realized P&L from matching each token's buys to its sells`)}</text>`;
  const svg = shell(W, H, "atr", "PROJECT AEON — TOP TRADERS", "Who's made money trading AEON (realized profit).",
    `Top trader ${fE(top[0].realized)}${top[0].winRate != null ? " · " + Math.round(top[0].winRate * 100) + "% win" : ""}`, "#5eead4", body,
    "on-chain · round-trips only (mint cost + free transfers excluded) · not financial advice", ["#34d399", "#0891b2"]);
  return png(svg, W);
}

export function renderAeonValuationCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const v = data.valuation; if (!v || v.mvrv == null) return null;
  const buckets = (data.urpd || []).filter(b => b.n > 0).map(b => ({ mid: Math.sqrt(b.lo * b.hi), n: b.n, prof: Math.sqrt(b.lo * b.hi) <= v.floor }));
  const mL = 90, mR = 50, pT = 360, pB = H - 150, pW = W - mL - mR;
  const lo = Math.min(...buckets.map(b => b.mid)), hi = Math.max(...buckets.map(b => b.mid)), ll = Math.log(lo), lsp = (Math.log(hi) - ll) || 1;
  const maxN = Math.max(...buckets.map(b => b.n), 1);
  const X = m => mL + (Math.log(m) - ll) / lsp * pW, Y = n => pB - n / maxN * (pB - pT);
  // Bar width from the SMALLEST gap between neighbouring bars, not from pW/count. The
  // buckets are log-spaced and the empty ones are filtered out first, so the count no
  // longer matches the grid the bars actually sit on — dividing by it made every bar
  // slightly wider than its slot and the histogram fused into one block.
  const xs = buckets.map(b => X(b.mid)).sort((a, b) => a - b);
  let step = pW;
  for (let i = 1; i < xs.length; i++) step = Math.min(step, xs[i] - xs[i - 1]);
  const bw = Math.max(3, step - 4);            // a real 4px gap between neighbours
  // No glow on the bars: a 5px blur bleeds past each edge and closes the gap again, which
  // is what made them read as a solid mass. Crisp edges are the point of a histogram.
  const bars = buckets.map(b => `<rect x="${(X(b.mid) - bw / 2).toFixed(1)}" y="${Y(b.n).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pB - Y(b.n)).toFixed(1)}" fill="${b.prof ? "#34d399" : "#fb7185"}" fill-opacity="0.92"/>`).join("");
  const fx = X(v.floor);
  const stat = (x, lbl, val, c) => `<text x="${x}" y="230" fill="#8a95a8" font-size="16" font-family="${F}">${esc(lbl)}</text><text x="${x}" y="266" fill="${c}" font-size="32" font-weight="800" font-family="${F}">${esc(val)}</text>`;
  const body = stat(60, "FLOOR", fEth(v.floor), "#2dd4bf") + stat(300, "REALIZED", fEth(v.realizedPrice), "#a78bfa") + stat(540, "MVRV", v.mvrv.toFixed(2) + "×", "#fbbf24") + stat(760, "IN PROFIT", v.supplyInProfitPct + "%", "#34d399") +
    bars + `<line x1="${fx}" y1="${pT}" x2="${fx}" y2="${pB}" stroke="#f8fafc" stroke-width="1.6" stroke-dasharray="5 4"/><text x="${fx + 6}" y="${pT + 18}" fill="#f8fafc" font-size="16" font-family="${F}">floor ${fEth(v.floor)}</text>` +
    `<text x="${mL}" y="${pB + 34}" fill="#8a95a8" font-size="16" font-family="${F}">← cheaper cost basis</text><text x="${mL + pW}" y="${pB + 34}" fill="#8a95a8" font-size="16" text-anchor="end" font-family="${F}">green = in profit vs floor</text>`;
  const svg = shell(W, H, "aval", "PROJECT AEON — MVRV", "Are holders in profit? The SPX playbook on the NFT.",
    `${v.supplyInProfitPct}% in profit · MVRV ${v.mvrv.toFixed(2)}×`, "#5eead4", body,
    "cost basis = each token's owner's last buy · reconstructed on-chain · a position, not a signal", ["#34d399", "#fb7185"]);
  return png(svg, W);
}

export function renderAeonTraitsCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const tp = (data.traitPremiums || []).slice(0, 12); if (tp.length < 4) return null;
  const max = Math.max(...tp.map(t => t.median), 0.01);
  const rows = tp.map(t => ({ frac: t.median / max, color: "#a855f7", label: t.trait.length > 26 ? t.trait.slice(0, 25) + "…" : t.trait, text: fEth(t.median) }));
  const body = hBars(rows, 60, 214, W - 60 - 300 - 130, (H - 310) / 12, r => r.label, "attglow") +
    `<text x="60" y="${H - 58}" fill="#8a95a8" font-size="18" font-family="${F}">median sale price of pieces carrying each trait · last 180 days</text>`;
  const svg = shell(W, H, "att", "PROJECT AEON — TRAIT VALUES", "Which traits command a premium.",
    `Priciest: ${tp[0].trait.split(" · ").pop()} (${fEth(tp[0].median)})`, "#c4b5fd", body,
    "on-chain sales · a trait's price also reflects the whole piece · not financial advice", ["#a855f7", "#6366f1"]);
  return png(svg, W);
}
