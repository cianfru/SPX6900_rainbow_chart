// Daily BTC/USD history, used for the SPX6900/BTC ratio chart.

async function fetchCoinGecko() {
  // Full daily history in one call (auto-daily granularity for days > 90).
  const url = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1300";
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  const list = json?.prices;
  if (!Array.isArray(list) || list.length === 0) throw new Error("CoinGecko: empty");
  // [[ts_ms, price], ...] — dedupe to one (last) price per calendar day
  const byDate = new Map();
  for (const [ts, price] of list) {
    if (price > 0) byDate.set(new Date(ts).toISOString().slice(0, 10), price);
  }
  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBybit() {
  const url = "https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=D&limit=1000";
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  const list = json?.result?.list;
  if (!Array.isArray(list) || list.length === 0) throw new Error("Bybit: empty");
  return list
    .map(row => ({ date: new Date(parseInt(row[0], 10)).toISOString().slice(0, 10), price: parseFloat(row[4]) }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchCoinbase() {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 300 * 86400;
  const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${start}&end=${end}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Coinbase: empty");
  return arr
    .map(([ts, , , , close]) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: close }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req, res) {
  const errors = [];
  for (const [name, fn] of [
    ["coingecko", fetchCoinGecko],
    ["bybit", fetchBybit],
    ["coinbase", fetchCoinbase],
  ]) {
    try {
      const prices = await fn();
      if (prices.length > 0) {
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).json({ source: name, prices });
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return res.status(502).json({ error: "All BTC sources failed", details: errors });
}
