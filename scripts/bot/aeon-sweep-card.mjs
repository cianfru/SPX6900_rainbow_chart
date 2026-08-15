// PROJECT AEON — "wallet sweep" event card. When ONE wallet scoops several pieces in a
// short window, this shows the actual haul: the grid of NFTs it bought, what it spent, and
// over how long. Sibling of the notable-SALE card (one piece) — this is the accumulation
// story (many pieces, one buyer), the thing that moved the floor 100% in July.
//
// Art is fetched and EMBEDDED as data URIs (resvg doesn't resolve remote hrefs). A tile with
// no art falls back to a labelled placeholder, so a partial art fetch never fails the card.
import { Resvg } from "@resvg/resvg-js";
import { FONT } from "./font.mjs";
import { esc } from "./svg-util.mjs";
import { aeonBgDefs, aeonBgRects, aeonHeader, AEON_MT } from "./aeon-card-bg.mjs";

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
const F = "sans-serif";
const short = a => a.slice(0, 6) + "…" + a.slice(-4);
const fEth = v => (v < 0.1 ? v.toFixed(3) : v.toFixed(2)) + "Ξ";
const dayMinus = (d, n) => new Date(Date.parse(d + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);

/**
 * Detect wallet SWEEPS — a buyer taking ≥minN distinct tokens inside a `days`-day window.
 * Pure + unit-tested. trades = aeon-sales.json .trades ([{f,to,token,eth,usd,d}]).
 * Returns the best window per buyer (most tokens, then most recent), sorted biggest first.
 * opts.freshDays: keep only sweeps whose window END is within that many days of asOf.
 */
export function detectSweeps(trades, { days = 3, minN = 3, freshDays = null, asOf = null } = {}) {
  const t = Array.isArray(trades) ? trades : [];
  const dates = t.map(x => x.d).filter(Boolean).sort();
  const last = asOf || dates.at(-1) || null;
  const freshCut = freshDays != null && last ? dayMinus(last, freshDays - 1) : null;

  const byBuyer = new Map();
  for (const x of t) { if (!x.to || !x.d || x.token == null) continue; (byBuyer.get(x.to) || byBuyer.set(x.to, []).get(x.to)).push(x); }

  const sweeps = [];
  for (const [a, buys] of byBuyer) {
    buys.sort((p, q) => (p.d < q.d ? -1 : p.d > q.d ? 1 : 0));
    let best = null;
    for (let i = 0; i < buys.length; i++) {
      const startMs = Date.parse(buys[i].d + "T00:00:00Z"), endMs = startMs + (days - 1) * 864e5;
      const win = buys.filter(b => { const m = Date.parse(b.d + "T00:00:00Z"); return m >= startMs && m <= endMs; });
      const tokens = [...new Set(win.map(b => b.token))];
      if (tokens.length < minN) continue;
      const end = win.map(b => b.d).sort().at(-1), span = Math.round((Date.parse(end) - startMs) / 864e5) + 1;
      const cand = {
        a, n: tokens.length, start: buys[i].d, end, span, tokens,
        eth: win.reduce((s, b) => s + (b.eth || 0), 0), usd: win.reduce((s, b) => s + (b.usd || 0), 0),
      };
      // best = most tokens, then most recent window end
      if (!best || cand.n > best.n || (cand.n === best.n && cand.end > best.end)) best = cand;
    }
    if (best && (!freshCut || best.end >= freshCut)) sweeps.push(best);
  }
  return sweeps.sort((x, y) => y.n - x.n || (y.end < x.end ? -1 : 1));
}

/**
 * Render the sweep card. sweep = a detectSweeps() item; arts = Map/obj id→dataURI|null;
 * ranks = optional id→rank for the tile labels.
 */
export function aeonSweepSvg(sweep, opts = {}) {
  const { W = 1080, H = 1080 } = opts;
  const arts = opts.arts || {};
  const ranks = opts.ranks || {};
  const getArt = id => (arts instanceof Map ? arts.get(id) : arts[id]) || null;

  const single = sweep.span <= 1;
  const heroTxt = `One wallet swept ${sweep.n} AEON ${single ? "in a single day" : `in ${sweep.span} days`}`;
  const spent = `${fEth(sweep.eth)}${sweep.usd ? ` · $${Math.round(sweep.usd).toLocaleString("en-US")}` : ""}`;
  const avg = sweep.n ? sweep.eth / sweep.n : 0;

  // grid of the pieces — sized to FILL the frame. A small sweep (3 pieces) used to sit as a
  // thin row of thumbnails over a big empty gap; instead pick the column count that makes the
  // square tiles as LARGE as possible for this count, centre the block on both axes, and centre
  // any short final row. So 3 pieces become a big 2-over-1, 4 a 2×2, etc — no dead space.
  const P = 48, gap = 16;
  const shown = Math.min(sweep.n, 12);
  const ids = sweep.tokens.slice(0, shown);
  const gridTop = AEON_MT + 96, gridBottom = H - 92;
  const availW = W - 2 * P, availH = gridBottom - gridTop;
  let cols = 1, cell = 0;
  for (let c = 1; c <= shown; c++) {
    const r = Math.ceil(shown / c);
    const s = Math.min((availW - (c - 1) * gap) / c, (availH - (r - 1) * gap) / r);
    if (s > cell) { cell = s; cols = c; }
  }
  const rows = Math.ceil(shown / cols);
  const gy0 = gridTop + (availH - (rows * cell + (rows - 1) * gap)) / 2;   // vertically centred

  let tiles = "";
  ids.forEach((id, i) => {
    const r = Math.floor(i / cols), colInRow = i - r * cols;
    const inRow = Math.min(cols, shown - r * cols);                        // this row may be short
    const rx0 = (W - (inRow * cell + (inRow - 1) * gap)) / 2;             // centre each row
    const cx = rx0 + colInRow * (cell + gap), cy = gy0 + r * (cell + gap);
    const X = cx.toFixed(1), Y = cy.toFixed(1), S = cell.toFixed(1);
    const art = getArt(id), clip = `sw${i}`;
    const last = i === shown - 1 && sweep.n > shown;
    tiles += `<clipPath id="${clip}"><rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14"/></clipPath>`;
    tiles += art
      ? `<image href="${art}" x="${X}" y="${Y}" width="${S}" height="${S}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`
      : `<rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="#0a0e1c"/><text x="${(cx + cell / 2).toFixed(1)}" y="${(cy + cell / 2).toFixed(1)}" fill="#475569" font-size="24" text-anchor="middle" font-family="${F}">#${id}</text>`;
    tiles += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="none" stroke="#5eead4" stroke-opacity="0.5" stroke-width="2"/>`;
    // id chip
    tiles += `<rect x="${(cx + 8).toFixed(1)}" y="${(cy + cell - 34).toFixed(1)}" width="${Math.min(cell - 16, 90).toFixed(1)}" height="26" rx="7" fill="#05050b" fill-opacity="0.74"/><text x="${(cx + 17).toFixed(1)}" y="${(cy + cell - 15).toFixed(1)}" fill="#cbd5e1" font-size="17" font-family="${F}">#${id}</text>`;
    if (last) tiles += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="#05050b" fill-opacity="0.62"/><text x="${(cx + cell / 2).toFixed(1)}" y="${(cy + cell / 2 + 12).toFixed(1)}" fill="#eafff7" font-size="38" font-weight="700" text-anchor="middle" font-family="${F}">+${sweep.n - shown + 1}</text>`;
  });

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${aeonBgDefs("asw", ["#5eead4", "#7c3aed"])}</defs>
${aeonBgRects(W, H, "asw")}
${aeonHeader("PROJECT AEON — WALLET SWEEP", `${short(sweep.a)} · ${single ? sweep.start : `${sweep.start} → ${sweep.end}`}`, heroTxt, "#5eead4", F)}
<text x="${P}" y="${AEON_MT + 44}" fill="#f8fafc" font-size="30" font-weight="700" font-family="${F}">${esc(spent)}</text>
<text x="${W - P}" y="${AEON_MT + 44}" fill="#94a3b8" font-size="22" text-anchor="end" font-family="${F}">avg ${esc(fEth(avg))} / piece</text>
${tiles}
<text x="${P}" y="${H - 30}" fill="#6b7688" font-size="18" font-family="${F}">${esc("one buyer, one window · marketplace trades from the public sale log · reproducible, not a valuation")}</text>
</svg>`;
}

export function renderAeonSweepCard(sweep, opts = {}) {
  if (!sweep || !sweep.tokens?.length) return null;
  return png(aeonSweepSvg(sweep, opts), opts.W ?? 1080);
}
