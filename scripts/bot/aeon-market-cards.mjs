// PROJECT AEON — market/trader postable cards, from the keyless reconstructions:
//   renderAeonTradersCard   ← aeon-traders.json  (top realized P&L)
//   renderAeonValuationCard ← aeon-market.json   (MVRV + supply-in-profit + URPD)
//   renderAeonTraitsCard    ← aeon-market.json   (trait premiums)
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fE = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "Ξ";
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";
const shell = (W, H, id, title, sub, hero, heroC, body, foot) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#${id})"/>
<rect x="0" y="0" width="7" height="${H}" fill="#2dd4bf"/>
<text x="60" y="72" fill="#e2e8f0" font-size="40" font-weight="800" font-family="${F}" letter-spacing="1">${esc(title)}</text>
<text x="60" y="108" fill="#94a3b8" font-size="21" font-family="${F}">${esc(sub)}</text>
<text x="60" y="150" fill="${heroC}" font-size="28" font-weight="800" font-family="${F}">${esc(hero)}</text>
${body}
<text x="60" y="${H - 26}" fill="#6b7688" font-size="18" font-family="${F}">${esc(foot)}</text></svg>`;

// horizontal bar list: rows of {label, value(0..1 width), text, color}
const hBars = (rows, x, y, w, rowH, fmtLabel) => rows.map((r, i) => {
  const yy = y + i * rowH, bw = Math.max(2, r.frac * w);
  return `<text x="${x}" y="${yy + rowH * 0.62}" fill="#cbd5e1" font-size="18" font-family="${F}">${esc(fmtLabel(r))}</text>` +
    `<rect x="${x + 300}" y="${yy + 6}" width="${bw.toFixed(1)}" height="${rowH - 14}" rx="4" fill="${r.color}" fill-opacity="0.9"/>` +
    `<text x="${x + 300 + bw + 10}" y="${yy + rowH * 0.62}" fill="#e2e8f0" font-size="18" font-weight="700" font-family="${F}">${esc(r.text)}</text>`;
}).join("");

export function renderAeonTradersCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const top = (data.top || []).slice(0, 12); if (top.length < 4) return null;
  const max = Math.max(...top.map(t => t.realized), 1);
  const rows = top.map(t => ({ frac: t.realized / max, color: "#34d399", label: short(t.a), text: fE(t.realized), t }));
  const body = hBars(rows, 60, 210, W - 60 - 300 - 130, (H - 300) / 12, r => r.label) +
    `<text x="60" y="${H - 56}" fill="#7c8a9e" font-size="18" font-family="${F}">${esc(`${data.traders.toLocaleString()} traders · realized P&L from matching each token's buys to its sells`)}</text>`;
  const svg = shell(W, H, "atr", "PROJECT AEON — TOP TRADERS", "Who's made money trading AEON (realized profit).",
    `Top trader ${fE(top[0].realized)}${top[0].winRate != null ? " · " + Math.round(top[0].winRate * 100) + "% win" : ""}`, "#34d399", body,
    "on-chain · round-trips only (mint cost + free transfers excluded) · not financial advice");
  return png(svg, W);
}

export function renderAeonValuationCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const v = data.valuation; if (!v || v.mvrv == null) return null;
  const buckets = (data.urpd || []).filter(b => b.n > 0).map(b => ({ mid: Math.sqrt(b.lo * b.hi), n: b.n, prof: Math.sqrt(b.lo * b.hi) <= v.floor }));
  const mL = 90, mR = 50, pT = 360, pB = H - 150, pW = W - mL - mR;
  const lo = Math.min(...buckets.map(b => b.mid)), hi = Math.max(...buckets.map(b => b.mid)), ll = Math.log(lo), lsp = (Math.log(hi) - ll) || 1;
  const maxN = Math.max(...buckets.map(b => b.n), 1), bw = pW / buckets.length * 0.82;
  const X = m => mL + (Math.log(m) - ll) / lsp * pW, Y = n => pB - n / maxN * (pB - pT);
  const bars = buckets.map(b => `<rect x="${(X(b.mid) - bw / 2).toFixed(1)}" y="${Y(b.n).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pB - Y(b.n)).toFixed(1)}" fill="${b.prof ? "#34d399" : "#fb7185"}" fill-opacity="0.85"/>`).join("");
  const fx = X(v.floor);
  const stat = (x, lbl, val, c) => `<text x="${x}" y="228" fill="#7c8a9e" font-size="16" font-family="${F}">${esc(lbl)}</text><text x="${x}" y="262" fill="${c}" font-size="30" font-weight="800" font-family="${F}">${esc(val)}</text>`;
  const body = stat(60, "FLOOR", fEth(v.floor), "#2dd4bf") + stat(300, "REALIZED", fEth(v.realizedPrice), "#a78bfa") + stat(540, "MVRV", v.mvrv.toFixed(2) + "×", "#fbbf24") + stat(760, "IN PROFIT", v.supplyInProfitPct + "%", "#34d399") +
    bars + `<line x1="${fx}" y1="${pT}" x2="${fx}" y2="${pB}" stroke="#f8fafc" stroke-width="1.6" stroke-dasharray="5 4"/><text x="${fx + 6}" y="${pT + 18}" fill="#f8fafc" font-size="16" font-family="${F}">floor ${fEth(v.floor)}</text>` +
    `<text x="${mL}" y="${pB + 34}" fill="#7c8a9e" font-size="16" font-family="${F}">← cheaper cost basis</text><text x="${mL + pW}" y="${pB + 34}" fill="#7c8a9e" font-size="16" text-anchor="end" font-family="${F}">green = in profit vs floor</text>`;
  const svg = shell(W, H, "aval", "PROJECT AEON — MVRV", "Are holders in profit? The SPX playbook on the NFT.",
    `${v.supplyInProfitPct}% in profit · MVRV ${v.mvrv.toFixed(2)}×`, "#34d399", body,
    "cost basis = each token's owner's last buy · reconstructed on-chain · a position, not a signal");
  return png(svg, W);
}

export function renderAeonTraitsCard(data, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const tp = (data.traitPremiums || []).slice(0, 12); if (tp.length < 4) return null;
  const max = Math.max(...tp.map(t => t.median), 0.01);
  const rows = tp.map(t => ({ frac: t.median / max, color: "#a78bfa", label: t.trait.length > 26 ? t.trait.slice(0, 25) + "…" : t.trait, text: fEth(t.median) }));
  const body = hBars(rows, 60, 210, W - 60 - 300 - 130, (H - 300) / 12, r => r.label) +
    `<text x="60" y="${H - 56}" fill="#7c8a9e" font-size="18" font-family="${F}">median sale price of pieces carrying each trait · last 180 days</text>`;
  const svg = shell(W, H, "att", "PROJECT AEON — TRAIT VALUES", "Which traits command a premium.",
    `Priciest: ${tp[0].trait.split(" · ").pop()} (${fEth(tp[0].median)})`, "#a78bfa", body,
    "on-chain sales · a trait's price also reflects the whole piece · not financial advice");
  return png(svg, W);
}
