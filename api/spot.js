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

// ── Daily-candle HISTORY (?history=1) — merged in from the former api/prices.js to reclaim a Vercel
// Hobby function slot (both endpoints hit the SAME GeckoTerminal pool, so one file serves both). The
// live spot above and this history share the pool; the daily candles backfill the drawn line's gaps.
async function histGeckoTerminal() {
  // Up to 1000 daily candles, newest-first — full history for a token launched Aug 2023.
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK}/pools/${POOL}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const list = (await res.json())?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list) || list.length === 0) throw new Error("GeckoTerminal: empty response");
  return list.map(([ts, , , , close]) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: close }))
    .filter(p => p.price > 0).sort((a, b) => a.date.localeCompare(b.date));
}
async function histCoinbase() {
  // Max 300 daily candles (86400s granularity); SPX-USD listed Feb 2025. [[ts,low,high,open,close,vol]…]
  const end = Math.floor(Date.now() / 1000), start = end - 300 * 86400;
  const url = `https://api.exchange.coinbase.com/products/SPX-USD/candles?granularity=86400&start=${start}&end=${end}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Coinbase: empty");
  return arr.map(([ts, , , , close]) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: close }))
    .filter(p => p.price > 0).sort((a, b) => a.date.localeCompare(b.date));
}
async function histBybit() {
  // 1000 daily SPXUSDT spot candles, newest-first strings: [start,open,high,low,close,vol,turnover]
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=SPXUSDT&interval=D&limit=1000`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const list = (await res.json())?.result?.list;
  if (!Array.isArray(list) || list.length === 0) throw new Error("Bybit: empty");
  return list.map(row => ({ date: new Date(parseInt(row[0], 10)).toISOString().slice(0, 10), price: parseFloat(row[4]) }))
    .filter(p => p.price > 0).sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req, res) {
  // ?history=1 → daily-candle history (the former /api/prices; kept reachable via a vercel.json rewrite)
  if (req.query && req.query.history) {
    const errors = [];
    for (const [name, fn] of [["geckoterminal", histGeckoTerminal], ["coinbase", histCoinbase], ["bybit", histBybit]]) {
      try {
        const prices = await fn();
        if (prices.length > 0) {
          res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
          return res.status(200).json({ source: name, prices });
        }
      } catch (err) { errors.push(`${name}: ${err.message}`); }
    }
    return res.status(502).json({ error: "All sources failed", details: errors });
  }
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
