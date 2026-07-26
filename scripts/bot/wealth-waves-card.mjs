// SPX6900 — THE WEALTH LADDER. HODL waves cut by what a wallet is WORTH.
//
// Wallet-size waves ask who owns the supply. This asks what that ownership was worth
// in dollars, which is the question people actually have, and it needs stating plainly
// what it is measuring, because a dollar axis on a coin that ran 150× is easy to
// misread.
//
// SO: HEADCOUNT, NOT SHARE OF SUPPLY. The share-of-supply version was computed first
// and rejected. Split the supply into dollar brackets and the top bracket goes from
// 9% to 82%, which looks like a dramatic redistribution and is not one — hold the
// price fixed at today's and re-run it, and only 24 of the 145 points of movement
// survive. 83% of that chart would have been the price, wearing a distribution
// chart's clothes. That is the same error as fitting fair value on asking prices, and
// it flatters, which is the direction this project cannot afford.
//
// Counting WALLETS per bracket has no such disguise. Everyone reads "how many wallets
// were worth over $100k" as a number that moves with price, because it obviously does.
// It is honest about being a wealth chart rather than pretending to be a flow chart,
// and the shape is the real story: 1,180 wallets held over $100k at the July 2025 top,
// 287 do now.
//
// Data: public/onchain.json → wealth[] (weekly, wallet counts per USD bracket).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";

// RICHEST AT THE BOTTOM, which inverts the HODL-waves convention on purpose. The band
// this card is about is 0.6% of holders; stacked on top it is a sliver pinned against
// the 100% line and unreadable. On the baseline it reads as a rising floor, and its
// swelling at each market top — the actual story — is visible.
const BANDS = [
  { k: "$100k+", c: "#818cf8" },
  { k: "$10k–100k", c: "#22d3ee" },
  { k: "$1k–10k", c: "#84cc16" },
  { k: "$100–1k", c: "#f59e0b" },
  { k: "<$100", c: "#fb7185" },
];
// wealth[] is emitted smallest-bracket-first; the stack draws richest-first.
const ORDER = [4, 3, 2, 1, 0];

const kfmt = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

