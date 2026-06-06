// Dynamic social share image: the live SPX6900 rainbow chart as a 1200x630 PNG.
// Node serverless function — builds the chart SVG (shared with the bot) and
// rasterizes it with resvg. Falls back to the last bundled price if the live
// fetch fails, so the card always renders.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../src/data.js";
import { rainbowSvg } from "../src/rainbow-svg.js";

const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";

async function getPrice() {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}`, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.data?.attributes?.base_token_price_usd); if (p > 0) return p; }
  } catch { /* fall through */ }
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/SPX-USD/ticker", { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.price); if (p > 0) return p; }
  } catch { /* fall through */ }
  return null;
}

export default async function handler(req, res) {
  const price = (await getPrice()) ?? DEFAULT_RAW.at(-1).price;
  const png = new Resvg(rainbowSvg(price), { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).end(png);
}
