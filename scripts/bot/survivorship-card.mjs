// "Survivorship" card — who is still holding SPX6900, by when they first bought.
//
// The hero is the LIVING holder base over time, split by arrival VINTAGE: each cohort's band rises
// as they buy in and then DEFLATES as they leave, so the launch crowd balloons in 2023 and shrinks
// to a sliver, while the drawdown/recovery cohorts pile on top and stay. Survivorship, made visible.
//
// The honest twist that keeps it from reading as pure bear: the survivors never sold. 79% of every
// wallet that ever held is gone, but 91% of the ones still here never once sold to zero.
//
// Data: stats.cohorts (public/cohort-survival.json, built daily from the city time-machine).
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { brandStripe } from "./chrome.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return `#${[0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("")}`; };
// oldest → newest, the city's own age ramp (cyan = long-held, amber = fresh)
const vintageColour = (i, n) => mix("#22d3ee", "#f6a23c", n <= 1 ? 0 : i / (n - 1));
const shortLab = l => l.replace(" H1", "·H1").replace(" H2", "·H2").replace("20", "'");

export function survivorshipSvg(stats, opts = {}) {
  const S = stats.cohorts;
  if (!S?.overall?.everHeld || !Array.isArray(S.weekly) || S.weekly.length < 40) return null;
  const cohorts = S.cohorts.filter(c => c.arrived > 0);
  const nC = cohorts.length;
  const week0 = Date.parse(S.week0);
  const active = cohorts.map(c => S.cohorts.indexOf(c));   // column index into weekly[]

  const W = opts.W ?? 1200, H = opts.H ?? 675, mL = 92, mR = 230, mT = 208, mB = 92, pW = W - mL - mR, pH = H - mT - mB;
  const nW = S.weekly.length;
  const x = w => mL + (w / (nW - 1)) * pW;
  const totalAt = w => active.reduce((s, ci) => s + S.weekly[w][ci], 0);
  const yMax = Math.ceil(Math.max(...S.weekly.map((_, w) => totalAt(w))) * 1.06 / 500) * 500;
  const y = v => mT + (1 - v / yMax) * pH;
  const stackTo = (w, k) => { let s = 0; for (let j = 0; j <= k; j++) s += S.weekly[w][active[j]]; return s; };

  // ribbons, oldest at the bottom
  let ribbons = "";
  for (let k = 0; k < nC; k++) {
    const top = [], bot = [];
    for (let w = 0; w < nW; w++) { top.push(`${x(w).toFixed(1)},${y(stackTo(w, k)).toFixed(1)}`); }
    for (let w = nW - 1; w >= 0; w--) { bot.push(`${x(w).toFixed(1)},${y(k === 0 ? 0 : stackTo(w, k - 1)).toFixed(1)}`); }
    ribbons += `<polygon points="${top.join(" ")} ${bot.join(" ")}" fill="${vintageColour(k, nC)}" fill-opacity="0.9" stroke="#05050e" stroke-width="0.5"/>`;
  }

  // y gridlines
  let grid = "";
  const step = yMax / 4;
  for (let v = 0; v <= yMax; v += step) {
    const yy = y(v).toFixed(1);
    grid += `<line x1="${mL}" y1="${yy}" x2="${mL + pW}" y2="${yy}" stroke="rgba(255,255,255,0.07)"/>`
      + `<text x="${mL - 12}" y="${(+yy + 7).toFixed(1)}" fill="#94a3b8" font-size="21" text-anchor="end" font-family="${FONT[0] || "sans-serif"}">${v >= 1000 ? (v / 1000) + "k" : v}</text>`;
  }
  // x year labels
  let xlab = "";
  const y0 = new Date(week0).getUTCFullYear(), y1 = new Date(week0 + (nW - 1) * 7 * 864e5).getUTCFullYear();
  for (let yr = y0; yr <= y1; yr++) {
    const t = Date.UTC(yr, 0, 1); const wk = Math.round((t - week0) / (7 * 864e5));
    if (wk < 0 || wk >= nW) continue;
    xlab += `<text x="${x(wk).toFixed(1)}" y="${H - 42}" fill="#94a3b8" font-size="21" text-anchor="middle" font-family="${FONT[0] || "sans-serif"}">${yr}</text>`;
  }

  // legend: each vintage + how many of it survive. Adaptive so it always fits the plot height —
  // two-line rows for a handful of cohorts, compact one-line ("'26 Q3 · 86%") once there are many
  // (quarterly = 13), so the newest/oldest never spill into the footer.
  const LF = FONT[0] || "sans-serif";
  const twoLine = nC <= 9;
  const rowH = twoLine ? 47 : Math.min(40, (pH - 6) / nC);
  let legend = "", ly = mT + 6;
  for (let k = nC - 1; k >= 0; k--) {                       // newest at top of the legend
    const c = cohorts[k];
    legend += `<rect x="${mL + pW + 16}" y="${(ly - 11).toFixed(1)}" width="13" height="13" rx="3" fill="${vintageColour(k, nC)}"/>`;
    if (twoLine) {
      legend += `<text x="${mL + pW + 36}" y="${ly.toFixed(1)}" fill="#cbd5e1" font-size="19" font-family="${LF}">${esc(shortLab(c.label))}</text>`
        + `<text x="${mL + pW + 36}" y="${(ly + 21).toFixed(1)}" fill="#64748b" font-size="17" font-family="${LF}">${esc(`${c.survivalPct}% still hold`)}</text>`;
    } else {
      legend += `<text x="${mL + pW + 36}" y="${(ly + 3).toFixed(1)}" fill="#cbd5e1" font-size="18" font-family="${LF}">${esc(shortLab(c.label))}</text>`
        + `<text x="${W - 20}" y="${(ly + 3).toFixed(1)}" fill="#94a3b8" font-size="18" text-anchor="end" font-family="${LF}">${esc(`${c.survivalPct}%`)}</text>`;
    }
    ly += rowH;
  }

  const F = FONT[0] || "sans-serif";
  const launchLab = cohorts[0]?.label || "launch";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="svbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d0b18"/><stop offset="100%" stop-color="#05050e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#svbg)"/>
${brandStripe(H)}
<text x="60" y="58" fill="#f1f5f9" font-size="38" font-weight="700" font-family="${F}" letter-spacing="0.5">SPX6900 — WHO'S STILL HERE</text>
<text x="60" y="100" fill="#94a3b8" font-size="22" font-family="${F}">Every holder, coloured by when they first bought — each vintage rises, then thins as it leaves.</text>
<text x="60" y="150" fill="#f43f5e" font-size="33" font-weight="700" font-family="${F}">${esc(`${S.overall.gonePct}% of wallets that ever held SPX are gone.`)}</text>
<text x="60" y="188" fill="#22d3ee" font-size="25" font-weight="700" font-family="${F}">${esc(`The ${shortLab(launchLab)} launch crowd: ${cohorts[0]?.survivalPct ?? 0}% remain — yet ${S.overall.diamondPct}% of today's holders never sold.`)}</text>
${ribbons}${grid}${xlab}${legend}
<text x="60" y="${H - 16}" fill="#5b6577" font-size="20" font-family="${F}">${esc("living holders ≥5,000 SPX, by arrival era · self-custody, exchanges & contracts excluded · survivorship, not a forecast")}</text>
</svg>`;
}

export function renderSurvivorshipCard(stats, opts = {}) {
  const svg = survivorshipSvg(stats, opts);
  return svg ? png(svg, opts.width ?? 1200) : null;
}
