// "Ethereum vs Solana in 2026" card — the divergence of the ≥5k cohort across SPX's two
// biggest chains this year. ETH = the mature vault (held flat, ~94% of value); Solana = the
// growth frontier (+5.6× held / +7× wallets in 8 months). Rebased to Jan 2026 = 1× so the
// two trajectories read on one axis. A distribution/adoption POSITION, not a signal.
//
// Data is a FROZEN bundle (scripts/bot/eth-sol-2026.js) — weekly SPX held/count for the ≥5k
// cohort, ETH from public/spx-timeline.json + Solana from a Dune daily_balances CSV (infra
// excluded via SOLANA_EXCLUDE). The card reads the bundle so it renders in rotation without a
// live Solana feed; regenerate when fresh data lands:
//   node scripts/bot/eth-sol-2026-card.mjs --bundle=<solana_daily_balances.csv>
// Data-gated: renders null until the bundle has ≥8 weekly points.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { ETH_SOL_2026 } from "./eth-sol-2026.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const ETH = "#98a2b7", SOL = "#a78bfa", SOL_HI = "#c4b5fd";

// The frozen bundle, or null if it isn't populated enough to render.
export function ethSol2026Data() {
  const d = ETH_SOL_2026;
  return d && d.n >= 8 && d.solHeld?.length === d.n ? d : null;
}

export function ethSol2026Svg(d, opts = {}) {
  const { ethHeld, ethCnt, solHeld, solCnt, n } = d;
  const rb = a => a.map(v => v / a[0]), last = a => a.at(-1) / a[0];
  const solRb = rb(solHeld), ethRb = rb(ethHeld);
  const solX = last(solHeld);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 56, mT = 150, mB = 150, pW = W - mL - mR, pH = H - mT - mB;
  const maxY = Math.max(2, Math.ceil(Math.max(...solRb) + 0.4));
  const x = i => mL + pW * i / (n - 1);
  const y = v => mT + pH * (1 - v / maxY);
  const poly = (arr, col, wd) => `<polyline points="${arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const area = (arr, grad) => `<polygon points="${mL},${(mT + pH).toFixed(1)} ${arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} ${(mL + pW).toFixed(1)},${(mT + pH).toFixed(1)}" fill="url(#${grad})"/>`;

  let grid = "";
  for (let g = 0; g <= maxY; g++) {
    const yy = y(g).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,${g === 1 ? 0.22 : 0.1})"${g === 1 ? ' stroke-dasharray="7 6"' : ""}/>`
      + `<text x="${mL - 14}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${g}×</text>`;
  }
  const endLbl = new Date(d.updated).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const xlab = `<text x="${mL}" y="${H - mB + 34}" fill="#94a3b8" font-size="22" font-family="sans-serif">Jan 2026</text>`
    + `<text x="${W - mR}" y="${H - mB + 34}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${esc(endLbl)}</text>`;

  const solEndY = y(solRb.at(-1)), ethEndY = y(1);
  const endLabels =
    `<text x="${W - mR - 6}" y="${(solEndY - 14).toFixed(1)}" fill="${SOL_HI}" font-size="24" font-weight="800" text-anchor="end" font-family="sans-serif">Solana +${solX.toFixed(1)}×</text>`
    + `<text x="${W - mR - 6}" y="${(ethEndY + 30).toFixed(1)}" fill="${ETH}" font-size="22" font-weight="700" text-anchor="end" font-family="sans-serif">Ethereum ~1×</text>`;

  const chip = (cx, col, name, sub) =>
    `<rect x="${cx}" y="${H - 116}" width="${(pW - 24) / 2}" height="66" rx="12" fill="#0b0c16" stroke="rgba(255,255,255,0.07)"/>`
    + `<rect x="${cx}" y="${H - 116}" width="6" height="66" rx="3" fill="${col}"/>`
    + `<text x="${cx + 22}" y="${H - 90}" fill="#f1f5f9" font-size="20" font-weight="800" font-family="sans-serif">${esc(name)}</text>`
    + `<text x="${cx + 22}" y="${H - 64}" fill="#9fb0c3" font-size="17" font-family="sans-serif">${esc(sub)}</text>`;
  const chips = chip(mL, ETH, "Ethereum — the vault", `${(ethHeld.at(-1) / 1e6).toFixed(0)}M held · ${ethCnt.at(-1).toLocaleString()} wallets · held flat`)
    + chip(mL + (pW - 24) / 2 + 24, SOL, "Solana — the frontier", `${(solHeld.at(-1) / 1e6).toFixed(0)}M held · ${solCnt.at(-1).toLocaleString()} wallets · +${solX.toFixed(1)}× this year`);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="esbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="esSol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SOL}" stop-opacity="0.42"/><stop offset="60%" stop-color="${SOL}" stop-opacity="0.1"/><stop offset="100%" stop-color="${SOL}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#esbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — ETHEREUM vs SOLANA</text>
