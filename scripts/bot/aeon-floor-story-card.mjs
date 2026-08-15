// PROJECT AEON — "one buyer, one broken floor" microstructure card.
// The honest illiquidity story: on a market that trades ~$3k/day, a single wallet spending $28k
// in ONE day doubled the collection's floor — then it bled back to where it started over three
// weeks. Two panels make the point:
//   • floor in Ξ  + daily volume bars  → the one anomaly day towers; the floor spikes then reverts
//   • floor in SPX6900 vs its baseline → the same spike, reverting to a STABLE reference (the "truth")
// The lesson: in a thin market one buyer IS the market for a day, so you price it against something
// stable, not against itself. Reproducible from the public sale log + the SPX price series.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader, AEON_MT } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// sales = aeon-sales.json (daily floor + volume), market = aeon-market.json (spxValue.floorSeries)
export function renderAeonFloorStoryCard(sales, market, opts = {}) {
  const W = opts.W ?? 1080, H = opts.H ?? 1080;
  const from = opts.from ?? "2026-06-01";
  const eth = (sales?.daily || []).filter(d => d.d >= from && d.floorEth > 0).map(d => ({ t: Date.parse(d.d), d: d.d, floor: d.floorEth, vol: d.volUsd || 0 }));
  const spx = (market?.spxValue?.floorSeries || []).filter(p => p[0] >= from).map(p => ({ t: Date.parse(p[0]), v: p[1] }));
  if (eth.length < 8 || spx.length < 8) return null;

  const tMin = Math.min(eth[0].t, spx[0].t), tMax = Math.max(eth.at(-1).t, spx.at(-1).t), tSpan = (tMax - tMin) || 1;
  // headline numbers, computed (not hardcoded) so the card can be re-rendered as data moves
  const pre = median(eth.filter(d => d.d >= "2026-07-01" && d.d <= "2026-07-18").map(d => d.floor)) || median(eth.slice(0, 8).map(d => d.floor));
  const peakE = eth.reduce((a, b) => b.floor > a.floor ? b : a);
  const nowE = eth.at(-1), nowS = spx.at(-1);
  const bigVol = eth.reduce((a, b) => b.vol > a.vol ? b : a);
  const typVol = median(eth.map(d => d.vol).filter(v => v > 0));
  // baseline = the PRE-pump SPX level (before the anomaly day), i.e. where the collection sat before
  // one buyer moved it — the honest "where it should be" reference the SPX denominator gives us.
  const baseS = median(spx.filter(p => p.t < bigVol.t).map(p => p.v)) || median(spx.map(p => p.v));
  const jump = Math.round((peakE.floor / pre - 1) * 100);

  const P = 56;
  const X = t => P + ((t - tMin) / tSpan) * (W - 2 * P);

  // ── panel plotter ──────────────────────────────────────────────────────────
  const panel = (yTop, yBot, label, unit, pts, valOf, color, extra = "", floorZero = true) => {
    const vs = pts.map(valOf), vMax = Math.max(...vs) * 1.12;
    const vMin = floorZero ? 0 : Math.min(...vs) * 0.82;
    const Y = v => yBot - ((v - vMin) / (vMax - vMin)) * (yBot - yTop);
    let grid = "", g = 0;
    for (let i = 0; i <= 3; i++) { const v = vMax * i / 3, y = Y(v); grid += `<line x1="${P}" y1="${y.toFixed(1)}" x2="${W - P}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.07)"/><text x="${P - 8}" y="${(y + 5).toFixed(1)}" fill="#7c8a9e" font-size="17" text-anchor="end" font-family="${F}">${unit === "Ξ" ? v.toFixed(2) : Math.round(v).toLocaleString()}</text>`; }
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(valOf(p)).toFixed(1)}`).join(" ");
    return `<text x="${P}" y="${yTop - 14}" fill="#cbd5e1" font-size="22" font-weight="700" font-family="${F}">${esc(label)}</text>${grid}${extra}<path d="${line}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`;
  };

  // panel 1: floor in ETH + volume bars
  const p1Top = AEON_MT + 78, p1Bot = 560;
  const volMax = Math.max(...eth.map(d => d.vol)) * 1.05;
  const bw = Math.max(4, (W - 2 * P) / eth.length - 3);
  let volBars = "";
  for (const d of eth) { const h = (d.vol / volMax) * (p1Bot - p1Top) * 0.62; if (h < 0.5) continue; volBars += `<rect x="${(X(d.t) - bw / 2).toFixed(1)}" y="${(p1Bot - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${d.t === bigVol.t ? "#fb7185" : "#334155"}" fill-opacity="${d.t === bigVol.t ? 0.9 : 0.55}"/>`; }
  // annotate the anomaly day
  const ax = X(bigVol.t), aLbl = `<line x1="${ax.toFixed(1)}" y1="${p1Top}" x2="${ax.toFixed(1)}" y2="${p1Bot}" stroke="#fb7185" stroke-opacity="0.5" stroke-dasharray="4 4"/>` +
    `<rect x="${Math.min(ax + 10, W - P - 300).toFixed(1)}" y="${p1Top + 8}" width="290" height="60" rx="8" fill="#160b12" fill-opacity="0.9" stroke="#fb7185" stroke-opacity="0.5"/>` +
    `<text x="${Math.min(ax + 24, W - P - 286).toFixed(1)}" y="${p1Top + 33}" fill="#fda4af" font-size="19" font-weight="700" font-family="${F}">${new Date(bigVol.t).toISOString().slice(5, 10)} · one buyer</text>` +
    `<text x="${Math.min(ax + 24, W - P - 286).toFixed(1)}" y="${p1Top + 56}" fill="#e2e8f0" font-size="18" font-family="${F}">$${Math.round(bigVol.vol).toLocaleString()} in a day (usual ~$${Math.round(typVol / 100) * 100})</text>`;
  const panel1 = panel(p1Top, p1Bot, "AEON floor · Ξ  (bars = daily volume)", "Ξ", eth, d => d.floor, "#5eead4", volBars + aLbl);

  // panel 2: floor in SPX vs baseline (anchored near the data, not zero, so the reversion reads)
  const p2Top = 640, p2Bot = H - 120;
  const s2Max = Math.max(...spx.map(p => p.v)) * 1.12, s2Min = Math.min(...spx.map(p => p.v)) * 0.82;
  const bY = p2Bot - ((baseS - s2Min) / (s2Max - s2Min)) * (p2Bot - p2Top);
  const baseLine = `<line x1="${P}" y1="${bY.toFixed(1)}" x2="${W - P}" y2="${bY.toFixed(1)}" stroke="#f5d472" stroke-width="2" stroke-dasharray="7 5"/>` +
    `<text x="${W - P}" y="${(bY - 10).toFixed(1)}" fill="#f5d472" font-size="18" text-anchor="end" font-family="${F}">pre-pump baseline ≈ ${Math.round(baseS).toLocaleString()} SPX</text>`;
  const panel2 = panel(p2Top, p2Bot, "AEON floor · priced in SPX6900", "spx", spx, p => p.v, "#a78bfa", baseLine, false);

  const hero = `$${Math.round(bigVol.vol / 1000)}k in a day → floor +${jump}%, then reverted`;
  const foot = `~$${Math.round(typVol / 100) * 100} typical daily volume · in a market this thin, one buyer is the market · reproducible, not a valuation`;

  return png(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("afs", ["#5eead4", "#a78bfa"])}</defs>
${aeonBgRects(W, H, "afs")}
${aeonHeader("ONE BUYER, ONE BROKEN FLOOR", "Project AEON · a thin-market microstructure story", hero, "#5eead4", F)}
${panel1}
${panel2}
<text x="${P}" y="${H - 30}" fill="#6b7688" font-size="18" font-family="${F}">${esc(foot)}</text></svg>`, W);
}
