// "Liveliness" card. Every coin accrues coin-days as it sits still; spending it destroys
// them. Liveliness = all the coin-days ever destroyed ÷ all the coin-days ever created. It
// RISES when long-dormant coins wake up and move (distribution) and FALLS when the base
// sits tight and accumulates (HODLing) — a slow, cumulative read of holder conviction that
// a price chart can't show. From the LOCAL FIFO per-lot engine (each lot's age at the moment
// it's spent). Data: stats.fifo (liveliness + dormancy per weekly window). Behaviour, not a signal.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const ACC = "#22d3ee";

export function livelinessSvg(stats, opts = {}) {
  const raw = (stats.fifo || []).filter(r => Number.isFinite(r.liveliness) && r.liveliness > 0 && r.d)
    .map(r => ({ ts: Date.parse(r.d), v: r.liveliness, dorm: r.dormancy })).sort((a, b) => a.ts - b.ts);
  if (raw.length < 50) return null;
  const cur = raw.at(-1);
  // direction over the trailing ~quarter (13 weekly samples) — is conviction deepening or easing?
  const back = raw[Math.max(0, raw.length - 14)];
  const rising = cur.v > back.v + 0.002;

  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 96, mR = 44, mT = 152, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const t0 = raw[0].ts, t1 = cur.ts;
  const vals = raw.map(r => r.v);
  const lo = Math.max(0, Math.min(...vals) - 0.02), hi = Math.min(1, Math.max(...vals) + 0.02);
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * pH;

  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const v = lo + (i / 4) * (hi - lo), yy = y(v).toFixed(1);
    grid += `<text x="${mL - 12}" y="${(+yy + 8).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="sans-serif">${v.toFixed(2)}</text>`;
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 46}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="sans-serif">${yr}</text>`;
  }

  const line = raw.map(r => `${x(r.ts).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
  const fill = `${mL},${(mT + pH).toFixed(1)} ${line} ${x(t1).toFixed(1)},${(mT + pH).toFixed(1)}`;
  const curX = x(cur.ts), curY = y(cur.v);
  const state = rising ? "old coins waking up — distribution" : "coins sitting tight — accumulation";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="lvbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient>
<linearGradient id="lvF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${ACC}" stop-opacity="0.30"/><stop offset="100%" stop-color="${ACC}" stop-opacity="0.02"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#lvbg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<text x="60" y="58" fill="#f8fafc" font-size="39" font-weight="800" font-family="sans-serif" letter-spacing="1">SPX6900 — LIVELINESS</text>
<text x="60" y="92" fill="#aab6c8" font-size="22" font-family="sans-serif">Coin-days destroyed vs created. Rising = long-held coins moving; falling = the base holding tight.</text>
<text x="60" y="130" fill="${ACC}" font-size="32" font-weight="800" font-family="sans-serif">${cur.v.toFixed(2)} — ${state}</text>
${grid}${xlab}
<polygon points="${fill}" fill="url(#lvF)"/>
<polyline points="${line}" fill="none" stroke="#e2e8f0" stroke-width="5.2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="12" fill="${ACC}" stroke="#05050e" stroke-width="3"/>
<text x="60" y="${H - 20}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · coin-days destroyed ÷ created, weekly (FIFO per-lot)")}</text>
</svg>`;
}

export function renderLivelinessCard(stats, opts = {}) {
  const svg = livelinessSvg(stats, { W: opts.W, H: opts.H });
  return svg ? png(svg, opts.W ?? 1200) : null;
}
