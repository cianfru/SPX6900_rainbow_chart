// Shared stats for the X bot: fetch the live price and derive everything the
// rotating posts and the cards need from the model. Mirrors the site / api/og.js
// logic so the bot can never disagree with the chart.
import { DEFAULT_RAW } from "../../src/data.js";
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

export function computeStats(price, dateStr = new Date().toISOString().slice(0, 10)) {
  const m = M.buildModel(DEFAULT_RAW);
  const day = M.dayN(dateStr);
  const center = Math.exp(m.predict(day));
  const z = Math.log(price) - m.predict(day);
  const bi = M.bandIndex(m, price, day);

  // Risk: log-deviation normalized to the historical range (matches buildRiskSeries).
  let lo = Infinity, hi = -Infinity;
  for (const r of DEFAULT_RAW) { const v = Math.log(r.price) - m.predict(M.dayN(r.date)); if (v < lo) lo = v; if (v > hi) hi = v; }
  const risk = Math.min(1, Math.max(0, (z - lo) / ((hi - lo) || 1)));

  const nextUpIdx = Math.min(bi + 1, M.BAND_LABELS.length - 1);
  const fsr = M.buildFireSaleRallies(DEFAULT_RAW, m, { minGain: 0.3 });
  const lastFs = fsr.at(-1);

  // All-time high + current drawdown from it.
  let ath = -Infinity, athDate = DEFAULT_RAW[0].date;
  for (const r of DEFAULT_RAW) if (r.price > ath) { ath = r.price; athDate = r.date; }
  const dd = price / Math.max(ath, price) - 1;
  const dds = M.buildDrawdownSeries(DEFAULT_RAW);
  const maxDd = dds.reduce((mn, r) => Math.min(mn, r.dd), 0);

  // Share of history spent this cheap or cheaper (band <= current).
  const histBands = DEFAULT_RAW.map(r => M.bandIndex(m, r.price, M.dayN(r.date)));
  const cheaperFrac = histBands.filter(b => b <= bi).length / histBands.length;

  // Hindsight strategy edge vs HODL (cycle anchor — the more conservative one).
  const cyc = M.buildRallyCycles(DEFAULT_RAW, { minDepth: 0.4, minPeakPrice: 0.05, minGain: 0.3 });
  const stratCyc = M.buildCycleStrategy(DEFAULT_RAW, cyc);
  const edge = stratCyc ? (1 + stratCyc.stratRet) / (1 + stratCyc.hodlRet) : null;

  // Launch / all-time return.
  const first = DEFAULT_RAW[0];
  const allTimeReturn = price / first.price - 1;

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
    cheaperFrac,
    edge,
    firstPrice: first.price, firstDate: first.date, allTimeReturn,
    targets: M.TARGETS.map(t => ({ ...t, mult: t.price / price })),
  };
}