/** Headline facts, shared by the card and its post copy so the two cannot drift. */
export function wealthWavesStats(stats) {
  const rows = (stats?.onchain || [])
    .filter(r => Array.isArray(r?.wealth) && r.wealth.length === 5 && r.holders > 1000)
    .map(r => ({ t: Date.parse(r.d), d: r.d, w: r.wealth, spot: r.spot, n: r.wealth.reduce((a, b) => a + b, 0) }))
    .filter(r => Number.isFinite(r.t) && r.n > 0);
  if (rows.length < 40) return null;
  const cur = rows.at(-1);
  // The high-water mark for the top bracket, which is where the drawdown reads from.
  let peak = rows[0];
  for (const r of rows) if (r.w[4] > peak.w[4]) peak = r;
  const rich = r => r.w[3] + r.w[4];
  return {
    rows,
    now: cur, peak,
    nowRich: cur.w[4], peakRich: peak.w[4],
    nowOver10k: rich(cur), peakOver10k: rich(peak),
    peakMonth: new Date(peak.t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
  };
}

export function wealthWavesSvg(stats, opts = {}) {
  const S = wealthWavesStats(stats);
  if (!S) return null;
  const { rows, now, peak } = S;

  const W = opts.W ?? 1200, H = opts.H ?? 800;
  const mL = 96, mR = 208, mT = 196, mB = 88;
  const pW = W - mL - mR, pH = H - mT - mB;
  const t0 = rows[0].t, t1 = rows.at(-1).t;
  const x = t => mL + ((t - t0) / ((t1 - t0) || 1)) * pW;
  const y = v => mT + (1 - v / 100) * pH;

  let grid = "";
  for (let v = 0; v <= 100; v += 25) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="${F}">${v}%</text>`;
  }
  let xlab = "";
  for (let yr = new Date(t0).getUTCFullYear(); yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t < t0 || t > t1) continue;
    xlab += `<text x="${x(t).toFixed(1)}" y="${H - 42}" fill="#94a3b8" font-size="22" text-anchor="middle" font-family="${F}">${yr}</text>`;
  }

  // Each week normalised to its own holder count, so the bands read as a distribution
  // rather than being swamped by the holder base going from 1.2k to 49.5k.
  // cum[i][k] = share of holders in the first k+1 bands of the drawing order.
  const cum = rows.map(r => {
    const o = []; let a = 0;
    for (const src of ORDER) { a += 100 * r.w[src] / r.n; o.push(a); }
    return o;
  });
  const last = cum.at(-1);

  // The rich brackets sit on the baseline and are thin, so their natural midpoints are
  // within a few pixels of each other. Labels walk UPWARD from the bottom keeping two
  // line-heights of clearance, which is the direction the stack runs.
  let ribbons = "", legend = "", prevY = Infinity;
  for (let b = 0; b < BANDS.length; b++) {
    const upper = rows.map((r, i) => `${x(r.t).toFixed(1)},${y(cum[i][b]).toFixed(1)}`);
    const lower = rows.map((r, i) => `${x(r.t).toFixed(1)},${y(b === 0 ? 0 : cum[i][b - 1]).toFixed(1)}`).reverse();
    ribbons += `<polygon points="${upper.concat(lower).join(" ")}" fill="${BANDS[b].c}" fill-opacity="0.88"/>`;

    const mid = ((b === 0 ? 0 : last[b - 1]) + last[b]) / 2;
    const ly = Math.max(mT + 18, Math.min(mT + pH - 26, y(mid), prevY - 46));
    prevY = ly;
    legend += `<rect x="${mL + pW + 14}" y="${(ly - 9).toFixed(1)}" width="13" height="13" rx="3" fill="${BANDS[b].c}"/>`
      + `<text x="${mL + pW + 34}" y="${(ly + 2).toFixed(1)}" fill="#cbd5e1" font-size="20" font-family="${F}">${esc(BANDS[b].k)}</text>`
      + `<text x="${mL + pW + 34}" y="${(ly + 24).toFixed(1)}" fill="#64748b" font-size="18" font-family="${F}">${esc(`${kfmt(now.w[ORDER[b]])} wallets`)}</text>`;
  }

  // A marker at the high-water mark, since the whole card is a story about that peak.
  // Anchored away from whichever edge it is nearer, so the label cannot run off.
  const px = x(peak.t), rightHalf = px > mL + pW * 0.55;
  const marker = peak.t > t0 && peak.t < t1
    ? `<line x1="${px.toFixed(1)}" y1="${mT}" x2="${px.toFixed(1)}" y2="${mT + pH}" stroke="#f8fafc" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="7 6"/>`
      + `<text x="${(px + (rightHalf ? -12 : 12)).toFixed(1)}" y="${mT + 30}" fill="#f1f5f9" font-size="20" font-family="${F}"`
      + ` text-anchor="${rightHalf ? "end" : "start"}">${esc(`${S.peakMonth} top · ${S.peakRich.toLocaleString("en-US")} over $100k`)}</text>`
    : "";

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="wlbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#wlbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — THE WEALTH LADDER</text>
<text x="60" y="100" fill="#94a3b8" font-size="22" font-family="${F}">How many holders sit in each dollar bracket, week by week.</text>
<text x="60" y="148" fill="#818cf8" font-size="34" font-weight="700" font-family="${F}">${esc(`${S.nowRich.toLocaleString("en-US")} wallets hold over $100k — ${S.peakRich.toLocaleString("en-US")} did at the top`)}</text>
${ribbons}${grid}${marker}${xlab}${legend}
<text x="60" y="${H - 18}" fill="#5b6577" font-size="21" font-family="${F}">${esc("share of holders by wallet value · brackets move with price · exchanges and contracts excluded")}</text>
</svg>`;
}

export function renderWealthWavesCard(stats, opts = {}) {
  const svg = wealthWavesSvg(stats, opts);
  return svg ? png(svg, opts.W ?? 1200) : null;
}
