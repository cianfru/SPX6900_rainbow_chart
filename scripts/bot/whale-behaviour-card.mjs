// "Whale Behaviour" — the 2D companion to Whales Watching (3D). For each SIZE cohort of ≥100k
// wallets: how many added, sold, or sat unchanged over the last 30 days, and the cohort's net flow.
// Answers "who's buying and selling, by wallet size." The 3D page shows it as beams over cubes; this
// is the flat, glanceable version. Data: public/whales.json (per-wallet {a,bal,days,d7,d30}).
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, auraBg } from "./chrome.mjs";
import { buildCohorts } from "../../src/whale-cohorts.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const BUY = "#22c55e", SELL = "#f43f5e", FLAT = "#3b4256";

// All three chains, so the count matches the mosaic (one whale number everywhere). ETH carries d30/d7;
// Base & Solana carry a 30d `flow` → mapped to d30. buildCohorts falls back to 0 for any missing flow.
function loadWhales() {
  const j = f => { try { return JSON.parse(readFileSync(new URL(`../../public/${f}`, import.meta.url), "utf8")); } catch { return null; } };
  const eth = j("whales.json"), base = j("base-onchain.json"), sol = j("solana-onchain.json");
  const wallets = [];
  for (const w of eth?.wallets || []) if (w?.bal >= 1e5) wallets.push({ a: w.a, bal: w.bal, days: w.days, d30: w.d30 ?? 0, d7: w.d7 });
  for (const w of base?.wallets || []) if (w?.bal >= 1e5) wallets.push({ a: w.a, bal: w.bal, days: w.days, d30: w.flow ?? 0 });
  for (const w of sol?.wallets || []) if (w?.bal >= 1e5) wallets.push({ a: w.a, bal: w.bal, days: w.days, d30: w.flow ?? 0 });
  return wallets.length ? { wallets, updated: eth?.updated } : null;
}

// One aggregate summary, memoised, shared by the SVG and the post copy so they can't drift.
let _cache;
export function whaleBehaviourStats() {
  if (_cache !== undefined) return _cache;
  const doc = loadWhales();
  if (!doc?.wallets?.length) return (_cache = null);
  const r = buildCohorts(doc.wallets);
  if (!r.total) return (_cache = null);
  const buy = r.cohorts.reduce((s, c) => s + c.buy, 0), sell = r.cohorts.reduce((s, c) => s + c.sell, 0);
  const flat = r.total - buy - sell;
  const net = r.cohorts.reduce((s, c) => s + c.net, 0), held = r.cohorts.reduce((s, c) => s + c.held, 0);
  return (_cache = { r, buy, sell, flat, net, held, netPct: held ? (net / held) * 100 : 0,
    flatPct: Math.round(flat / r.total * 100) });
}

export function whaleBehaviourSvg(stats, opts = {}) {
  const { r, buy, sell, flat, flatPct, netPct } = stats;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 150, mR = 300, mT = 176, mB = 66;
  const pW = W - mL - mR, pH = H - mT - mB;
  const maxN = Math.max(...r.cohorts.map(c => c.n));
  const rowH = pH / r.cohorts.length, bh = rowH * 0.52;
  const netStr = netPct >= 0 ? `+${netPct.toFixed(2)}%` : `${netPct.toFixed(2)}%`;

  let rows = "";
  r.cohorts.forEach((c, i) => {
    const yy = mT + rowH * i + (rowH - bh) / 2;
    const full = (c.n / maxN) * pW;                         // bar length ∝ wallet count
    const seg = (n) => (c.n ? (n / c.n) * full : 0);
    const wBuy = seg(c.buy), wFlat = seg(c.flat), wSell = seg(c.sell);
    let x = mL;
    const bar = [[wBuy, BUY], [wFlat, FLAT], [wSell, SELL]].map(([w, col]) => {
      const r0 = x === mL ? 4 : 0;
      const s = `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${bh.toFixed(1)}" rx="${r0}" fill="${col}"/>`;
      x += w; return s;
    }).join("");
    const sc = c.sentiment === "accumulating" ? BUY : c.sentiment === "distributing" ? SELL : "#93a3b8";
    const np = c.netPct >= 0 ? `+${c.netPct.toFixed(2)}%` : `${c.netPct.toFixed(2)}%`;
    rows += `<text x="${mL - 14}" y="${(yy + bh / 2 + 7).toFixed(1)}" fill="#e2e8f0" font-size="21" font-weight="700" text-anchor="end" font-family="sans-serif">${esc(c.label)}</text>`
      + bar
      + `<text x="${(x + 14).toFixed(1)}" y="${(yy + bh / 2 - 3).toFixed(1)}" fill="#f1f5f9" font-size="18" font-weight="800" font-family="sans-serif">${c.buy}↑ ${c.sell}↓ · ${c.flat} flat</text>`
      + `<text x="${(x + 14).toFixed(1)}" y="${(yy + bh / 2 + 17).toFixed(1)}" fill="${sc}" font-size="15" font-weight="700" font-family="sans-serif">${esc(`net ${np} · ${c.sentiment}`)}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wbbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wbbg)"/>
${auraBg("#5eead4", W, H)}
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — WHALE BEHAVIOUR</text>
<text x="60" y="100" fill="#22d3ee" font-size="31" font-weight="800" font-family="sans-serif">${r.total} whales across 3 chains — ${flatPct}% held flat for 30 days</text>
<text x="60" y="140" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`≥100k SPX on ETH, Base & Solana, by size · ${buy} added / ${sell} sold / ${flat} unchanged over 30 days · net ${netStr}`)}</text>
${rows}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ETH + Base + Solana, self-custody · infra excluded · bar = wallets in tier")}</text>
</svg>`;
}

export function renderWhaleBehaviourCard(_stats, opts = {}) {
  const s = whaleBehaviourStats();
  return s ? png(whaleBehaviourSvg(s, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
