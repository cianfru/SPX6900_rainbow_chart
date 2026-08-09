// "Is SPX6900's float drying up?" — an honest, reproducible response to the low-float / diamond-hands
// thesis (e.g. Murad's "~5% turning over → Doge-style move"). The nuance the chain shows: ~5% IS the
// MONTHLY turnover, but ~40% of supply changes hands within a YEAR — held ≠ frozen. A single bar of
// held supply by time-since-last-move (recently traded → dormant), with the long-term-held share and
// the Bitcoin same-age comparison. Data: stats.onchain (FIFO age bands + 155d liquidity), BTC_HODL.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";
import { spxLiquidity, btcIlliquid } from "../../src/liquidity.js";
import { BTC_HODL } from "../../src/btc-hodl-waves.js";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const DAY = 864e5;
// held supply by age since last move: recently traded (warm) → dormant (cool)
const BANDS = [
  { label: "< 1 month", c: "#f87171" },
  { label: "1–3 months", c: "#fb923c" },
  { label: "3–6 months", c: "#fbbf24" },
  { label: "6–12 months", c: "#38bdf8" },
  { label: "held 1 year+", c: "#818cf8" },
];

export function floatCheckStats(stats) {
  const oc = (stats.onchain || []).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
  if (oc.length < 20) return null;
  const last = oc.at(-1), age = last.age;
  const within1m = age[0], within1y = age[0] + age[1] + age[2] + age[3], dormant = age[4];
  const liq = spxLiquidity(stats.onchain || []);
  const illiqPct = liq.length ? liq.at(-1).illiqPct : null;
  // Bitcoin's illiquid share at the SAME age (days since each asset's launch)
  const btc = btcIlliquid(BTC_HODL);
  let btcIlliq = null;
  if (btc.length && oc[0].d) {
    const spxAge = Date.parse(last.d) - Date.parse(oc[0].d), target = btc[0].ts + spxAge;
    btcIlliq = btc.reduce((a, b) => Math.abs(b.ts - target) < Math.abs(a.ts - target) ? b : a).illiqPct;
  }
  return { age, within1m, within1y, dormant, illiqPct, btcIlliq };
}

export function floatCheckSvg(stats, opts = {}) {
  const s = floatCheckStats(stats);
  if (!s) return null;
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 60, mR = 58;
  const barY = 300, barH = 82, pW = W - mL - mR;
  // one stacked bar of the 5 age bands (share of held supply)
  let x = mL, seg = "", labels = "";
  s.age.forEach((v, i) => {
    const w = pW * v / 100;
    seg += `<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(0, w).toFixed(1)}" height="${barH}" fill="${BANDS[i].c}" fill-opacity="0.92"/>`;
    if (v >= 4) seg += `<text x="${(x + w / 2).toFixed(1)}" y="${barY + barH / 2 + 9}" fill="#0b0b16" font-size="24" font-weight="800" text-anchor="middle" font-family="sans-serif">${Math.round(v)}%</text>`;
    // legend chip below
    const lx = mL + i * (pW / 5);
    labels += `<rect x="${lx}" y="${barY + barH + 26}" width="16" height="16" rx="3" fill="${BANDS[i].c}"/>`
      + `<text x="${lx + 22}" y="${barY + barH + 39}" fill="#c3cedd" font-size="17" font-family="sans-serif">${esc(BANDS[i].label)}</text>`;
    x += w;
  });
  // brackets: moved within a year (left) vs dormant 1y+ (right)
  const splitX = mL + pW * s.within1y / 100;
  const bracket = (x1, x2, y, txt, col) => {
    const midX = (x1 + x2) / 2;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="2"/>`
      + `<line x1="${x1}" y1="${y}" x2="${x1}" y2="${y + 8}" stroke="${col}" stroke-width="2"/>`
      + `<line x1="${x2}" y1="${y}" x2="${x2}" y2="${y + 8}" stroke="${col}" stroke-width="2"/>`
      + `<text x="${midX}" y="${y - 8}" fill="${col}" font-size="19" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(txt)}</text>`;
  };

  const btcTxt = s.btcIlliq != null ? ` — stickier than Bitcoin at the same age (${Math.round(s.btcIlliq)}%)` : "";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="fcbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b0b16"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#fcbg)"/>
${brandStripe(H)}
<text x="60" y="62" fill="#f8fafc" font-size="41" font-weight="800" font-family="sans-serif" letter-spacing="1">IS SPX6900'S FLOAT DRYING UP?</text>
<text x="60" y="108" fill="#4ade80" font-size="30" font-weight="800" font-family="sans-serif">~${Math.round(s.within1m)}% turns over in a month — ${Math.round(s.within1y)}% within a year</text>
<text x="60" y="148" fill="#a5b4c8" font-size="21" font-family="sans-serif">${esc(`${Math.round(s.illiqPct)}% held long-term (155 days+)${s.btcIlliq != null ? `, vs Bitcoin's ${Math.round(s.btcIlliq)}% at the same age` : ""}. Held, not locked.`)}</text>
<text x="60" y="${barY - 40}" fill="#8fa0b6" font-size="19" font-family="sans-serif">Held supply, by time since it last moved</text>
${bracket(mL, splitX, barY - 12, `moved within a year · ${Math.round(s.within1y)}%`, "#86efac")}
${bracket(splitX, W - mR, barY - 12, `dormant 1 year+ · ${Math.round(s.dormant)}%`, "#a5b4fc")}
${seg}${labels}
<text x="60" y="${H - 22}" fill="#8592a6" font-size="18" font-family="sans-serif">${esc("spx6900rainbow.xyz · ETH-native · reconstructed from on-chain transfer history · reproducible · not financial advice")}</text>
</svg>`;
}

export function renderFloatCheckCard(stats, opts = {}) {
  const svg = floatCheckSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
