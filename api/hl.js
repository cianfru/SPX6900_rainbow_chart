// Live Hyperliquid positioning for SPX — the real-time half of the daily longshort banker. The daily
// cron (build-longshort.mjs) gives the HISTORY (for percentile context); this gives NOW, so Deep Field
// can flash when funding goes vertical during a pump instead of showing yesterday's daily mean.
//
// Reads api.hyperliquid.xyz/info {type:"metaAndAssetCtxs"} (public, no key), finds SPX, and returns the
// current hourly funding rate, its annualised APR, open interest and mark. Server-side so there's no
// browser CORS issue. Cached ~60s at the edge. Fails soft to {} so the desk just falls back to the
// banked daily value.
const HL = "https://api.hyperliquid.xyz/info";
const COIN = (process.env.HL_COIN || "SPX").toUpperCase();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  try {
    const r = await fetch(HL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) });
    if (!r.ok) { res.status(200).json({ ok: false, err: "hl " + r.status }); return; }
    const [meta, ctxs] = await r.json();
    let i = (meta.universe || []).findIndex(u => u.name === COIN);
    if (i < 0) i = (meta.universe || []).findIndex(u => (u.name || "").toUpperCase().includes("SPX"));
    if (i < 0 || !ctxs?.[i]) { res.status(200).json({ ok: false, err: "no SPX perp" }); return; }
    const c = ctxs[i];
    const fundingHourly = parseFloat(c.funding);              // per-hour rate
    const mark = parseFloat(c.markPx);
    const oi = parseFloat(c.openInterest) * (mark || 0);      // OI in coins → USD
    const fundingAPR = Number.isFinite(fundingHourly) ? fundingHourly * 24 * 365 * 100 : null;   // %
    res.status(200).json({
      ok: true, coin: COIN, ts: Date.now(),
      fundingHourly, fundingAPR: fundingAPR == null ? null : +fundingAPR.toFixed(1),
      oi: Number.isFinite(oi) ? Math.round(oi) : null, mark: Number.isFinite(mark) ? mark : null,
    });
  } catch (e) {
    res.status(200).json({ ok: false, err: String(e.message || e) });
  }
}
