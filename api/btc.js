// Daily BTC/USD history (back to SPX6900's 2023 launch), for the SPX/BTC ratio chart.

// CryptoCompare made histoday key-gated (keyless now 401s). Send the free API key
// from the Vercel env if present; without it we fall back to the other sources.
const CC_HEADERS = { "Accept": "application/json", ...(process.env.CRYPTOCOMPARE_KEY ? { authorization: `Apikey ${process.env.CRYPTOCOMPARE_KEY}` } : {}) };

async function fetchCryptoCompare() {
  const url = "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=1300";
  const res = await fetch(url, { headers: CC_HEADERS });
  if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);
  const json = await res.json();
  const list = json?.Data?.Data;
  if (!Array.isArray(list) || list.length === 0) throw new Error("CryptoCompare: empty");
  return list
    .map(d => ({ date: new Date(d.time * 1000).toISOString().slice(0, 10), price: d.close }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Coinbase returns max 300 daily candles per call, so page from launch forward.
async function fetchCoinbasePaged() {
  const startSec0 = Math.floor(Date.parse("2023-08-01T00:00:00Z") / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  const win = 290 * 86400; // stay under the 300-candle cap
  const byDate = new Map();
  for (let s = startSec0; s < nowSec; s += win) {
    const e = Math.min(s + win, nowSec);
    const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400&start=${s}&end=${e}`;
    const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "spx6900-rainbow" } });
    if (!res.ok) throw new Error(`Coinbase ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error("Coinbase: bad response");
    for (const [ts, , , , close] of arr) {
      if (close > 0) byDate.set(new Date(ts * 1000).toISOString().slice(0, 10), close);
    }
  }
  if (byDate.size === 0) throw new Error("Coinbase: empty");
  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Bybit: 1000 daily candles (last resort — only ~2.7y of history).
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

export default async function handler(req, res) {
  const errors = [];
  for (const [name, fn] of [
    ["cryptocompare", fetchCryptoCompare],
    ["coinbase", fetchCoinbasePaged],
    ["bybit", fetchBybit],
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
