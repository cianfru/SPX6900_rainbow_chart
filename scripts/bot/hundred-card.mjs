// "$100 → where it went" card: log columns from a $100 baseline showing what an
// identical $100 buy at SPX6900's launch became in SPX6900 vs Bitcoin vs the S&P 500
// vs cash. A visceral, comparative twist on the plain since-launch multiple.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { hundredVsData } from "./hundred-data.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fMoney = v => (v >= 1000 ? "$" + Math.round(v / 1000).toLocaleString() + "k" : "$" + Math.round(v));
const fMon = d => { const t = new Date(d); return t.toLocaleString("en-US", { month: "short" }) + " '" + String(t.getUTCFullYear()).slice(2); };

export function hundredVsSvg(stats, opts = {}) {
  const { items, start, firstDate } = hundredVsData(stats);
  const W = opts.W ?? 1200, H = opts.H ?? 630, mL = 40, mR = 40, mT = 118, mB = 96, pW = W - mL - mR, pH = H - mT - mB;
  const maxV = Math.max(...items.map(i => i.v));
  const top = Math.pow(10, Math.ceil(Math.log10(maxV))); // a decade above the biggest
  const y = v => mT + ((Math.log(top) - Math.log(Math.max(v, start))) / (Math.log(top) - Math.log(start))) * pH;
  const y0 = y(start);

  let grid = "";
  for (const g of [100, 1000, 10000, 100000, 1000000].filter(v => v <= top * 1.001)) {
    const yy = y(g).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${W - mR}" y2="${yy}" stroke="rgba(255,255,255,0.06)"/>`
      + `<text x="${W - mR}" y="${(+yy - 6).toFixed(1)}" fill="#475569" font-size="18" text-anchor="end" font-family="sans-serif">${fMoney(g)}</text>`;
  }
  const gw = pW / items.length, bw = Math.min(150, gw * 0.5);
  let defs = "", bars = "";
  items.forEach((it, i) => {
    const cx = mL + (i + 0.5) * gw, yv = y(it.v), h = y0 - yv, mult = it.v / start;
    defs += `<linearGradient id="hv${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${it.color}" stop-opacity="0.95"/><stop offset="100%" stop-color="${it.color}" stop-opacity="0.5"/></linearGradient>`;
    bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yv.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="7" fill="url(#hv${i})"/>`
      + `<text x="${cx.toFixed(1)}" y="${(yv - 40).toFixed(1)}" fill="${it.color}" font-size="42" font-weight="800" text-anchor="middle" font-family="sans-serif">${fMoney(it.v)}</text>`
      + `<text x="${cx.toFixed(1)}" y="${(yv - 12).toFixed(1)}" fill="#cbd5e1" font-size="22" text-anchor="middle" font-family="sans-serif">${mult >= 10000 ? Math.round(mult).toLocaleString() : mult.toFixed(1)}×</text>`
      + `<text x="${cx.toFixed(1)}" y="${(H - 56).toFixed(1)}" fill="#e2e8f0" font-size="24" font-weight="700" text-anchor="middle" font-family="sans-serif">${esc(it.name)}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defs}<radialGradient id="hvV" cx="18%" cy="0%" r="90%"><stop offset="0%" stop-color="#4ade80" stop-opacity="0.14"/><stop offset="60%" stop-color="#4ade80" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="#05050e"/><rect width="${W}" height="${H}" fill="url(#hvV)"/>
${grid}
<line x1="${mL}" y1="${y0.toFixed(1)}" x2="${W - mR}" y2="${y0.toFixed(1)}" stroke="rgba(255,255,255,0.4)" stroke-dasharray="6 6"/>
${bars}
<text x="40" y="52" fill="#e2e8f0" font-size="31" font-weight="800" font-family="sans-serif" letter-spacing="0.5">$100 AT SPX6900'S LAUNCH — WHERE IT WENT</text>
<text x="40" y="86" fill="#94a3b8" font-size="22" font-family="sans-serif">Same $100 on ${esc(fMon(firstDate))}, invested four ways (log scale)</text>
<text x="40" y="${H - 16}" fill="#475569" font-size="15" font-family="sans-serif">${esc("spx6900rainbow.xyz · not financial advice · SPX/BTC/S&P actual returns since launch · cash = 4.5% APY")}</text>
</svg>`;
}

export function renderHundredVsCard(stats, opts = {}) { return png(hundredVsSvg(stats, { W: opts.W, H: opts.H }), opts.W ?? 1200); }
