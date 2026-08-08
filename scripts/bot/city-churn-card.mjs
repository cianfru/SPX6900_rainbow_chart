// "The city keeps turning over" — the churn beneath the citizen count. Arrivals (green, up) vs
// departures (red, down) each period as diverging bars, on the dusk-city background with its skyline.
// The headline stat is survivorship: only a sliver of the launch-week residents remain, yet the city
// grew many times over — pure turnover. Data: public/city-history.json (flow + founders).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { cityBg } from "./city-card-bg.mjs";
import { loadCityHistory } from "./city-growth-card.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const fNum = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toString();

let _cache;
export function cityChurnStats() {
  if (_cache !== undefined) return _cache;
  const d = loadCityHistory();
  if (!d?.flow?.length) return (_cache = null);
  const NC = d.labels.length;
  const totIn = d.flow.reduce((s, f) => s + f[1], 0), totOut = d.flow.reduce((s, f) => s + f[2], 0);
  const n0 = d.founders?.n0 || 0, left = d.founders?.series?.at(-1)?.[1] ?? 0;
  const cNow = d.rows.at(-1).slice(2, 2 + NC).reduce((s, v) => s + v, 0);
  const c0 = d.rows[0].slice(2, 2 + NC).reduce((s, v) => s + v, 0);
  return (_cache = { totIn, totOut, n0, left, survPct: n0 ? left / n0 * 100 : 0, citizens: cNow, growth: c0 ? cNow / c0 : 0 });
}

export function cityChurnSvg(doc, opts = {}) {
  const flow = doc.flow.map(([d, a, dp]) => ({ ts: Date.parse(d), a, dp })).filter(r => Number.isFinite(r.ts)).sort((x, y) => x.ts - y.ts);
  const s = cityChurnStats();
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 76, mR = 52, mT = 172, mB = 74, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = flow[0].ts, t1 = flow.at(-1).ts;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  // scale to the ~92nd percentile so the typical weeks FILL the panel; the launch spike clips + is annotated.
  const vals = flow.flatMap(r => [r.a, r.dp]).filter(v => v > 0).sort((a, b) => a - b);
  const p92 = vals[Math.floor(vals.length * 0.92)] || 1;
  const maxV = Math.max(20, p92) * 1.12;
  const y0 = mT + pH / 2;                                   // zero line (middle)
  const clamp = v => Math.min(v, maxV);
  const yUp = v => y0 - (clamp(v) / maxV) * (pH / 2);
  const yDn = v => y0 + (clamp(v) / maxV) * (pH / 2);
  const bw = Math.max(1.4, pW / flow.length * 0.7);

  let bars = "";
  for (const r of flow) {
    const cx = x(r.ts);
    if (r.a) bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yUp(r.a).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - yUp(r.a)).toFixed(1)}" fill="#4ade80" fill-opacity="0.9"/>`;
    if (r.dp) bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yDn(r.dp) - y0).toFixed(1)}" fill="#f87171" fill-opacity="0.88"/>`;
  }
  // annotate the launch spike if it clips the top
  const peak = flow.reduce((m, r) => r.a > m.a ? r : m, flow[0]);
  const spikeNote = peak.a > maxV ? `<text x="${(x(peak.ts) + 10).toFixed(1)}" y="${(mT + 4).toFixed(1)}" fill="#86efac" font-size="17" font-family="sans-serif">launch +${peak.a}</text>` : "";
  // y ticks (arrivals up, departures down) — sparse, placed just inside the axis so they clear the skyline
  let grid = "";
  const stepv = maxV > 160 ? 100 : maxV > 80 ? 50 : maxV > 40 ? 25 : 10;
  for (let v = stepv; v <= maxV; v += stepv) {
    for (const yy of [yUp(v), yDn(v)]) grid += `<line x1="${mL}" y1="${yy.toFixed(1)}" x2="${W - mR}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,0.06)"/>`;
    grid += `<text x="${mL + 8}" y="${(yUp(v) - 4).toFixed(1)}" fill="#86efac" font-size="17" font-family="sans-serif">${v}</text>`
      + `<text x="${mL + 8}" y="${(yDn(v) + 17).toFixed(1)}" fill="#fca5a5" font-size="17" font-family="sans-serif">${v}</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 44}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
${cityBg(W, H, { glow: "#4ade80", maxTower: 0.17 })}
${brandStripe(H)}
<text x="60" y="60" fill="#f8fafc" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1">THE CITY KEEPS TURNING OVER</text>
<text x="60" y="104" fill="#86efac" font-size="30" font-weight="800" font-family="sans-serif">${fNum(s.totIn)} moved in · ${fNum(s.totOut)} moved out</text>
<text x="60" y="142" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`Only ${s.left} of the ${s.n0.toLocaleString()} launch-week residents remain (${s.survPct.toFixed(0)}%) — yet the city is ${s.growth.toFixed(1)}× bigger. Survivorship.`)}</text>
<text x="${W - mR}" y="${(mT - 18).toFixed(1)}" fill="#86efac" font-size="18" text-anchor="end" font-family="sans-serif">▲ arrived</text>
<text x="${W - mR}" y="${(H - mB + 26).toFixed(1)}" fill="#fca5a5" font-size="18" text-anchor="end" font-family="sans-serif">▼ left</text>
${grid}${xlab}${bars}${spikeNote}
<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="#cbd5e1" stroke-width="2" stroke-opacity="0.7"/>
<text x="60" y="${H - 18}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · resident = ≥5,000 SPX held 90 days · arrivals vs departures per week · ETH-native · not financial advice")}</text>
</svg>`;
}

export function renderCityChurnCard(_stats, opts = {}) {
  const doc = loadCityHistory();
  return doc?.flow?.length ? png(cityChurnSvg(doc, { W: opts.W, H: opts.H }), opts.W ?? 1200) : null;
}