<text x="60" y="100" fill="${SOL_HI}" font-size="32" font-weight="800" font-family="sans-serif">Solana +${solX.toFixed(1)}× this year — Ethereum holds flat</text>
<text x="60" y="130" fill="#93a3b8" font-size="19" font-family="sans-serif">${esc("the 5k+ cohort in 2026, rebased to Jan = 1× · the mature base vs the growth frontier · infra excluded")}</text>
${grid}${xlab}
${area(solRb, "esSol")}
${poly(ethRb, ETH, 4.5)}
${poly(solRb, SOL, 5.7)}
<circle cx="${x(n - 1).toFixed(1)}" cy="${solEndY.toFixed(1)}" r="9" fill="${SOL}" stroke="#05050e" stroke-width="3"/>
${endLabels}
${chips}
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · SPX held by wallets over 5,000 SPX · Solana infra (LP/MM/CEX) excluded")}</text>
</svg>`;
}

// stats-signature dispatch (matches the other cards); data comes from the frozen bundle.
export function renderEthSol2026Card(_stats, opts = {}) {
  const d = ethSol2026Data();
  return d ? png(ethSol2026Svg(d, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}

// --bundle=<csv>: recompute the frozen weekly series from spx-timeline.json (ETH) + a Solana
// daily_balances CSV and rewrite scripts/bot/eth-sol-2026.js. --out=<png> re-renders a preview.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const arg = Object.fromEntries(process.argv.slice(2).map(s => { const [k, ...v] = s.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
  if (arg.bundle) {
    const { balanceAt } = await import("../build-city-timeline.mjs");
    const { parseBalances, SOLANA_EXCLUDE } = await import("../build-solana-onchain.mjs");
    const DAY = 864e5, WEEK = 7 * DAY, T0 = Date.parse("2026-01-01"), T1 = Date.parse(new Date().toISOString().slice(0, 10));
    const tl = JSON.parse(readFileSync(new URL("../../public/spx-timeline.json", import.meta.url), "utf8"));
    const w0e = Date.parse(tl.week0), wk = [];
    for (let w = 0; w < tl.n; w++) { const dd = w0e + w * WEEK; if (dd >= T0 && dd <= T1) wk.push(w); }
    const ethHeld = [], ethCnt = [];
    for (const w of wk) { let h = 0, c = 0; for (const wal of tl.wallets) { const b = balanceAt(wal.p, w); if (b >= 5000) { h += b; c++; } } ethHeld.push(Math.round(h)); ethCnt.push(c); }
    const rows = parseBalances(readFileSync(arg.bundle, "utf8"), 1).filter(r => !SOLANA_EXCLUDE[r.owner]);
    const dow = (new Date(T0).getUTCDay() + 6) % 7, w0s = Date.parse(new Date(T0).toISOString().slice(0, 10)) - dow * DAY;
    const byO = new Map();
    for (const r of rows) { let a = byO.get(r.owner); if (!a) { a = []; byO.set(r.owner, a); } a.push(r); }
    for (const [, rs] of byO) rs.sort((a, b) => a.ts - b.ts);
    const solHeld = [], solCnt = [];
    for (let i = 0; i < wk.length; i++) { const end = w0s + (i + 1) * WEEK; let h = 0, c = 0; for (const [, rs] of byO) { let b = 0, j = 0; while (j < rs.length && rs[j].ts < end) { b = rs[j].bal; j++; } if (b >= 5000) { h += b; c++; } } solHeld.push(Math.round(h)); solCnt.push(c); }
    const body = `// GENERATED by eth-sol-2026-card.mjs --bundle — do not hand-edit.\n// Weekly SPX held/count for the >=5k cohort, ETH (spx-timeline.json) vs Solana (daily_balances CSV),\n// over 2026 (Jan 1 -> updated). Frozen; regenerate with:\n//   node scripts/bot/eth-sol-2026-card.mjs --bundle=<solana_daily_balances.csv>\nexport const ETH_SOL_2026 = {\n  updated: ${JSON.stringify(new Date(T1).toISOString().slice(0, 10))},\n  n: ${wk.length},\n  ethHeld: ${JSON.stringify(ethHeld)},\n  ethCnt: ${JSON.stringify(ethCnt)},\n  solHeld: ${JSON.stringify(solHeld)},\n  solCnt: ${JSON.stringify(solCnt)},\n};\n`;
    writeFileSync(new URL("./eth-sol-2026.js", import.meta.url), body);
    console.log(`bundle rewritten: n=${wk.length} eth ${(ethHeld.at(-1) / 1e6).toFixed(0)}M/${ethCnt.at(-1)} sol ${(solHeld.at(-1) / 1e6).toFixed(0)}M/${solCnt.at(-1)}`);
  }
  if (arg.out) { writeFileSync(arg.out, renderEthSol2026Card({})); console.log("rendered", arg.out); }
}
