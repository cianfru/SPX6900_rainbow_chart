// SPX6900 / WETH Uniswap V2 pool on Ethereum mainnet
const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const NETWORK = "eth";

async function fetchGeckoTerminal() {
  // GeckoTerminal returns up to 1000 daily candles per request, ordered newest-first.
  // For SPX6900 launched Aug 2023, this covers full history (~1000 days as of 2026).
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK}/pools/${POOL}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = await res.json();
  const list = json?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list) || list.length === 0) throw new Error("GeckoTerminal: empty response");

  // ohlcv_list: [[timestamp_seconds, open, high, low, close, volume], ...] newest first
  return list
    .map(([ts, , , , close]) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      price: close,
    }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchCoinbase() {
  // Coinbase Exchange returns max 300 candles per call; SPX-USD listed Feb 2025.
  // 86400 = 1 day granularity. Returns [[ts, low, high, open, close, vol], ...] newest-first.
  const end = Math.floor(Date.now() / 1000);
  const start = end - 300 * 86400;
  const url = `https://api.exchange.coinbase.com/products/SPX-USD/candles?granularity=86400&start=${start}&end=${end}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Coinbase: empty");
  return arr
    .map(([ts, , , , close]) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      price: close,
    }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBybit() {
  // 1000 daily candles, SPXUSDT spot
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=SPXUSDT&interval=D&limit=1000`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  const list = json?.result?.list;
  if (!Array.isArray(list) || list.length === 0) throw new Error("Bybit: empty");
  // Bybit format: [startTime, open, high, low, close, volume, turnover], newest-first, strings
  return list
    .map(row => ({
      date: new Date(parseInt(row[0], 10)).toISOString().slice(0, 10),
      price: parseFloat(row[4]),
    }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req, res) {
  const errors = [];
  for (const [name, fn] of [
    ["geckoterminal", fetchGeckoTerminal],
    ["coinbase", fetchCoinbase],
    ["bybit", fetchBybit],
  ]) {
    try {
      const prices = await fn();
      if (prices.length > 0) {
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
        return res.status(200).json({ source: name, prices });
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return res.status(502).json({ error: "All sources failed", details: errors });
}
