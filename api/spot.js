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

// Live Hyperliquid positioning (?hl=1) — CURRENT funding APR + open interest for SPX. Folded in here
// rather than its own function to stay under Vercel Hobby's 12-function cap. metaAndAssetCtxs is public
// (no key). Fails soft to {ok:false} so Deep Field just falls back to the daily-banked value.
async function hlPositioning() {
  const COIN = (process.env.HL_COIN || "SPX").toUpperCase();
  const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) });
  if (!r.ok) return { ok: false, err: "hl " + r.status };
  const [meta, ctxs] = await r.json();
  let i = (meta.universe || []).findIndex(u => u.name === COIN);
  if (i < 0) i = (meta.universe || []).findIndex(u => (u.name || "").toUpperCase().includes("SPX"));
  if (i < 0 || !ctxs?.[i]) return { ok: false, err: "no SPX perp" };
  const c = ctxs[i], hourly = parseFloat(c.funding), mark = parseFloat(c.markPx);
  const oi = parseFloat(c.openInterest) * (mark || 0);
  return { ok: true, coin: COIN, ts: Date.now(),
    fundingAPR: Number.isFinite(hourly) ? +(hourly * 24 * 365 * 100).toFixed(1) : null,
    oi: Number.isFinite(oi) ? Math.round(oi) : null, mark: Number.isFinite(mark) ? mark : null };
}

export default async function handler(req, res) {
  if (req.query && req.query.hl) {
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    try { return res.status(200).json(await hlPositioning()); }
    catch (e) { return res.status(200).json({ ok: false, err: String(e.message || e) }); }
  }
  const errors = [];
  for (const [name, fn] of [["geckoterminal", geckoSpot], ["coinbase", coinbaseSpot]]) {
    try {
      const price = await fn();
      // Short edge cache so many clients polling every ~5s share one upstream hit
      // (~12 upstream req/min worst case, well under GeckoTerminal's free limit).
      // max-age=0 → the BROWSER always revalidates (Safari otherwise heuristically
      // caches this and serves a stale spot price forever); s-maxage keeps the CDN
      // absorbing the upstream so the revalidation is cheap.
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=30");
      return res.status(200).json({ source: name, price, ts: Date.now() });
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return res.status(502).json({ error: "All spot sources failed", details: errors });
}
