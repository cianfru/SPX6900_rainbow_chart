// VALUATION / CAPITULATION CHECK — the VanEck-style signal table for SPX6900. Every signal is scored by
// its PERCENTILE against its OWN full history (daily), flagged "firing" when it sits in the extreme
// value zone (≤15th percentile toward capitulation), and "hit in 3mo" when it reached that zone at any
// point in the trailing 90 days. Reproducible, method published — no black box.
//
// HONEST SCOPE: SPX genuinely has ~10 of the BTC signal set, but NOT the Bitcoin-only ones — there is no
// spot ETF, no listed options market, and no mining, so ETF net-flows / options put-call / Puell-Multiple
// / mining-difficulty simply do not exist for SPX. We omit them and SAY SO, rather than invent a number.
// And SPX is ~3 years old: percentiles are against a short history, so "extreme" means extreme for SPX's
// life, not a decade. Stated on the surface. A valuation-POSITION read, never a buy/sell call.

const SUPPLY = 939e6;                 // circulating (1B − 69M burn), ETH-native basis
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

// oriented capitulation-percentile of `latest` within `hist`: for dir "low" a LOW value is the value/
// capitulation extreme (fraction of history ≤ latest); for dir "high" a HIGH value is (fraction ≥ latest).
function capPct(hist, latest, dir) {
  const n = hist.length; if (!n) return null;
  const c = dir === "high" ? hist.filter(v => v >= latest).length : hist.filter(v => v <= latest).length;
  return c / n;
}

// One signal from a daily series (already oriented values). Computes latest, 30d avg, the 90-day
// capitulation-extreme, their percentiles, firing + hit-in-3mo.
function signal(key, label, fmt, dir, series) {
  const s = series.filter(Number.isFinite);
  if (s.length < 60) return null;
  const latest = s[s.length - 1];
  const w30 = s.slice(-30), w90 = s.slice(-90);
  const extreme = dir === "high" ? Math.max(...w90) : Math.min(...w90);   // most-capitulation value in 90d
  const pLatest = capPct(s, latest, dir), pExtreme = capPct(s, extreme, dir);
  const FIRE = 0.15;
  return {
    key, label, fmt, dir,
    latest: +latest.toFixed(4), avg30: +mean(w30).toFixed(4), extreme90: +extreme.toFixed(4),
    pLatest: Math.round(pLatest * 100), pExtreme: Math.round(pExtreme * 100),
    firing: pLatest <= FIRE, hit3mo: pExtreme <= FIRE,
  };
}

export function valuationCheck(feeds) {
  const { onchain = [], longshort, valuation, ath = 2.28 } = feeds;
  if (onchain.length < 60) return null;
  const col = k => onchain.map(r => r[k]);
  const spot = col("spot"), rp = col("rp"), mvrv = col("mvrv");
  const mcap = spot.map(p => p * SUPPLY), rcap = rp.map(p => p * SUPPLY);
  const sdM = std(mcap.filter(Number.isFinite)) || 1;

  const rows = [
    signal("mvrv", "MVRV (price ÷ realized)", "x", "low", mvrv),
    signal("mvrvz", "MVRV Z-Score", "num2", "low", onchain.map((_, i) => (mcap[i] - rcap[i]) / sdM)),
    signal("nupl", "NUPL (net unrealized P/L)", "num2", "low", mvrv.map(m => (m ? 1 - 1 / m : null))),
    signal("drawdown", "Drawdown from ATH", "pct", "low", spot.map(p => (p / ath - 1) * 100)),
    signal("nrpl", "Net realized P/L (USD)", "usdm", "low", col("nrpl")),
    signal("sopr", "aSOPR (spent-output profit ratio)", "num3", "low", col("sopr")),
    signal("sip", "% supply in profit", "pct", "low", col("sip")),
    signal("lth", "Long-term holder supply share", "pct", "high", onchain.map(r => (r.lthProfit || 0) + (r.lthLoss || 0))),
    signal("liveliness", "Liveliness (coins dormant ↔ active)", "num3", "low", col("liveliness")),
  ].filter(Boolean);

  // Perp funding (Hyperliquid) — negative = shorts paying = capitulation. Its own series/history.
  const ls = Array.isArray(longshort) ? longshort : (longshort?.days || longshort?.rows);
  if (Array.isArray(ls) && ls.length >= 60) {
    const f = signal("funding", "Perp funding rate (Hyperliquid)", "pct", "low", ls.map(r => (r.hlFunding != null ? r.hlFunding * 100 : null)));
    if (f) rows.push(f);
  }
  // The valuation composite as the summary lens (0 = cheapest).
  if (Array.isArray(valuation?.series) && valuation.series.length >= 60) {
    const c = signal("composite", "Valuation composite", "pctile", "low", valuation.series.map(r => (Array.isArray(r) ? r[1] : r?.v) * 100));
    if (c) rows.push(c);
  }

  const firing = rows.filter(r => r.firing).length, hit = rows.filter(r => r.hit3mo).length;
  return {
    date: onchain[onchain.length - 1].d, price: +spot[spot.length - 1].toFixed(6),
    total: rows.length, firing, hit, rows,
    // BTC-only signals we deliberately DON'T fake, surfaced so the omission is explicit + honest.
    omitted: ["US spot ETF net flows (no SPX ETF)", "Options put/call (no options market)", "Puell Multiple & mining difficulty (no mining)"],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const rd = f => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; } };
  const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=public/valuation-check.json").slice(6);
  const r = valuationCheck({ onchain: rd("public/onchain.json") || [], longshort: rd("public/longshort.json"), valuation: rd("public/valuation.json") });
  if (!r) { console.error("valuation-check: not enough data"); process.exit(0); }
  writeFileSync(out, JSON.stringify(r));
  console.error(`valuation-check ${r.date}: ${r.firing}/${r.total} firing · ${r.hit}/${r.total} hit in 3mo`);
  for (const s of r.rows) console.error(`  ${(s.firing ? "🟢" : "  ")} ${s.label.padEnd(38)} p${s.pLatest} ${s.firing ? "FIRING" : ""}${s.hit3mo ? " (hit 3mo)" : ""}`);
}
