// Build the monthly-recap X thread (each item = { text, card|null }) for a given
// month. This is the ONE source of truth for the thread, shared by the runner
// (recap-run.mjs, which renders/posts) and the control-panel preview API
// (api/recap.js, which shows it for verification). It does the live CoinGecko +
// crypto Fear&Greed fetches itself and degrades gracefully — the vs-the-field
// and sentiment cards are dropped if their data can't be reached, never throwing.
import { computeMonthlyRecap } from "./recap.mjs";
import { computeStats } from "./stats.mjs";
import { DEFAULT_RAW } from "../../src/data.js";

// --- tiny formatters (kept local so the thread module is self-contained) ---
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fMon = d => { const [, m, day] = d.split("-"); return `${MON[+m - 1]} ${+day}`; };
const fPct = x => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
const fPrice = p => p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.001 ? 5 : p < 0.01 ? 4 : p < 0.1 ? 3 : 2);
const fMult = x => Math.round(x) + "×";
const fNum = n => Math.round(n).toLocaleString("en-US");

// Monthly return of a [ [ms, price], … ] series over [startDate, endDate], using
// the close nearest each boundary (walks a few days inward if the exact day is
// missing). Apples-to-apples with how SPX's own open→close return is computed.
const seriesReturn = (series, startDate, endDate) => {
  if (!series || !series.length) return null;
  const byDate = new Map();
  for (const [ms, p] of series) byDate.set(new Date(ms).toISOString().slice(0, 10), p);
  const near = (t, dir) => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + dir * i);
      const k = d.toISOString().slice(0, 10);
      if (byDate.has(k)) return byDate.get(k);
    }
    return null;
  };
  const a = near(startDate, +1), b = near(endDate, -1);
  return a && b ? b / a - 1 : null;
};

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

