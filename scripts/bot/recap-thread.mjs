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
  // Auto-fit the y-axis to the data (both lines can sit well under 100) so the
  // card fills the frame instead of wasting two-thirds of a fixed 0–100 scale.
  const moodMax = Math.max(...fngPts.map(p => p[1]), ...R.riskSeries.map(p => p[1]));
  const moodYMax = Math.max(10, Math.ceil((moodMax * 1.15) / 5) * 5);

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

  // vs-the-field: cumulative-return race lines (only if we got ≥2 assets)
  if (fieldLines.length >= 2) thread.push({
    text:
`🏁 ${R.label}: SPX6900 vs the field.

Cumulative return through the month — SPX ${fPct(R.change)} raced against BTC/ETH/SOL and the meme kings 🐕🐸 (DOGE/SHIB/PEPE), all starting at 0% 👇

$SPX #spx6900`,
    card: { type: "line", spec: {
      title: `SPX6900 vs the field — ${R.label}`, headline: `${fPct(R.change)} on the month`, accent: "#38bdf8",
      yFmt: v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`,
      hlines: [{ y: 0, label: "0%", color: "#475569" }],
      series: fieldLines.map(f => ({ pts: f.pts, color: f.color, width: f.width, logo: f.logo })),
    } },
  });

  // sentiment vs valuation: Fear&Greed + SPX risk level (only if F&G available)
  if (fngPts.length >= 2) thread.push({
    text:
`🧭 ${R.label}: sentiment vs valuation.

Crypto Fear & Greed closed ${fngPts.at(-1)[1]} (${fngLabel(fngPts.at(-1)[1])}) while SPX's model risk sat ${riskNow}/100 (${riskLabel}).

$SPX #spx6900`,
    card: { type: "line", spec: {
      title: `Sentiment vs valuation — ${R.label}`, headline: `Fear & Greed vs SPX risk level`, accent: "#38bdf8",
      yMin: 0, yMax: moodYMax, yFmt: v => String(Math.round(v)),
      series: [
        { pts: fngPts, color: "#f59e0b", width: 3.5 },
        { pts: R.riskSeries, color: "#38bdf8", width: 3.5 },
      ],
      legend: [{ label: "Crypto Fear & Greed", color: "#f59e0b" }, { label: "SPX risk (bands)", color: "#38bdf8" }],
    } },
  });

  // closing card: diamond-hands supply over the month (replaces the dry text-only
  // wrap). Padded y-axis like the website's chart — diamond % barely moves daily.
  const dser = R.diamondSeries;
  let diamondCard = null, diamondLine = "";
  if (dser && dser.length >= 2) {
    const dv = dser.map(p => p[1]);
    const dlo = Math.min(...dv), dhi = Math.max(...dv);
    const drange = dhi - dlo, dpad = Math.max(drange * 0.3, 0.3);
    const ddec = (drange + 2 * dpad) >= 8 ? 0 : 1;
    diamondLine = ` Diamond hands ${dser[0][1].toFixed(ddec)}% → ${dser.at(-1)[1].toFixed(ddec)}% of supply.`;
    diamondCard = { type: "line", spec: {
      title: `Diamond hands — ${R.label}`, headline: `${Math.round(dser.at(-1)[1])}% of supply held by diamonds`, accent: "#22d3ee",
      yMin: dlo - dpad, yMax: dhi + dpad, yFmt: v => v.toFixed(ddec) + "%",
      series: [{ pts: dser, color: "#22d3ee", width: 3.5, fill: 0.18 }],
      marker: { x: dser.at(-1)[0], y: dser.at(-1)[1], color: "#22d3ee" },
    } };
  }
  thread.push({
    text:
`That's ${R.label}.${R.holders ? ` Holders ${fNum(R.holders.start)} → ${fNum(R.holders.end)} (${R.holders.delta >= 0 ? "+" : ""}${fNum(R.holders.delta)}).` : ""}${diamondLine}

Live rainbow + tools: spx6900rainbow.xyz

🌈 $SPX #spx6900 · NFA`,
    card: diamondCard,
  });

  return { R, endStats, thread };
}
