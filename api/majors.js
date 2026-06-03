// Daily USD history for the major assets, for SPX6900 relative-valuation ratios.

async function cryptoCompare(sym) {
  const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=1300`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`CryptoCompare ${sym} ${res.status}`);
  const json = await res.json();
  const list = json?.Data?.Data;
  if (!Array.isArray(list) || !list.length) throw new Error(`CryptoCompare ${sym} empty`);
  return list
    .map(d => ({ date: new Date(d.time * 1000).toISOString().slice(0, 10), price: d.close }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function coinbasePaged(product) {
  const startSec0 = Math.floor(Date.parse("2023-08-01T00:00:00Z") / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  const win = 290 * 86400;
  const byDate = new Map();
  for (let s = startSec0; s < nowSec; s += win) {
    const e = Math.min(s + win, nowSec);
    const url = `https://api.exchange.coinbase.com/products/${product}/candles?granularity=86400&start=${s}&end=${e}`;
    const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "spx6900-rainbow" } });
    if (!res.ok) throw new Error(`Coinbase ${product} ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error(`Coinbase ${product} bad response`);
    for (const [ts, , , , close] of arr) {
      if (close > 0) byDate.set(new Date(ts * 1000).toISOString().slice(0, 10), close);
    }
  }
  if (!byDate.size) throw new Error(`Coinbase ${product} empty`);
  return [...byDate.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
}

async function getCoin(sym) {
  try {
    return await cryptoCompare(sym);
  } catch (e1) {
    try {
      return await coinbasePaged(`${sym}-USD`);
    } catch (e2) {
      throw new Error(`${e1.message}; ${e2.message}`);
    }
  }
}

export default async function handler(req, res) {
  const syms = ["BTC", "ETH", "SOL"];
  const results = await Promise.allSettled(syms.map(getCoin));
  const prices = {};
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") prices[syms[i]] = r.value;
    else errors.push(`${syms[i]}: ${r.reason.message}`);
  });
  if (Object.keys(prices).length === 0) {
    return res.status(502).json({ error: "All majors failed", details: errors });
  }
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({ prices, errors });
}
