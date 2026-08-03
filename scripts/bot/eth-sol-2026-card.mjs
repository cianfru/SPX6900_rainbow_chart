// "SPX6900 across the chains" card — a current-snapshot comparison of the ≥5k cohorts on Ethereum,
// Solana and Base: their SCALE (wallets + value) and their MATURITY (holder-age distribution). The
// honest finding from the corrected on-chain data: the value lives on Ethereum (~94%), but the
// SURVIVORS on every chain held through the drawdown — Solana and Base both skew HARDER to the 1-2y
// "diamond" band than Ethereum, and Base's median hold is the oldest of the three despite being the
// youngest chain (its base is small + heavily churned, so only the diehards remain). A distribution
// POSITION, not a signal.
//
// Data is a FROZEN bundle (scripts/bot/eth-sol-2026.js) — ETH from public/spx-timeline.json, Solana
// from public/solana-onchain.json, Base from public/base-onchain.json (Alchemy cohort). Regenerate:
//   node scripts/bot/eth-sol-2026-card.mjs --bundle
// Data-gated: renders null until all three chains' age bands are present.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const CHAINS = [
  { key: "eth", label: "Ethereum", color: "#98a2b7", tag: "the vault" },
  { key: "sol", label: "Solana", color: "#a78bfa", tag: "the frontier" },
  { key: "base", label: "Base", color: "#3b82f6", tag: "the survivors" },
];
const fM = n => n >= 1e6 ? Math.round(n / 1e6) + "M" : Math.round(n / 1e3) + "k";

export function ethSol2026Data() {
  const d = ETH_SOL_2026;
  return d && CHAINS.every(c => d[c.key]?.hist?.length >= 12) ? d : null;
}

const BIN_DAYS = 30;   // ~monthly granularity for the density curve

