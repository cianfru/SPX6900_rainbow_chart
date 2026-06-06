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

// Daily closes (~1y) for a CoinGecko coin id, to price SPX against majors.
async function fetchCoinSeries(id) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const out = (j.prices || []).map(([ms, p]) => ({ date: new Date(ms).toISOString().slice(0, 10), price: p }));
    return out.length ? out : null;
  } catch { return null; }
}

// BTC/ETH/SOL daily closes (each null if unreachable).
export async function fetchMajors() {
  const [btc, eth, sol] = await Promise.all([
    fetchCoinSeries("bitcoin"), fetchCoinSeries("ethereum"), fetchCoinSeries("solana"),
  ]);
  return { btc, eth, sol };
}

// Latest holder/supply snapshot (bundled, written by the snapshot cron).
function loadSupplySnapshot() {
  try {
    const arr = JSON.parse(readFileSync(new URL("../../public/history.json", import.meta.url), "utf8"));
    return arr.at(-1);
  } catch { return null; }
}

// SPX-vs-coin ratio aligned on SPX dates, and relative-strength over a window.
function alignedRatio(coin) {
  const map = new Map(coin.map(r => [r.date, r.price]));
  const getC = d => { let t = new Date(d); for (let k = 0; k < 4; k++) { const ds = t.toISOString().slice(0, 10); if (map.has(ds)) return map.get(ds); t = new Date(t.getTime() - 86400000); } return null; };
  const aligned = [];
  for (const r of DEFAULT_RAW) { const c = getC(r.date); if (c) aligned.push({ ts: Date.parse(r.date), ratio: r.price / c }); }
  return aligned;
}
function relStrength(aligned, days) {
  if (aligned.length < 2) return null;
  const lastTs = aligned.at(-1).ts, rl = aligned.at(-1).ratio;
  const before = aligned.filter(a => a.ts <= lastTs - days * 86400000);
  return rl / (before.at(-1) || aligned[0]).ratio - 1;
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

  // Supply / diamond-adjusted market cap + holder break-even & concentration.
  let supply = null;
  const snap = loadSupplySnapshot();
  if (snap) {
    const tiers = snap.sup;
    const classified = Object.values(tiers).reduce((a, b) => a + b, 0);
    supply = {
      diamondTokens: tiers.diamond, holders: snap.holders, snapDate: snap.d,
      diamondShare: tiers.diamond / SUPPLY,
      nominalMc: price * SUPPLY,
      floatTokens: SUPPLY - tiers.diamond,
      floatMc: price * (SUPPLY - tiers.diamond),
      diamondValue: price * tiers.diamond,
      tiers, classified,
      breakEven: snap.be, gini: snap.gini,
      avgHolderPnl: snap.be ? price / snap.be - 1 : null,
    };
  }

  // Valuation vs BTC (SPX priced in sats + relative strength), and vs majors.
  const coins = opts.coins || (opts.btc ? { btc: opts.btc } : {});
  let btc = null;
  if (coins.btc && coins.btc.length) {
    const aligned = alignedRatio(coins.btc);
    const btcNow = coins.btc.at(-1).price;
    if (aligned.length >= 2) {
      btc = { btcNow, sats: (price / btcNow) * 1e8, rel90: relStrength(aligned, 90), rel365: relStrength(aligned, 365), series: aligned.map(a => [a.ts, a.ratio * 1e8]) };
    }
  }
  const majors = [["BTC", coins.btc], ["ETH", coins.eth], ["SOL", coins.sol]]
    .filter(([, c]) => c && c.length)
    .map(([name, c]) => ({ name, rel365: relStrength(alignedRatio(c), 365) }))
    .filter(m => m.rel365 != null);

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
    supply, btc, majors,
    series: {
      price: DEFAULT_RAW.map(r => [Date.parse(r.date), r.price]),
      risk: riskSeries.map(r => [r.ts, r.risk]),
      drawdown: ddSeries.map(r => [r.ts, r.dd]),
      strategy: stratCyc ? stratCyc.rows.map(r => [r.ts, r.strat, r.hodl]) : null,
      bandCounts,
    },
  };
}
