// Shared stats for the X bot: fetch the live price and derive everything the
// rotating posts and the cards need from the model + snapshot data. Mirrors the
// site / api/og.js logic so the bot can never disagree with the chart.
import { readFileSync } from "node:fs";
import { DEFAULT_RAW, SUPPLY } from "../../src/data.js";
import * as M from "../../src/models.js";

const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";

export async function fetchLivePrice() {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}`, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.data?.attributes?.base_token_price_usd); if (p > 0) return { price: p, source: "GeckoTerminal" }; }
  } catch { /* fall through */ }
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/SPX-USD/ticker", { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.price); if (p > 0) return { price: p, source: "Coinbase" }; }
  } catch { /* fall through */ }
  return null;
}

// Daily BTC closes (~1y) to price SPX in BTC and measure relative strength.
export async function fetchBtcSeries() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const out = (j.prices || []).map(([ms, p]) => ({ date: new Date(ms).toISOString().slice(0, 10), price: p }));
    return out.length ? out : null;
  } catch { return null; }
}

// Latest diamond-supply snapshot (bundled, written by the snapshot cron).
function loadSupplySnapshot() {
  try {
    const arr = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8"));
    const last = arr.at(-1);
    return { diamondTokens: last.sup.diamond, holders: last.holders, date: last.d };
  } catch { return null; }
}

export function computeStats(price, dateStr = new Date().toISOString().slice(0, 10), opts = {}) {
  const m = M.buildModel(DEFAULT_RAW);
  const day = M.dayN(dateStr);
  const center = Math.exp(m.predict(day));
  const z = Math.log(price) - m.predict(day);
  const bi = M.bandIndex(m, price, day);

  // Risk: log-deviation normalized to the historical range (matches buildRiskSeries).
  let lo = Infinity, hi = -Infinity;
  for (const r of DEFAULT_RAW) { const v = Math.log(r.price) - m.predict(M.dayN(r.date)); if (v < lo) lo = v; if (v > hi) hi = v; }
  const risk = Math.min(1, Math.max(0, (z - lo) / ((hi - lo) || 1)));
  const riskSeries = M.buildRiskSeries(m, DEFAULT_RAW);

  const nextUpIdx = Math.min(bi + 1, M.BAND_LABELS.length - 1);
  const fsr = M.buildFireSaleRallies(DEFAULT_RAW, m, { minGain: 0.3 });
  const lastFs = fsr.at(-1);

  // All-time high + current drawdown from it.
  let ath = -Infinity, athDate = DEFAULT_RAW[0].date;
  for (const r of DEFAULT_RAW) if (r.price > ath) { ath = r.price; athDate = r.date; }
  const ddSeries = M.buildDrawdownSeries(DEFAULT_RAW);
  const dd = price / Math.max(ath, price) - 1;
  const maxDd = ddSeries.reduce((mn, r) => Math.min(mn, r.dd), 0);

  // Share of history spent this cheap or cheaper (band <= current).
  const histBands = DEFAULT_RAW.map(r => M.bandIndex(m, r.price, M.dayN(r.date)));
  const cheaperFrac = histBands.filter(b => b <= bi).length / histBands.length;
  const bandCounts = Array(M.BAND_LABELS.length).fill(0);
  histBands.forEach(b => bandCounts[b]++);

  // Hindsight strategy edge vs HODL (cycle anchor — the more conservative one).
  const stratCyc = M.buildCycleStrategy(DEFAULT_RAW, M.buildRallyCycles(DEFAULT_RAW, { minDepth: 0.4, minPeakPrice: 0.05, minGain: 0.3 }));
  const edge = stratCyc ? (1 + stratCyc.stratRet) / (1 + stratCyc.hodlRet) : null;

  const first = DEFAULT_RAW[0];

  // Supply / diamond-adjusted market cap.
  let supply = null;
  const snap = loadSupplySnapshot();
  if (snap) {
    supply = {
      diamondTokens: snap.diamondTokens, holders: snap.holders, snapDate: snap.date,
      diamondShare: snap.diamondTokens / SUPPLY,
      nominalMc: price * SUPPLY,
      floatTokens: SUPPLY - snap.diamondTokens,
      floatMc: price * (SUPPLY - snap.diamondTokens),
      diamondValue: price * snap.diamondTokens,
    };
  }

  // Valuation vs BTC (SPX priced in sats + relative strength).
  let btc = null;
  if (opts.btc && opts.btc.length) {
    const map = new Map(opts.btc.map(r => [r.date, r.price]));
    const getBtc = d => { let t = new Date(d); for (let k = 0; k < 4; k++) { const ds = t.toISOString().slice(0, 10); if (map.has(ds)) return map.get(ds); t = new Date(t.getTime() - 86400000); } return null; };
    const aligned = [];
    for (const r of DEFAULT_RAW) { const b = getBtc(r.date); if (b) aligned.push({ ts: Date.parse(r.date), ratio: r.price / b }); }
    const btcNow = opts.btc.at(-1).price;
    if (aligned.length >= 2) {
      const lastTs = aligned.at(-1).ts, ratioLast = aligned.at(-1).ratio;
      const ratioAt = days => { const tgt = lastTs - days * 86400000; const before = aligned.filter(a => a.ts <= tgt); return (before.at(-1) || aligned[0]).ratio; };
      const rel = days => ratioLast / ratioAt(days) - 1;
      btc = { btcNow, sats: (price / btcNow) * 1e8, rel90: rel(90), rel365: rel(365), series: aligned.map(a => [a.ts, a.ratio * 1e8]) };
    }
  }

  return {
    date: dateStr, day, price, center, model: m,
    band: M.BAND_LABELS[bi], bandIndex: bi,
    vsCenter: price / center - 1,
    risk,
    nextUp: M.BAND_LABELS[nextUpIdx],
    nextUpPrice: M.bandVal(m, day, nextUpIdx),
    lastFireSale: lastFs
      ? { date: lastFs.startDate, low: lastFs.lowPrice, sinceGain: price / lastFs.lowPrice - 1, peakGain: lastFs.maxGain }
      : null,
    ath, athDate, drawdown: dd, maxDrawdown: maxDd,
    cheaperFrac, edge,
    firstPrice: first.price, firstDate: first.date, allTimeReturn: price / first.price - 1,
    targets: M.TARGETS.map(t => ({ ...t, mult: t.price / price })),
    supply, btc,
    series: {
      price: DEFAULT_RAW.map(r => [Date.parse(r.date), r.price]),
      risk: riskSeries.map(r => [r.ts, r.risk]),
      drawdown: ddSeries.map(r => [r.ts, r.dd]),
      strategy: stratCyc ? stratCyc.rows.map(r => [r.ts, r.strat, r.hodl]) : null,
      bandCounts,
    },
  };
}
