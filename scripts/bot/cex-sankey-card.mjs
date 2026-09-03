// "Where the volume goes" — the exchange-flow map, as a rotation card. A venue-centric mini-Sankey:
// supply flowing ONTO the exchanges on the left (neutral — sell-side supply, not a positive), the
// venue stick in the middle, coins leaving to self-custody on the right (green — accumulation). The
// interactive site chart (cexsankey) is the deep, per-wallet version; the card aggregates to the
// venue level so it reads at a glance. Reads public/cex-sankey.json live, so it refreshes daily and
// can be reused as the flows change over time. A flow map, not a forecast.
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe, cardDepth} from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const NEUTRAL = "#94a3b8", GREEN = "#34d399", TEAL = "#5eead4", AMBER = "#fbbf24";
const fM = n => (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? Math.round(Math.abs(n) / 1e3) + "K" : Math.round(Math.abs(n)).toString());

// Aggregate cex-sankey.json to the venue level: per venue total inflow / outflow, biggest first.
// Returns null when the surface isn't there yet, so the rotation just skips the card that day.
export function cexSankeyStats() {
  let data;
  try { data = JSON.parse(readFileSync(new URL("../../public/cex-sankey.json", import.meta.url), "utf8")); } catch { return null; }
  if (!data?.inflow?.length && !data?.outflow?.length) return null;
  const sumV = v => (v.top || []).reduce((s, x) => s + (x.amt || 0), 0) + (v.more?.amt || 0);
  const map = new Map();
  for (const v of data.inflow || []) { const m = map.get(v.venue) || { venue: v.venue, in: 0, out: 0 }; m.in += sumV(v); map.set(v.venue, m); }
  for (const v of data.outflow || []) { const m = map.get(v.venue) || { venue: v.venue, in: 0, out: 0 }; m.out += sumV(v); map.set(v.venue, m); }
  const venues = [...map.values()].map(m => ({ ...m, thru: m.in + m.out })).filter(v => v.thru > 0).sort((a, b) => b.thru - a.thru);
  const totals = data.totals || { in: venues.reduce((s, v) => s + v.in, 0), out: venues.reduce((s, v) => s + v.out, 0) };
  totals.net = (totals.in || 0) - (totals.out || 0);
  return { venues, totals, window: data.window || { days: 90 }, top: venues[0]?.venue || "" };
}