// → { R, endStats, thread } or null if the month has < 2 daily snapshots.
// history = the raw public/history.json array (rows with d/p/holders/fng/…).
export async function buildRecapThread(month, history) {
  const R = computeMonthlyRecap(month, history);
  if (!R) return null;

  // Full drawn series = bundled history + this period's daily closes (so the
  // rainbow card runs to month end).
  const lastBundled = DEFAULT_RAW.at(-1).date;
  const merged = [...DEFAULT_RAW, ...history.map(r => ({ date: r.d, price: r.p })).filter(p => p.date > lastBundled && p.price > 0)];
  const endStats = computeStats(R.close, R.endDate, { history: merged });

  const green = R.change >= 0 ? "#4ade80" : "#f87171";
  const heroTiles = [
    { big: fPct(R.change), label: "price · this month", color: green },
    { big: fPrice(R.high), label: "high · " + fMon(R.highDate) },
    { big: fPrice(R.low), label: "low · " + fMon(R.lowDate) },
    { big: (R.holders ? (R.holders.delta >= 0 ? "+" : "") + fNum(R.holders.delta) : "—"), label: "new holders" },
    { big: R.diamondOfTotal != null ? Math.round(R.diamondOfTotal * 100) + "%" : "—", label: "diamond hands" },
    { big: fMult(R.allTimeReturn), label: "since launch" },
  ];

  // --- monthly performance vs the field (majors + meme kings) ---------------
  // All six fetched uniformly from CoinGecko, measured over SPX's own window.
  const ids = { btc: "bitcoin", eth: "ethereum", sol: "solana", doge: "dogecoin", shib: "shiba-inu", pepe: "pepe" };
  const fetched = await Promise.all(Object.values(ids).map(coinGeckoSeries));
  const series = {}; Object.keys(ids).forEach((k, i) => { series[k] = fetched[i]; });
  const fieldBars = [
    { logo: "spx", ret: R.change, outline: true },
    { logo: "btc", ret: seriesReturn(series.btc, R.startDate, R.endDate) },
    { logo: "eth", ret: seriesReturn(series.eth, R.startDate, R.endDate) },
    { logo: "sol", ret: seriesReturn(series.sol, R.startDate, R.endDate) },
    { logo: "doge", ret: seriesReturn(series.doge, R.startDate, R.endDate) },
    { logo: "shib", ret: seriesReturn(series.shib, R.startDate, R.endDate) },
    { logo: "pepe", ret: seriesReturn(series.pepe, R.startDate, R.endDate) },
  ].filter(b => b.ret != null).map(b => ({ value: b.ret, logo: b.logo, outline: b.outline }));

  // --- sentiment vs valuation: crypto Fear&Greed (backfilled) + SPX risk ----
  const fngMap = await fngHistory();
  const fngBackfilled = R.priceSeries
    .map(([ms]) => { const d = new Date(ms).toISOString().slice(0, 10); return fngMap.has(d) ? [ms, fngMap.get(d)] : null; })
    .filter(Boolean);
  const fngPts = fngBackfilled.length >= 2 ? fngBackfilled : R.fngSeries;
  const riskNow = Math.round(R.riskSeries.at(-1)[1]);
  const riskLabel = riskNow < 33 ? "low / value zone" : riskNow < 66 ? "mid-band" : "stretched";

  // --- the thread (combined to stay tight): hero, rainbow, path, field, mood, wrap
  const thread = [
    {
      text:
`📊 SPX6900 — ${R.label} in review.

${fPct(R.change)} on the month, closed in the ${R.endBand.l} band. The month in one card 👇

🌈 $SPX #spx6900`,
      card: { type: "statgrid", spec: { title: `SPX6900 — ${R.label} in review`, headline: `${fPct(R.change)} · ${R.endBand.l}`, accent: "#38bdf8", tiles: heroTiles } },
    },
    {
      text:
`🌈 Where ${R.label} left SPX6900 on the rainbow: ${R.endBand.l} — ${fPct(R.vsCenter)} vs the model's fair value (${fPrice(R.center)}).

$SPX #spx6900`,
      card: { type: "rainbow" },
    },
    {
      text:
`📈 ${R.label}'s path: opened ${fPrice(R.open)}, ran to ${fPrice(R.high)} (${fMon(R.highDate)}), closed ${fPrice(R.close)}.

Best day ${fPct(R.bestDay.ret)}, worst ${fPct(R.worstDay.ret)}.`,
      card: { type: "line", spec: {
        title: `SPX6900 — ${R.label} price path`, headline: `${fPct(R.change)} on the month`, accent: green,
        series: [{ pts: R.priceSeries, color: green, width: 3.5, fill: 0.14 }],
        marker: { x: R.priceSeries.at(-1)[0], y: R.priceSeries.at(-1)[1], color: green },
      } },
    },
  ];

  // vs-the-field: majors + meme kings in one card (only if we got ≥2 returns)
  if (fieldBars.length >= 2) thread.push({
    text:
`🏁 ${R.label}: SPX6900 vs the field.

SPX ${fPct(R.change)} on the month — raced against BTC/ETH/SOL and the meme kings 🐕🐸 (DOGE/SHIB/PEPE) 👇

$SPX #spx6900`,
    card: { type: "vsfield", spec: { title: `SPX6900 vs the field — ${R.label}`, headline: `${fPct(R.change)} on the month`, accent: "#38bdf8", bars: fieldBars } },
  });

  // sentiment vs valuation: Fear&Greed + SPX risk level (only if F&G available)
  if (fngPts.length >= 2) thread.push({
    text:
`🧭 ${R.label}: sentiment vs valuation.

Crypto Fear & Greed closed ${fngPts.at(-1)[1]} (${fngLabel(fngPts.at(-1)[1])}) while SPX's model risk sat ${riskNow}/100 (${riskLabel}).

$SPX #spx6900`,
    card: { type: "line", spec: {
      title: `Sentiment vs valuation — ${R.label}`, headline: `Fear & Greed vs SPX risk level`, accent: "#38bdf8",
      yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100].map(v => ({ v, label: String(v) })),
      series: [
        { pts: fngPts, color: "#f59e0b", width: 3.5 },
        { pts: R.riskSeries, color: "#38bdf8", width: 3.5 },
      ],
      legend: [{ label: "Crypto Fear & Greed", color: "#f59e0b" }, { label: "SPX risk (bands)", color: "#38bdf8" }],
    } },
  });

  // closing wrap
  thread.push({
    text:
`That's ${R.label}.${R.holders ? ` Holders ${fNum(R.holders.start)} → ${fNum(R.holders.end)} (${R.holders.delta >= 0 ? "+" : ""}${fNum(R.holders.delta)}),` : ""} avg holder ${R.avgHolderPnl != null ? fPct(R.avgHolderPnl) : "—"}.

Live rainbow + tools: spx6900rainbow.xyz

🌈 $SPX #spx6900 · NFA`,
    card: null,
  });

  return { R, endStats, thread };
}
