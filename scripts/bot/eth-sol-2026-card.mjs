// "Ethereum vs Solana holders" card — a current-snapshot comparison of SPX's two biggest chains'
// ≥5k cohorts: their SCALE (wallets + value) and their MATURITY (holder-age distribution). The honest
// finding from the corrected on-chain data: Solana's base is far smaller in value (~8.5%) yet its
// holders are just as diamond-handed as Ethereum's — a slightly higher median hold and a heavier
// 1-2y "held through the drawdown" band; ETH only leads at 2y+ because it launched ~4 months earlier.
// A distribution POSITION, not a signal.
//
// Data is a FROZEN bundle (scripts/bot/eth-sol-2026.js) — ETH from public/spx-timeline.json (full
// balance replay), Solana from public/solana-onchain.json (dense RPC residency + full-history ages).
// The card reads the bundle so it renders in rotation without loading the 3 MB timeline; regenerate
// after a data refresh:  node scripts/bot/eth-sol-2026-card.mjs --bundle
// Data-gated: renders null until both chains' age bands are present.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const ETH = "#98a2b7", SOL = "#a78bfa", SOL_HI = "#c4b5fd";
const fM = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 0) + "M" : Math.round(n / 1e3) + "k";

export function ethSol2026Data() {
  const d = ETH_SOL_2026;
  return d?.eth?.ageBands?.length === 5 && d?.sol?.ageBands?.length === 5 ? d : null;
}

export function ethSol2026Svg(d, opts = {}) {
  const { eth, sol, bands } = d;
  const solValPct = (sol.held / (eth.held + sol.held) * 100).toFixed(1);
  const solBasePct = Math.round(sol.n / (eth.n + sol.n) * 100);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 88, mR = 56, mT = 188, mB = 158, pW = W - mL - mR, pH = H - mT - mB;
  const maxY = Math.max(20, Math.ceil(Math.max(...eth.ageBands, ...sol.ageBands) / 10) * 10 + 10);
  const y = v => mT + pH * (1 - v / maxY);

  let grid = "";
  for (let g = 0; g <= maxY; g += 20) {
    const yy = y(g).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.1)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${g}%</text>`;
  }

  // grouped bars: 5 age bands × {ETH, Solana}
  const nG = bands.length, gW = pW / nG, bW = gW * 0.3, gap = bW * 0.16;
  let bars = "", xlab = "";
  for (let i = 0; i < nG; i++) {
    const cx = mL + gW * (i + 0.5);
    const ev = eth.ageBands[i], sv = sol.ageBands[i];
    const ex = cx - bW - gap / 2, sx = cx + gap / 2;
    bars += `<rect x="${ex.toFixed(1)}" y="${y(ev).toFixed(1)}" width="${bW.toFixed(1)}" height="${(y(0) - y(ev)).toFixed(1)}" rx="4" fill="${ETH}"/>`
      + `<text x="${(ex + bW / 2).toFixed(1)}" y="${(y(ev) - 10).toFixed(1)}" fill="#c7d0dc" font-size="19" font-weight="700" text-anchor="middle" font-family="sans-serif">${ev.toFixed(0)}</text>`
      + `<rect x="${sx.toFixed(1)}" y="${y(sv).toFixed(1)}" width="${bW.toFixed(1)}" height="${(y(0) - y(sv)).toFixed(1)}" rx="4" fill="${SOL}"/>`
      + `<text x="${(sx + bW / 2).toFixed(1)}" y="${(y(sv) - 10).toFixed(1)}" fill="${SOL_HI}" font-size="19" font-weight="700" text-anchor="middle" font-family="sans-serif">${sv.toFixed(0)}</text>`;
    xlab += `<text x="${cx.toFixed(1)}" y="${(mT + pH + 34).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${esc(bands[i])}</text>`;
  }
  // legend (top-right of plot)
  const lgY = mT - 14;
  const legend = `<rect x="${W - mR - 300}" y="${lgY - 16}" width="16" height="16" rx="3" fill="${ETH}"/><text x="${W - mR - 278}" y="${lgY - 2}" fill="#cbd5e1" font-size="20" font-family="sans-serif">Ethereum</text>`
    + `<rect x="${W - mR - 150}" y="${lgY - 16}" width="16" height="16" rx="3" fill="${SOL}"/><text x="${W - mR - 128}" y="${lgY - 2}" fill="#cbd5e1" font-size="20" font-family="sans-serif">Solana</text>`;

  const chip = (cx, col, name, sub) =>
    `<rect x="${cx}" y="${H - 118}" width="${(pW - 24) / 2}" height="70" rx="12" fill="#0b0c16" stroke="rgba(255,255,255,0.07)"/>`
    + `<rect x="${cx}" y="${H - 118}" width="6" height="70" rx="3" fill="${col}"/>`
    + `<text x="${cx + 22}" y="${H - 90}" fill="#f1f5f9" font-size="21" font-weight="800" font-family="sans-serif">${esc(name)}</text>`
    + `<text x="${cx + 22}" y="${H - 62}" fill="#9fb0c3" font-size="17" font-family="sans-serif">${esc(sub)}</text>`;
  const chips = chip(mL, ETH, `Ethereum — ${eth.n.toLocaleString()} wallets`, `${fM(eth.held)} SPX held · ~94% of value · median hold ${eth.medAge}d`)
    + chip(mL + (pW - 24) / 2 + 24, SOL, `Solana — ${sol.n.toLocaleString()} wallets`, `${fM(sol.held)} SPX held · ${solValPct}% of value · median hold ${sol.medAge}d`);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="esbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#esbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — ETHEREUM vs SOLANA HOLDERS</text>