export function cexSankeySvg(opts = {}) {
  const W = opts.W ?? 1200, H = opts.H ?? 630;
  const st = cexSankeyStats();
  if (!st) return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#06070f"/></svg>`;

  // Keep the top venues by throughput; roll the tail into one "others" node so the map stays legible
  // at card scale (the interactive chart is the full per-wallet version).
  const MAX = 6;
  let vs = st.venues;
  if (vs.length > MAX) {
    const head = vs.slice(0, MAX), tail = vs.slice(MAX);
    head.push({ venue: `+${tail.length} more`, in: tail.reduce((s, v) => s + v.in, 0), out: tail.reduce((s, v) => s + v.out, 0), thru: tail.reduce((s, v) => s + v.thru, 0) });
    vs = head;
  }
  const totalThru = vs.reduce((s, v) => s + v.thru, 0) || 1;

  const pT = 214, pB = H - 70, PH = pB - pT;
  const gap = 16, leftEdge = 150, stickL = 578, stickR = 622, rightEdge = 1050;
  // MIN node height guarantees room for every label chip; the remainder is shared proportionally, so
  // the dominant venue still reads tallest without the tail collapsing into an unreadable pile.
  const MINH = 34, freeH = Math.max(0, PH - gap * (vs.length - 1) - MINH * vs.length);

  let cy = pT; const nodes = vs.map(v => {
    const h = MINH + (v.thru / totalThru) * freeH;
    const o = { ...v, ny: cy, nh: h, inH: h * (v.in / v.thru), outH: h * (v.out / v.thru) };
    cy += h + gap; return o;
  });
  const totalInH = nodes.reduce((s, n) => s + n.inH, 0), totalOutH = nodes.reduce((s, n) => s + n.outH, 0);
  let ly = pT + (PH - totalInH) / 2; const leftSlot = new Map();
  for (const n of nodes) { leftSlot.set(n.venue, ly); ly += n.inH; }
  let ry = pT + (PH - totalOutH) / 2; const rightSlot = new Map();
  for (const n of nodes) { rightSlot.set(n.venue, ry); ry += n.outH; }

  const ribbon = (x0, y0t, h0, x1, y1t, h1, fill, op) => {
    const mx = (x0 + x1) / 2, y0b = y0t + h0, y1b = y1t + h1;
    return `<path d="M${x0.toFixed(1)},${y0t.toFixed(1)} C${mx},${y0t.toFixed(1)} ${mx},${y1t.toFixed(1)} ${x1.toFixed(1)},${y1t.toFixed(1)} L${x1.toFixed(1)},${y1b.toFixed(1)} C${mx},${y1b.toFixed(1)} ${mx},${y0b.toFixed(1)} ${x0.toFixed(1)},${y0b.toFixed(1)} Z" fill="${fill}" fill-opacity="${op}"/>`;
  };

  let flows = "", stubs = "", labels = "";
  for (const n of nodes) {
    // inflow ribbon (left slot → top inH of the node), outflow ribbon (bottom outH of node → right slot)
    if (n.in > 0) flows += ribbon(leftEdge, leftSlot.get(n.venue), Math.max(2, n.inH), stickL, n.ny, Math.max(2, n.inH), NEUTRAL, 0.32);
    if (n.out > 0) flows += ribbon(stickR, n.ny + n.inH, Math.max(2, n.outH), rightEdge, rightSlot.get(n.venue), Math.max(2, n.outH), GREEN, 0.34);
    // the venue node itself
    stubs += `<rect x="${stickL}" y="${n.ny.toFixed(1)}" width="${stickR - stickL}" height="${n.nh.toFixed(1)}" rx="3" fill="${TEAL}" fill-opacity="0.95"/>`;
    // label chip to the right of the node (dark, so it reads over the green flows)
    const name = n.venue, fs = 20, ch = fs * 1.7, cw = name.length * fs * 0.6 + 18, lx = stickR + 12, lyy = n.ny + n.nh / 2;
    labels += `<g><rect x="${lx}" y="${(lyy - ch / 2).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="6" fill="#0a0e1c" fill-opacity="0.9" stroke="#284056"/>`
      + `<text x="${(lx + cw / 2).toFixed(1)}" y="${(lyy + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fs}" font-weight="700" fill="#eafff7">${esc(name)}</text></g>`;
  }

  // column captions
  const caps = `<text x="${leftEdge - 4}" y="${pT - 16}" text-anchor="start" font-family="sans-serif" font-size="21" font-weight="700" fill="${NEUTRAL}">supply onto exchanges →</text>`
    + `<text x="${rightEdge + 4}" y="${pT - 16}" text-anchor="end" font-family="sans-serif" font-size="21" font-weight="700" fill="${GREEN}">→ off, to self-custody</text>`;

  // headline metrics
  const net = st.totals.net, netCol = net >= 0 ? AMBER : GREEN;
  const netLab = net >= 0 ? "building on venues" : "leaving to self-custody";
  const metrics = `
    <text x="150" y="150" font-family="sans-serif" font-size="26" font-weight="800" fill="${NEUTRAL}">${fM(st.totals.in)}<tspan font-size="17" font-weight="600" fill="#94a3b8" dx="8">onto</tspan></text>
    <text x="600" y="150" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="800" fill="${GREEN}">${fM(st.totals.out)}<tspan font-size="17" font-weight="600" fill="#94a3b8" dx="8">off</tspan></text>
    <text x="1050" y="150" text-anchor="end" font-family="sans-serif" font-size="26" font-weight="800" fill="${netCol}">${net >= 0 ? "+" : "−"}${fM(net)}<tspan font-size="17" font-weight="600" fill="#94a3b8" dx="8">net · ${esc(netLab)}</tspan></text>`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="skbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#101830"/><stop offset="52%" stop-color="#0a0f1f"/><stop offset="100%" stop-color="#06070f"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#skbg)"/>
${cardDepth(W, H)}${brandStripe(H)}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
<text x="60" y="66" font-size="40" font-weight="800" font-family="sans-serif" letter-spacing="1"><tspan fill="${TEAL}">WHERE THE VOLUME GOES</tspan></text>
<text x="60" y="98" font-size="20" font-family="sans-serif" fill="#94a3b8">Who feeds the exchanges, and who's pulling off — SPX flow by venue, last ${st.window?.days ?? 90} days</text>
${metrics}${caps}${flows}${stubs}${labels}
<text x="60" y="${H - 24}" fill="#94a3b8" font-size="17" font-family="sans-serif" textLength="${W - 120}" lengthAdjust="spacingAndGlyphs">${esc(`spx6900rainbow.xyz · tagged CEX hot wallets, on-chain · onto a venue can be sold, off = self-custody · a flow map, not a forecast`)}</text>
</svg>`;
}

export function renderCexSankeyCard(opts = {}) {
  return png(cexSankeySvg(opts), opts.W ?? 1200);
}
