// Build the monthly-recap post — ONE long-form X post + up to 4 image cards, all
// MONTH-focused: Rainbow (where the month closed on the bands), SPX vs the field
// (the month's return race), day-by-day (the month's daily returns) and Holders
// vs price (accumulation through the month). NO tile scorecard and no lifetime/
// current-state cards — a monthly recap shows THE MONTH; its summary numbers ride
// in the post text. Single source of truth shared by the runner (recap-run.mjs,
// renders/posts) and the control preview API (api/recap.js). Does the live
// CoinGecko + crypto Fear&Greed fetches itself and degrades gracefully — the
// vs-field card drops (and the diamond line fills in) if its data can't be
// reached. Never throws.
import { fNum } from "./svg-util.mjs";
import { computeMonthlyRecap } from "./recap.mjs";
import { computeStats } from "./stats.mjs";
import { rsiNow } from "./rsi-card.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

// --- tiny formatters (kept local so the thread module is self-contained) ---
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fMon = d => { const [, m, day] = d.split("-"); return `${MON[+m - 1]} ${+day}`; };
const fPct = x => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
// Recap-card price convention (tiered decimals). posts.mjs tweet text uses a
// flat 4-decimal rule — per-surface on purpose; don't unify blindly.
const fPrice = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.001 ? 5 : p < 0.01 ? 4 : p < 0.1 ? 3 : 2);