export function ethSol2026Svg(d, opts = {}) {
  const chains = CHAINS.map(c => ({ ...c, ...d[c.key] }));
  const totalHeld = chains.reduce((s, c) => s + c.held, 0);
  const nBins = Math.max(...chains.map(c => c.hist.length));
  // 3-point smooth → bell-like curves
  const smooth = h => h.map((_, i) => (h[i - 1] ?? h[i]) * 0.25 + h[i] * 0.5 + (h[i + 1] ?? h[i]) * 0.25);
  const curves = chains.map(c => ({ ...c, s: smooth(c.hist) }));

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 78, mR = 44, mT = 190, mB = 150, pW = W - mL - mR, pH = H - mT - mB;
  const maxY = Math.max(6, Math.ceil(Math.max(...curves.flatMap(c => c.s)) / 2) * 2 + 2);
  const x = binMid => mL + (binMid / (nBins * BIN_DAYS)) * pW;    // days → x
  const y = v => mT + pH * (1 - v / maxY);

  let grid = "";
  for (let g = 0; g <= maxY; g += maxY <= 10 ? 2 : 5) {
    const yy = y(g).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.09)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="sans-serif">${g}%</text>`;
  }
  // x ticks in months/years
  let xlab = "";
  for (const [dys, lbl] of [[0, "0"], [180, "6m"], [365, "1y"], [540, "18m"], [730, "2y"], [913, "30m"], [1095, "3y"]]) {
    if (dys > nBins * BIN_DAYS) continue;
    xlab += `<line x1="${x(dys).toFixed(1)}" y1="${mT}" x2="${x(dys).toFixed(1)}" y2="${(mT + pH).toFixed(1)}" stroke="rgba(255,255,255,0.05)"/>`
      + `<text x="${x(dys).toFixed(1)}" y="${(mT + pH + 34).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="sans-serif">${lbl}</text>`;
  }

  // overlaid density curves (area + line), drawn largest-value-first so smaller peaks aren't hidden
  let defs = "", areas = "", lines = "", peaks = "";
  for (const c of [...curves].sort((a, b) => Math.max(...b.s) - Math.max(...a.s))) {
    const pts = c.s.map((v, i) => [x((i + 0.5) * BIN_DAYS), y(v)]);
    const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    defs += `<linearGradient id="es_${c.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c.color}" stop-opacity="0.34"/><stop offset="100%" stop-color="${c.color}" stop-opacity="0.04"/></linearGradient>`;
    areas += `<polygon points="${x(0.5 * BIN_DAYS).toFixed(1)},${(mT + pH).toFixed(1)} ${line} ${x((c.s.length - 0.5) * BIN_DAYS).toFixed(1)},${(mT + pH).toFixed(1)}" fill="url(#es_${c.key})"/>`;
    lines += `<polyline points="${line}" fill="none" stroke="${c.color}" stroke-width="3.4" stroke-linejoin="round"/>`;
    // dot at the chain's peak (median-ish mode)
    const pi = c.s.indexOf(Math.max(...c.s));
    peaks += `<circle cx="${x((pi + 0.5) * BIN_DAYS).toFixed(1)}" cy="${y(c.s[pi]).toFixed(1)}" r="5" fill="${c.color}" stroke="#05050e" stroke-width="2"/>`;
  }
  // legend
  let lx = W - mR - 400; const legend = chains.map(c => { const s = `<rect x="${lx}" y="${mT - 28}" width="15" height="15" rx="3" fill="${c.color}"/><text x="${lx + 21}" y="${mT - 16}" fill="#cbd5e1" font-size="19" font-family="sans-serif">${c.label}</text>`; lx += 21 + c.label.length * 11 + 24; return s; }).join("");
  const bars = `<defs>${defs}</defs>${areas}${lines}${peaks}`;

  // chips — one per chain
  const cw = (pW - 2 * 20) / 3;
  const chips = chains.map((c, k) => {
    const cx = mL + (cw + 20) * k;
    const valPct = (c.held / totalHeld * 100).toFixed(c.held / totalHeld < 0.1 ? 1 : 0);
    return `<rect x="${cx}" y="${H - 118}" width="${cw}" height="70" rx="12" fill="#0b0c16" stroke="rgba(255,255,255,0.07)"/>`
      + `<rect x="${cx}" y="${H - 118}" width="6" height="70" rx="3" fill="${c.color}"/>`
      + `<text x="${cx + 20}" y="${H - 90}" fill="#f1f5f9" font-size="19" font-weight="800" font-family="sans-serif">${esc(`${c.label} — ${c.n.toLocaleString()}`)}</text>`
      + `<text x="${cx + 20}" y="${H - 64}" fill="#9fb0c3" font-size="15.5" font-family="sans-serif">${esc(`${fM(c.held)} · ${valPct}% of value · med ${c.medAge}d`)}</text>`;
  }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="esbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#esbg)"/>
${brandStripe(H)}
<text x="60" y="56" fill="#f8fafc" font-size="37" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — HOLDERS ACROSS THE CHAINS</text>
<text x="60" y="98" fill="#c4b5fd" font-size="27" font-weight="800" font-family="sans-serif">The value's on Ethereum — but every chain's survivors held the drawdown</text>
<text x="60" y="130" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc(`holder-age distribution of each chain's 5k+ wallets · Solana & Base peak later than Ethereum — the survivors held`)}</text>
${grid}${bars}${xlab}${legend}
${chips}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · wallets over 5,000 SPX, self-custody · infra excluded · Base & Solana are younger chains")}</text>
</svg>`;
}

export function renderEthSol2026Card(_stats, opts = {}) {
  const d = ethSol2026Data();
  return d ? png(ethSol2026Svg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}

// --bundle: regenerate scripts/bot/eth-sol-2026.js from the three chains' live data. --out=<png> preview.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const arg = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  if (arg.bundle) {
    const { balanceAt } = await import("../build-city-timeline.mjs");
    const root = new URL("../../", import.meta.url);
    const NBINS = 37, BIN = 30;   // ~monthly bins to 37 months → the density curve
    const WBANDS = [[0, 30], [30, 90], [90, 180], [180, 365], [365, 1e9]];   // 0-1m,1-3m,3-6m,6-12m,1y+
    const LTH = 155;   // Glassnode long-term-holder / illiquid threshold (days)
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    // Per-chain wallet list [{bal,days}] → every metric derived uniformly.
    const TIERS = [[5e3, 25e3], [25e3, 1e5], [1e5, 1e6], [1e6, 1e12]];   // 5-25k, 25-100k, 100k-1M, 1M+
    const tiersOf = W => TIERS.map(([lo, hi]) => { const t = W.filter(w => w.bal >= lo && w.bal < hi); return [t.length, t.length ? med(t.map(w => w.days)) : 0]; });
    const tl = JSON.parse(readFileSync(new URL("public/spx-timeline.json", root), "utf8"));
    const lastW = tl.n - 1; const ethW = [];
    for (const w of tl.wallets) { const b = balanceAt(w.p, lastW); if (b < 5000) continue; let f = lastW; for (let k = 0; k < tl.n; k++) { if (balanceAt(w.p, k) >= 5000) { f = k; break; } } ethW.push({ a: w.a.toLowerCase(), bal: b, days: (lastW - f) * 7 }); }
    const jsonW = file => { const d = JSON.parse(readFileSync(new URL(`public/${file}`, root), "utf8")); return { doc: d, W: d.wallets.map(w => ({ a: w.a.toLowerCase(), bal: w.bal, days: w.days })), updated: d.updated }; };
    const solD = jsonW("solana-onchain.json"), baseD = jsonW("base-onchain.json");
    const metrics = W => {
      const held = W.reduce((s, w) => s + w.bal, 0), tot = held || 1, ages = W.map(w => w.days);
      const hist = new Array(NBINS).fill(0); for (const d of ages) hist[Math.min(NBINS - 1, Math.floor(d / BIN))]++;
      const bySupply = pred => +(W.filter(pred).reduce((s, w) => s + w.bal, 0) / tot * 100).toFixed(1);
      const conc = [1, 10, 50].map(k => +([...W].sort((a, b) => b.bal - a.bal).slice(0, k).reduce((s, w) => s + w.bal, 0) / tot * 100).toFixed(1));
      const curve = Array.from({ length: NBINS + 1 }, (_, i) => bySupply(w => w.days >= i * BIN));   // % of supply held ≥ i·30 days
      return { n: W.length, held: Math.round(held), medAge: med(ages), hist: hist.map(n => +(n / W.length * 100).toFixed(2)),
        conc, waves: WBANDS.map(([lo, hi]) => bySupply(w => w.days >= lo && w.days < hi)), illiquid: bySupply(w => w.days >= LTH), tiers: tiersOf(W), curve };
    };
    const eth = metrics(ethW), sol = metrics(solD.W), base = metrics(baseD.W);
    // ETH ∩ Base dual-holders (shared EVM address space) — the cross-chain maxis
    const ethMap = new Map(ethW.map(w => [w.a, w.bal]));
    const dl = baseD.W.filter(w => ethMap.has(w.a)).map(w => ({ a: w.a, eth: ethMap.get(w.a), base: w.bal })).sort((a, b) => (b.eth + b.base) - (a.eth + a.base));
    const dual = { n: dl.length, ethHeld: Math.round(dl.reduce((s, d) => s + d.eth, 0)), baseHeld: Math.round(dl.reduce((s, d) => s + d.base, 0)), top: dl.slice(0, 6).map(d => [d.a, Math.round(d.eth), Math.round(d.base)]) };
    // Base survival/exits straight from the cohort doc
    const bs = baseD.doc, baseSurv = { holders: bs.holders, exited: bs.exited, survivalPct: bs.survivalPct, exitTimeline: bs.exitTimeline || [] };
    const line = (k, m) => `  ${k}: { n: ${m.n}, held: ${m.held}, medAge: ${m.medAge}, illiquid: ${m.illiquid}, hist: ${JSON.stringify(m.hist)}, conc: ${JSON.stringify(m.conc)}, waves: ${JSON.stringify(m.waves)}, tiers: ${JSON.stringify(m.tiers)}, curve: ${JSON.stringify(m.curve)} },`;
    const body = `// GENERATED - SPX6900 holders across ETH/Solana/Base (current snapshot + true holder ages).\n// ETH from spx-timeline.json; Solana from solana-onchain.json; Base from base-onchain.json (Alchemy cohort).\n// Regenerate: node scripts/bot/eth-sol-2026-card.mjs --bundle · hist=% per ${BIN}-day age bin · conc=[top1,10,50]%\n// · waves=% of ≥5k SUPPLY by age · illiquid=% held >${LTH}d · tiers=[[n,medAge]] by balance band · dual=ETH∩Base maxis.\nexport const ETH_SOL_2026 = {\n  updated: ${JSON.stringify(baseD.updated)}, binDays: ${BIN}, wbands: ["<1m","1-3m","3-6m","6-12m","1y+"], tierBands: ["5-25k","25-100k","100k-1M","1M+"],\n${line("eth", eth)}\n${line("sol", sol)}\n${line("base", base)}\n  dual: ${JSON.stringify(dual)},\n  baseSurv: ${JSON.stringify(baseSurv)},\n};\n`;
    writeFileSync(new URL("scripts/bot/eth-sol-2026.js", root), body);
    console.log(`bundle: illiquid ETH ${eth.illiquid}% · dual-holders ${dual.n} · base survival ${baseSurv.survivalPct}%`);
  }
  if (arg.out) { writeFileSync(arg.out, renderEthSol2026Card({})); console.log("rendered", arg.out); }
}
