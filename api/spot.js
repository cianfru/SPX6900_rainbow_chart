// Live SPX6900 spot price (near-real-time), separate from the daily-candle history.
// Source of truth is the SPX6900/WETH Uniswap V2 pool on Ethereum via GeckoTerminal,
// which reports the current on-chain price; Coinbase spot ticker is a fallback.
const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const NETWORK = "eth";

async function geckoSpot() {
  // Pool endpoint exposes the current USD price of the base token (SPX6900).
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK}/pools/${POOL}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = await res.json();
  const p = parseFloat(json?.data?.attributes?.base_token_price_usd);
  if (!(p > 0)) throw new Error("GeckoTerminal: no price");
  return p;
}

async function coinbaseSpot() {
  const url = `https://api.exchange.coinbase.com/products/SPX-USD/ticker`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  const json = await res.json();
  const p = parseFloat(json?.price);
  if (!(p > 0)) throw new Error("Coinbase: no price");
  return p;
}

export default async function handler(req, res) {
  const errors = [];
  for (const [name, fn] of [["geckoterminal", geckoSpot], ["coinbase", coinbaseSpot]]) {
    try {
      const price = await fn();
      // Short edge cache so many clients polling every ~5s share one upstream hit
      // (~12 upstream req/min worst case, well under GeckoTerminal's free limit).
      res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=30");
      return res.status(200).json({ source: name, price, ts: Date.now() });
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return res.status(502).json({ error: "All spot sources failed", details: errors });
}
