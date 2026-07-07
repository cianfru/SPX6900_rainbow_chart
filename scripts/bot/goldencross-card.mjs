// "Golden / Death Cross" card — the classic 50-day vs 200-day moving-average cross.
// The most widely-recognised trend line in markets; distinct from riskheat's 20-week
// heat oscillator and the power-law bands. Smooth daily SMAs (see models.goldenCross),
// past crosses marked (green ▲ golden / red ▼ death), live price behind.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { goldenCross, crossState } from "../../src/models.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fMon = t => new Date(t).toLocaleString("en-US", { month: "short", year: "2-digit" });

export function goldenCrossSvg(stats, opts = {}) {
  const gc = goldenCross(stats.drawn || []);
  if (gc.rows.length < 5) return null;
  const rows = gc.rows, cur = rows.at(-1), st = crossState(gc.gap);

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 96, mT = 118, mB = 70, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].ts, t1 = rows.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  let pmin = Infinity, pmax = -Infinity;
  for (const r of rows) for (const v of [r.p, r.ma50, r.ma200]) if (v != null) { pmin = Math.min(pmin, v); pmax = Math.max(pmax, v); }
  pmin *= 0.85; pmax *= 1.15;
  const y = p => mT + ((Math.log(pmax) - Math.log(Math.max(p, 1e-9))) / ((Math.log(pmax) - Math.log(pmin)) || 1)) * pH;
  const poly = key => rows.map(r => `${x(r.ts).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");

  let grid = "";
  for (const v of [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2].filter(v => v >= pmin && v <= pmax)) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/><text x="${mL - 10}" y="${(+yy + 5).toFixed(1)}" fill="#64748b" font-size="22" text-anchor="end" font-family="sans-serif">$${v}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) for (const m of [0, 6]) {
    const t = Date.UTC(yr, m, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 40}" fill="#64748b" font-size="22" text-anchor="middle" font-family="sans-serif">${fMon(t)}</text>`;
  }
  let marks = "";
  for (const c of gc.crosses) {
    const cx = x(c.ts), cy = y(c.y), col = c.type === "golden" ? "#4ade80" : "#f87171", up = c.type === "golden";
    marks += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" fill="${col}" fill-opacity="0.22"/>`
      + `<path d="M${cx.toFixed(1)},${(cy + (up ? -9 : 9)).toFixed(1)} l-8,${up ? 15 : -15} l16,0 z" fill="${col}"/>`
      + `<text x="${cx.toFixed(1)}" y="${up ? (cy + 30).toFixed(1) : (cy - 18).toFixed(1)}" fill="${col}" font-size="15" font-weight="700" text-anchor="middle" font-family="sans-serif">${up ? "golden" : "death"}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="gcg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter></defs>
<rect width="${W}" height="${H}" fill="#05050e"/>
<radialGradient id="gcv" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="${st.color}" stop-opacity="0.10"/><stop offset="60%" stop-color="${st.color}" stop-opacity="0"/></radialGradient>
<rect width="${W}" height="${H}" fill="url(#gcv)"/>
${grid}${xlab}
<polyline points="${poly("p")}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.45"/>
<polyline points="${poly("ma200")}" fill="none" stroke="#f97316" stroke-width="8" stroke-opacity="0.18" filter="url(#gcg)"/>
<polyline points="${poly("ma200")}" fill="none" stroke="#f97316" stroke-width="4.5" stroke-linejoin="round"/>
<polyline points="${poly("ma50")}" fill="none" stroke="#fbbf24" stroke-width="8" stroke-opacity="0.18" filter="url(#gcg)"/>
<polyline points="${poly("ma50")}" fill="none" stroke="#fbbf24" stroke-width="4.5" stroke-linejoin="round"/>
${marks}
<circle cx="${x(cur.ts).toFixed(1)}" cy="${y(cur.p).toFixed(1)}" r="6" fill="#38bdf8" stroke="#05050e" stroke-width="2"/>
<text x="64" y="50" fill="#e2e8f0" font-size="30" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — GOLDEN / DEATH CROSS</text>
<text x="${W - 60}" y="46" fill="${st.color}" font-size="27" font-weight="800" font-family="sans-serif" text-anchor="end">${st.label}</text>
${st.watch ? `<text x="${W - 60}" y="76" fill="#fbbf24" font-size="20" font-family="sans-serif" text-anchor="end">${st.watch}</text>` : ""}
<text x="64" y="86" fill="#94a3b8" font-size="22" font-family="sans-serif">50-day vs 200-day moving average — the classic trend cross</text>
<text x="64" y="${H - 16}" fill="#475569" font-size="15" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · ")}<tspan fill="#fbbf24">50-day</tspan> · <tspan fill="#f97316">200-day</tspan> · <tspan fill="#38bdf8">price</tspan></text>
</svg>`;
}

export function renderGoldenCrossCard(stats, opts = {}) {
  const svg = goldenCrossSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
