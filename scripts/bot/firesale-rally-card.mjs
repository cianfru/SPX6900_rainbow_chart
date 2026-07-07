// "Fire Sale Rallies" card — overlays every rally that launched from a Fire Sale-band
// low, each as × from its low (log Y) vs days since that low. Completed rallies run
// low→peak; the CURRENT one runs low→today so its endpoint is the live gain (peak may
// be behind it). Shows a first-~90-day window so the launch-era mega-run (from a
// sub-cent base) doesn't flatten the others into invisibility. Self-contained: computes
// the rallies from stats.drawn + stats.model.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { buildFireSaleRalliesLive } from "../../src/models.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getFullYear()).slice(2); };
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? x.toFixed(0) : x.toFixed(1)) + "×";
const fPct = g => (g >= 0 ? "+" : "") + Math.round(g * 100).toLocaleString() + "%";

const WINDOW_DAYS = 90; // first-N-days window (keeps the small rallies legible)

export function fireSaleRallySvg(stats, opts = {}) {
  const all = buildFireSaleRalliesLive(stats.drawn || [], stats.model, { minGain: 0.3 });
  if (!all.length) return null;
  const cur = all[all.length - 1];

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 92, mR = 128, mT = 118, mB = 72;
  const iT = mT, iB = H - mB, iH = iB - iT, iL = mL, iR = W - mR, iW = iR - iL;
  // window covers at least the current live rally so it's never truncated
  const dayCap = Math.max(WINDOW_DAYS, cur.daysSince || 0);
  const rallies = all.map(c => ({ ...c, points: c.points.filter(p => p.day <= dayCap) })).filter(c => c.points.length > 1);
  if (!rallies.length) return null;
  const n = rallies.length;
  const maxDay = Math.min(dayCap, Math.max(...rallies.map(c => c.points.at(-1).day)));
  const maxMult = Math.max(...rallies.map(c => Math.max(...c.points.map(p => p.gain + 1))));
  const yTop = Math.pow(10, Math.ceil(Math.log10(maxMult) * 4) / 4);
  const x = d => iL + (d / (maxDay || 1)) * iW;
  const y = mult => iT + ((Math.log(yTop) - Math.log(Math.max(mult, 1))) / (Math.log(yTop) - Math.log(1))) * iH;
  const colorFor = i => (rallies[i].live ? "#ffffff" : `hsl(${(265 - (n > 1 ? i / (n - 1) : 0) * 265).toFixed(0)},75%,62%)`);

  let grid = "";
  for (const v of [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].filter(v => v <= yTop * 1.001)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${iL}" y1="${yy}" x2="${iR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${iR + 14}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="24" font-family="sans-serif">${fMult(v)}</text>`;
  }
  let xlab = "";
  const step = maxDay > 240 ? 60 : maxDay > 120 ? 30 : 15;
  for (let d = 0; d <= maxDay; d += step) {
    xlab += `<line x1="${x(d).toFixed(1)}" y1="${iB}" x2="${x(d).toFixed(1)}" y2="${iB + 6}" stroke="rgba(255,255,255,0.2)"/>`;
    xlab += `<text x="${x(d).toFixed(1)}" y="${iB + 34}" fill="#64748b" font-size="23" text-anchor="middle" font-family="sans-serif">${d}d</text>`;
  }

  let lines = "", dots = "", glow = "";
  rallies.forEach((c, i) => {
    const col = colorFor(i);
    const pts = c.points.map(p => `${x(p.day).toFixed(1)},${y(p.gain + 1).toFixed(1)}`).join(" ");
    const last = c.points.at(-1);
    if (c.live) glow += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="11" stroke-opacity="0.18" filter="url(#fsg)"/>`;
    lines += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${c.live ? 4.5 : 3}" stroke-linejoin="round" stroke-opacity="0.95"/>`;
    dots += `<circle cx="${x(last.day).toFixed(1)}" cy="${y(last.gain + 1).toFixed(1)}" r="6" fill="${col}" stroke="#05050e" stroke-width="2"/>`;
    dots += `<text x="${(x(last.day) + 10).toFixed(1)}" y="${(y(last.gain + 1) + 8).toFixed(1)}" fill="${col}" font-size="21" font-weight="700" font-family="sans-serif">${fMult(last.gain + 1)}</text>`;
  });

  const legend = rallies.map((c, i) =>
    `<tspan fill="${colorFor(i)}" font-weight="700">■ </tspan><tspan fill="#cbd5e1">${fMon(c.startDate)} ${c.live ? `${fPct(c.nowGain)} now` : fPct(c.maxGain)}</tspan>`
  ).join(`<tspan fill="#475569">   </tspan>`);

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="fsg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="fsv" cx="30%" cy="0%" r="90%"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.16"/><stop offset="60%" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#fsv)"/>
${grid}${xlab}
${glow}${lines}${dots}
<text x="64" y="50" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — FIRE SALE RALLIES</text>
<text x="64" y="86" fill="#818cf8" font-size="22" font-family="sans-serif">The first ${dayCap} days after each Fire Sale-band low (× from low, log)</text>
<text x="${W - 60}" y="44" fill="#ffffff" font-size="28" font-weight="800" font-family="sans-serif" text-anchor="end">NOW ${fPct(cur.nowGain ?? cur.maxGain)}</text>
<text x="${W - 60}" y="76" fill="#94a3b8" font-size="20" font-family="sans-serif" text-anchor="end">${cur.daysSince ?? 0}d since low · peaked ${fPct(cur.peakGain ?? cur.maxGain)}</text>
<text x="64" y="${H - 18}" font-size="21" font-family="sans-serif">${legend}</text>
</svg>`;
}

export function renderFireSaleRalliesCard(stats, opts = {}) {
  const svg = fireSaleRallySvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