<text x="60" y="100" fill="${SOL_HI}" font-size="31" font-weight="800" font-family="sans-serif">Solana holds ${solValPct}% of the value — and holds it just as tight</text>
<text x="60" y="132" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`how long each chain's 5k+ holders have held · Solana is ${solBasePct}% of the two-chain base, median hold ${sol.medAge}d vs ${eth.medAge}d`)}</text>
${grid}${bars}${xlab}${legend}
${chips}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · wallets over 5,000 SPX, self-custody · infra excluded · Solana is a younger chain")}</text>
</svg>`;
}

export function renderEthSol2026Card(_stats, opts = {}) {
  const d = ethSol2026Data();
  return d ? png(ethSol2026Svg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}

// --bundle: regenerate scripts/bot/eth-sol-2026.js from the live data. --out=<png> re-renders a preview.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const arg = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  if (arg.bundle) {
    const { balanceAt } = await import("../build-city-timeline.mjs");
    const root = new URL("../../", import.meta.url);
    const BANDS = [[0, 90], [90, 180], [180, 365], [365, 730], [730, 1e9]];
    const tl = JSON.parse(readFileSync(new URL("public/spx-timeline.json", root), "utf8"));
    const lastW = tl.n - 1;
    let ethN = 0, ethHeld = 0; const ethAges = [];
    for (const w of tl.wallets) { const b = balanceAt(w.p, lastW); if (b < 5000) continue; ethN++; ethHeld += b; let f = lastW; for (let k = 0; k < tl.n; k++) { if (balanceAt(w.p, k) >= 5000) { f = k; break; } } ethAges.push((lastW - f) * 7); }
    const sol = JSON.parse(readFileSync(new URL("public/solana-onchain.json", root), "utf8"));
    const solAges = sol.wallets.map(w => w.days);
    const solHeld = sol.wallets.reduce((a, w) => a + w.bal, 0);
    const bandsOf = a => BANDS.map(([lo, hi]) => +(a.filter(d => d >= lo && d < hi).length / a.length * 100).toFixed(1));
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const body = `// GENERATED - SPX6900 Ethereum vs Solana >=5k holders (current snapshot + true holder ages).\n// ETH from public/spx-timeline.json (full balance replay); Solana from public/solana-onchain.json\n// (dense RPC residency + full-history ages). Regenerate after a data refresh:\n//   node scripts/bot/eth-sol-2026-card.mjs --bundle\n// Age bands as share of each chain's >=5k holders: <3m, 3-6m, 6-12m, 1-2y, 2y+\nexport const ETH_SOL_2026 = {\n  updated: ${JSON.stringify(sol.updated)},\n  bands: ["<3m", "3-6m", "6-12m", "1-2y", "2y+"],\n  eth: { n: ${ethN}, held: ${Math.round(ethHeld)}, medAge: ${med(ethAges)}, ageBands: ${JSON.stringify(bandsOf(ethAges))} },\n  sol: { n: ${sol.wallets.length}, held: ${Math.round(solHeld)}, medAge: ${med(solAges)}, ageBands: ${JSON.stringify(bandsOf(solAges))} },\n};\n`;
    writeFileSync(new URL("scripts/bot/eth-sol-2026.js", root), body);
    console.log(`bundle rewritten: ETH ${ethN}/${(ethHeld / 1e6).toFixed(0)}M · SOL ${sol.wallets.length}/${(solHeld / 1e6).toFixed(1)}M`);
  }
  if (arg.out) { writeFileSync(arg.out, renderEthSol2026Card({})); console.log("rendered", arg.out); }
}
