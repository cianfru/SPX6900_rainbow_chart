// PROJECT AEON — "Floor & Sales" card. Floor price (ETH + USD, dual axis) and monthly
// trading volume since mint, from the marketplace sale log (public/aeon-sales.json).
// The floor is the daily min sale, smoothed with a 7-day rolling median (one cheap sale
// shouldn't define the floor). ETH and USD floors diverge when ETH's own price moves —
// that divergence is the point of showing both.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rollMed = (arr, k, key) => arr.map((_, i) => median(arr.slice(Math.max(0, i - k + 1), i + 1).map(r => r[key])));

export function aeonFloorSvg(data, opts = {}) {
  const daily = (data.daily || []).filter(r => r.floorEth > 0).map(r => ({ ...r, ts: Date.parse(r.d) })).sort((a, b) => a.ts - b.ts);
  if (daily.length < 30) return null;
  const fEth = rollMed(daily, 7, "floorEth"), fUsd = rollMed(daily, 7, "floorUsd");
  const cur = daily.at(-1);

  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const mL = 104, mR = 112, mT = 196, mB = 88, pW = W - mL - mR;
  const floorH = (H - mT - mB) * 0.66, volH = (H - mT - mB) * 0.24, volTop = mT + floorH + 26;
  const t0 = daily[0].ts, t1 = cur.ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;

  // Floor panel — dual log axes so both ETH and USD read across a wide range.
  const ethMax = Math.max(...fEth), ethMin = Math.min(...fEth.filter(v => v > 0));
  const usdMax = Math.max(...fUsd), usdMin = Math.min(...fUsd.filter(v => v > 0));
  const lg = (v, lo, hi) => (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1);
  const yE = v => mT + (1 - lg(v, ethMin, ethMax)) * floorH;
  const yU = v => mT + (1 - lg(v, usdMin, usdMax)) * floorH;
  const path = (vals, yf) => vals.map((v, i) => `${x(daily[i].ts).toFixed(1)},${yf(v).toFixed(1)}`).join(" ");

  // Monthly volume bars (ETH).
  const mon = new Map();
  for (const r of daily) { const k = r.d.slice(0, 7); mon.set(k, (mon.get(k) || 0) + r.volEth); }
  const months = [...mon.entries()].map(([k, v]) => ({ ts: Date.parse(k + "-01"), v })).sort((a, b) => a.ts - b.ts);
  const vMax = Math.max(...months.map(m => m.v), 1);
  const bw = Math.max(3, pW / months.length * 0.7);
  const volBars = months.map(m => {
    const h = (m.v / vMax) * volH, cx = x(m.ts);
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(volTop + volH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="#64748b" fill-opacity="0.7"/>`;
  }).join("");

  // Axis labels.
  const ethTicks = [ethMin, Math.sqrt(ethMin * ethMax), ethMax];
  const usdTicks = [usdMin, Math.sqrt(usdMin * usdMax), usdMax];
  let axes = "";
  for (const v of ethTicks) axes += `<text x="${mL - 12}" y="${(yE(v) + 6).toFixed(1)}" fill="#2dd4bf" font-size="20" text-anchor="end" font-family="${F}">${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}Ξ</text>`;
  for (const v of usdTicks) axes += `<text x="${W - mR + 12}" y="${(yU(v) + 6).toFixed(1)}" fill="#fbbf24" font-size="20" font-family="${F}">$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)}</text>`;
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  const volEthTot = (data.totalVolEth ?? 0), volUsdTot = data.totalVolUsd ?? 0;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
${aeonBgDefs("af", ["#2dd4bf", "#fbbf24"])}
<filter id="afglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${aeonBgRects(W, H, "af")}
${aeonHeader("PROJECT AEON — FLOOR & SALES", "Floor price and trading volume since mint. Floor = 7-day median of daily lows.", `${cur.floorEth}Ξ floor ($${cur.floorUsd.toLocaleString()}) · ${Math.round(volEthTot).toLocaleString()}Ξ traded ($${(volUsdTot / 1e6).toFixed(1)}M)`, "#5eead4", F)}
${volBars}
<polyline points="${path(fUsd, yU)}" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-opacity="0.85"/>
<polyline points="${path(fEth, yE)}" fill="none" stroke="#2dd4bf" stroke-width="4.2"/>
${axes}${xlab}
<text x="${mL}" y="${volTop - 6}" fill="#7c8a9e" font-size="16" font-family="${F}">monthly volume (Ξ)</text>
<rect x="${W - mR - 250}" y="30" width="13" height="13" rx="3" fill="#2dd4bf"/><text x="${W - mR - 232}" y="41" fill="#cbd5e1" font-size="17" font-family="${F}">floor Ξ</text>
<rect x="${W - mR - 150}" y="30" width="13" height="13" rx="3" fill="#fbbf24"/><text x="${W - mR - 132}" y="41" fill="#cbd5e1" font-size="17" font-family="${F}">floor $</text>
<text x="60" y="${H - 18}" fill="#6b7688" font-size="18" font-family="${F}">${esc(`on-chain marketplace sales · ${data.totalSales?.toLocaleString?.() || ""} trades · floor = lowest sale (7d median), a proxy for the listing floor`)}</text>
</svg>`;
}

export function renderAeonFloorCard(data, opts = {}) {
  const svg = aeonFloorSvg(data, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