async function coinGeckoSeries(id) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=60&interval=daily`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.prices || []).map(([ms, p]) => [ms, p]);
  } catch (e) { console.warn(`coingecko ${id}:`, e.message); return null; }
}

// Full crypto Fear & Greed history keyed by date — alternative.me's free
// endpoint, the same source the daily snapshot banks one point/day from.
async function fngHistory() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=0&format=json", { headers: { Accept: "application/json" } });
    if (!r.ok) return new Map();
    const j = await r.json();
    const m = new Map();
    for (const e of (j.data || [])) m.set(new Date(+e.timestamp * 1000).toISOString().slice(0, 10), +e.value);
    return m;
  } catch (e) { console.warn("fng history:", e.message); return new Map(); }
}

const fngLabel = v => v < 25 ? "extreme fear" : v < 45 ? "fear" : v < 55 ? "neutral" : v < 75 ? "greed" : "extreme greed";

// → { R, endStats, text, cards } or null if the month has < 2 daily snapshots.
// history = the raw public/history.json array (rows with d/p/holders/fng/…).
export async function buildRecapPost(month, history) {
  const R = computeMonthlyRecap(month, history);
  if (!R) return null;

  // Full drawn series = bundled history + this period's daily closes (so the
  // rainbow card runs to month end).
  const lastBundled = DEFAULT_RAW.at(-1).date;
  const merged = [...DEFAULT_RAW, ...history.map(r => ({ date: r.d, price: r.p })).filter(p => p.date > lastBundled && p.price > 0)];
  const endStats = computeStats(R.close, R.endDate, { history: merged });


  // --- monthly performance vs the field (majors + meme kings) ---------------
  // All six fetched uniformly from CoinGecko. Each asset's CUMULATIVE return
  // through the month, normalized to start at 0%, so the lines race each other.
  const ids = { btc: "bitcoin", eth: "ethereum", sol: "solana", doge: "dogecoin", shib: "shiba-inu", pepe: "pepe" };
  const fetched = await Promise.all(Object.values(ids).map(coinGeckoSeries));
  const series = {}; Object.keys(ids).forEach((k, i) => { series[k] = fetched[i]; });
  const retSeries = srs => {
    if (!srs || !srs.length) return null;
    const byDate = new Map();
    for (const [ms, p] of srs) byDate.set(new Date(ms).toISOString().slice(0, 10), p);
    const near = (t, dir) => {
      for (let i = 0; i < 7; i++) {
        const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + dir * i);
        const k = d.toISOString().slice(0, 10);
        if (byDate.has(k)) return byDate.get(k);
      }
      return null;
    };
    const base = near(R.startDate, +1);
    if (!base) return null;
    const pts = [];
    for (const [ms, p] of srs) {
      const ds = new Date(ms).toISOString().slice(0, 10);
      if (ds >= R.startDate && ds <= R.endDate) pts.push([ms, p / base - 1]);
    }
    return pts.length >= 2 ? pts : null;
  };
  const spxBase = R.priceSeries[0][1];
  const fieldLines = [
    { logo: "spx", color: "#38bdf8", width: 4, pts: R.priceSeries.map(([ms, p]) => [ms, p / spxBase - 1]) },
    { logo: "btc", color: "#f7931a", width: 2.5, pts: retSeries(series.btc) },
    { logo: "eth", color: "#8b9bff", width: 2.5, pts: retSeries(series.eth) },
    { logo: "sol", color: "#9945ff", width: 2.5, pts: retSeries(series.sol) },
    { logo: "doge", color: "#c2a633", width: 2.5, pts: retSeries(series.doge) },
    { logo: "shib", color: "#f43f5e", width: 2.5, pts: retSeries(series.shib) },
    { logo: "pepe", color: "#4ade80", width: 2.5, pts: retSeries(series.pepe) },
  ].filter(f => f.pts);

  // --- sentiment vs valuation: crypto Fear&Greed (backfilled) + SPX risk ----
  const fngMap = await fngHistory();
  const fngBackfilled = R.priceSeries
    .map(([ms]) => { const d = new Date(ms).toISOString().slice(0, 10); return fngMap.has(d) ? [ms, fngMap.get(d)] : null; })
    .filter(Boolean);
  const fngPts = fngBackfilled.length >= 2 ? fngBackfilled : R.fngSeries;
  const riskNow = Math.round(R.riskSeries.at(-1)[1]);
  const riskLabel = riskNow < 33 ? "low / value zone" : riskNow < 66 ? "mid-band" : "stretched";

  // --- diamond-hands supply over the month (padded y-axis like the website) ---
  const dser = R.diamondSeries;
  let diamondCard = null, diamondSeg = "";
  if (dser && dser.length >= 2) {
    const dv = dser.map(p => p[1]);
    const dlo = Math.min(...dv), dhi = Math.max(...dv);
    const drange = dhi - dlo, dpad = Math.max(drange * 0.3, 0.3);
    const ddec = (drange + 2 * dpad) >= 8 ? 0 : 1;
    diamondSeg = `💎 Diamond hands held ${dser[0][1].toFixed(ddec)}% → ${dser.at(-1)[1].toFixed(ddec)}% of supply.`;
    diamondCard = { type: "line", spec: {
      title: `Diamond hands — ${R.label}`, headline: `${Math.round(dser.at(-1)[1])}% of supply held by diamonds`, accent: "#22d3ee",
      yMin: dlo - dpad, yMax: dhi + dpad, yFmt: v => v.toFixed(ddec) + "%",
      series: [{ pts: dser, color: "#22d3ee", width: 3.5, fill: 0.18 }],
      marker: { x: dser.at(-1)[0], y: dser.at(-1)[1], color: "#22d3ee" },
    } };
  }

  // --- the month, day by day: each daily close-to-close return as a green/red
  // bar diverging from 0% (the mbars renderer). Additive to the scorecard — shows
  // the month's rhythm + standout days the tiles can't. Date labels via bar.label.
  const dMon = d => { const [, m, day] = d.split("-"); return `${MON[+m - 1]} ${+day}`; };
  const ps = R.priceSeries;
  const dayBars = [];
  for (let i = 1; i < ps.length; i++) {
    const d = new Date(ps[i][0]).toISOString().slice(0, 10);
    dayBars.push({ value: ps[i][1] / ps[i - 1][1] - 1, year: new Date(ps[i][0]).getUTCFullYear(), d });
  }
  // label ~5 dates evenly across the axis so it doesn't crowd
  if (dayBars.length) { const every = Math.max(1, Math.round(dayBars.length / 5)); dayBars.forEach((b, i) => { if (i % every === 0 || i === dayBars.length - 1) b.label = dMon(b.d); }); }
  const greenDays = dayBars.filter(b => b.value >= 0).length;
  const dailyCard = dayBars.length >= 2 ? { type: "mbars", spec: {
    title: `${R.label} — day by day`, headline: `${greenDays}/${dayBars.length} green days · best ${fPct(R.bestDay.ret)}`, accent: "#38bdf8", bars: dayBars,
  } } : null;


  // --- the image cards, ALL month-focused: Rainbow (where the month closed on the
  // bands) · SPX vs the field (the month's return race) · day-by-day (the month's
  // daily rhythm) · Holders vs price (accumulation through the month). The statgrid
  // scorecard was dropped on purpose — a monthly recap leads with charts of THE
  // MONTH, not a tile of lifetime/current-state stats; its numbers ride in the post
  // text instead. X caps a post at 4 images.
  const fieldCard = fieldLines.length >= 2 ? { type: "line", spec: {
    title: `SPX6900 vs the field — ${R.label}`, headline: `${fPct(R.change)} on the month`, accent: "#38bdf8",
    yFmt: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`,
    hlines: [{ y: 0, label: "0%", color: "#475569" }],
    series: fieldLines.map(f => ({ pts: f.pts, color: f.color, width: f.width, logo: f.logo })),
  } } : null;
  const cards = [{ type: "rainbow" }];
  if (fieldCard) cards.push(fieldCard);        // the month's return race
  if (dailyCard) cards.push(dailyCard);        // the month, day by day
  // The RSI dots — the one NATIVELY monthly card: one dot per monthly close. Rendered
  // through the recap's endStats (as-of the month-end), and monthlyCloses now drops any
  // month past that date, so the final dot IS this month's close — the monthly RSI print
  // the recap exists to report, not an unfinished current month.
  cards.push({ type: "rsidots" });
  // If a month lacks the field or day-by-day data, keep the post full with the diamond-
  // supply line (still a monthly movement) rather than shipping short.
  if (cards.length < 4 && diamondCard) cards.push(diamondCard);
  while (cards.length > 4) cards.pop(); // X hard-caps a post at 4 images

  // --- the single long-form post (no URL in the body — links throttle reach and
  // the site is in the bio). Carries the full narrative + the two non-image charts.
  const segs = [
    `📊 SPX6900 — ${R.label} in review.`,
    `${fPct(R.change)} on the month, closed in the ${R.endBand.l} band (${fPct(R.vsCenter)} vs the model's fair value ${fPrice(R.center)}).`,
    `📈 Path: opened ${fPrice(R.open)}, ran to ${fPrice(R.high)} (${fMon(R.highDate)}), closed ${fPrice(R.close)}. Best day ${fPct(R.bestDay.ret)}, worst ${fPct(R.worstDay.ret)} — ${greenDays}/${dayBars.length} days green.`,
  ];
  if (fieldLines.length >= 2) segs.push(`🏁 vs the field: SPX ${fPct(R.change)} raced BTC/ETH/SOL + the meme kings 🐕🐸 (DOGE/SHIB/PEPE) — chart.`);
  // The monthly RSI close — one print per month, so this IS a monthly datapoint. Reads off the
  // same as-of-month-end series as the dots card, so text and card can't disagree.
  const rsiClose = Math.round(rsiNow(R.close, R.endDate, endStats.drawn));
  const rsiWord = rsiClose < 40 ? "cold and oversold, the value end of the range"
    : rsiClose < 50 ? "cool, below neutral" : rsiClose < 60 ? "neutral"
    : rsiClose < 70 ? "warm" : "hot, overbought";
  segs.push(`📉 Monthly RSI close: ${rsiClose} — ${rsiWord}. A homage to the Bitcoin RSI chart by @100trillionUSD.`);
  if (fngPts.length >= 2) segs.push(`🧭 Mood vs value: Crypto Fear & Greed ${fngPts.at(-1)[1]} (${fngLabel(fngPts.at(-1)[1])}) while SPX model risk sat ${riskNow}/100 (${riskLabel}).`);
  const holderSeg = R.holders ? `Holders ${fNum(R.holders.start)} → ${fNum(R.holders.end)} (${R.holders.delta >= 0 ? "+" : ""}${fNum(R.holders.delta)}).` : "";
  if (diamondSeg || holderSeg) segs.push([diamondSeg, holderSeg].filter(Boolean).join(" "));
  segs.push(`🌈 $SPX #spx6900 · NFA`);
  const text = segs.join("\n\n");

  return { R, endStats, text, cards };
}
