const BASE = "https://api.holderscan.com/v0/eth/tokens";
const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";

export default async function handler(req, res) {
  const key = process.env.VITE_HOLDERSCAN_KEY;
  if (!key) {
    return res.status(500).json({ error: "No API key configured" });
  }

  const { endpoint } = req.query;
  const allowed = [
    "/holders/deltas",
    "/holders/breakdowns",
    "/stats",
    "/stats/pnl",
    "/stats/supply-breakdown",
    "/holders?limit=10",
  ];

  if (!allowed.includes(endpoint)) {
    return res.status(400).json({ error: "Invalid endpoint" });
  }

  try {
    const url = `${BASE}/${CONTRACT}${endpoint}`;
    const response = await fetch(url, {
      headers: { "x-api-key": key, "Accept": "application/json" },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Holderscan returned ${response.status}` });
    }

    const data = await response.json();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
