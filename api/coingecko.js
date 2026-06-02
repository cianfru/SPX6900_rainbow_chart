const COIN_ID = "spx6900";

export default async function handler(req, res) {
  const key = process.env.COINGECKO_KEY || "";
  const url = `https://api.coingecko.com/api/v3/coins/${COIN_ID}/market_chart?vs_currency=usd&days=max&interval=daily`;

  try {
    const headers = { "Accept": "application/json" };
    if (key) headers["x-cg-demo-api-key"] = key;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `CoinGecko returned ${response.status}`,
        hint: response.status === 401 ? "Add COINGECKO_KEY env var (free Demo key from coingecko.com)" : undefined,
      });
    }

    const data = await response.json();
    const prices = (data.prices || []).map(([ts, price]) => ({
      date: new Date(ts).toISOString().slice(0, 10),
      price,
    }));

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ prices });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
