// MARKET CONDITIONS — a small set of UNIVERSAL gauges that answer one question: where does SPX sit
// right now versus its own history? Every gauge is scored 0–100 against its OWN full daily history —
// 0 = the cheapest / most oversold this gauge has ever been, 100 = the most expensive / stretched.
// That single scale is what makes them comparable: a raw MVRV of 0.62× and a −73% drawdown mean
// nothing side by side, but "both sit in the cheapest 10% of their own history" is instantly readable.
//
// DELIBERATELY SMALL + PLAIN. We dropped the jargon/near-duplicate signals (MVRV-Z, NUPL, aSOPR) that
// made the old table confusing, and we do NOT invent Bitcoin-only signals SPX can't have (spot-ETF
// flows, options put/call, mining) — we simply leave them out. Each gauge carries a one-line plain
// meaning and a word-state, so a first-time reader understands every row without a glossary.
// Reproducible, method published — a valuation / positioning read, never a buy or sell call.

const SUPPLY = 939e6;   // circulating (1B − 69M burn), ETH-native basis
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// position of `latest` on a 0–100 CHEAP→EXPENSIVE scale within `hist`. dir "low" = a LOW raw value is
// the cheap/oversold end (MVRV, % in profit, funding …); dir "high" = a HIGH raw value is the cheap end
// (used where the metric runs the other way). Returns null if there isn't enough history to rank.
function position(hist, latest, dir) {
  const h = hist.filter(Number.isFinite);
  if (h.length < 60 || !Number.isFinite(latest)) return null;
  const below = h.filter(v => v <= latest).length / h.length;      // fraction of history at/below latest
  return Math.round((dir === "high" ? 1 - below : below) * 100);   // 0 = cheap end, 100 = expensive end
}

// word-state + colour tone from the 0–100 position. Consistent across every gauge so the eye learns it once.
function stateOf(pct) {
  if (pct <= 15) return { state: "deep value", tone: "cheap" };
  if (pct <= 35) return { state: "cheap", tone: "cheap" };
  if (pct <= 65) return { state: "fair", tone: "neutral" };
  if (pct <= 85) return { state: "rich", tone: "rich" };
  return { state: "stretched", tone: "rich" };
}

const fmtReading = (v, fmt) => {
  if (!Number.isFinite(v)) return "—";
  switch (fmt) {
    case "x": return v.toFixed(2) + "×";
    case "pct": return (v > 0 ? "+" : "") + v.toFixed(0) + "%";
    case "pctPlain": return v.toFixed(0) + "%";
    case "usdm": { const a = Math.abs(v); return (v < 0 ? "−" : "+") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(0) + "k" : Math.round(a)); }
    case "score": return Math.round(v) + "/100";
    default: return String(v);
  }
};

// One gauge from a daily series (already oriented raw values). Emits a plain reading, its 0–100
// position, and the word-state. `plain` is the one-line meaning shown under the name.
function gauge(key, label, plain, fmt, dir, series) {
  const s = series.filter(Number.isFinite);
  if (s.length < 60) return null;
  const latest = s[s.length - 1];
  const pct = position(s, latest, dir);
  if (pct == null) return null;
  return { key, label, plain, reading: fmtReading(latest, fmt), latest: +latest.toFixed(4), pct, ...stateOf(pct) };
}

export function valuationCheck(feeds) {
  const { onchain = [], longshort, valuation, ath = 2.28 } = feeds;
  if (onchain.length < 60) return null;
  const col = k => onchain.map(r => r[k]);
  const spot = col("spot"), mvrv = col("mvrv");

  const rows = [];
  // headline: our own blended valuation score. It is ALREADY a 0–100 cheap→expensive scale, so its
  // raw value IS its position on the gauge — do NOT re-rank it by percentile (that double-transforms).
  if (Array.isArray(valuation?.series) && valuation.series.length >= 60) {
    const comp = valuation.series.map(r => (Array.isArray(r) ? r[1] : r?.v) * 100).filter(Number.isFinite);
    if (comp.length >= 60) {
      const v = comp[comp.length - 1], pct = Math.max(0, Math.min(100, Math.round(v)));
      rows.push({ key: "composite", label: "Valuation composite", plain: "our overall blend of the gauges below", reading: fmtReading(v, "score"), latest: +v.toFixed(2), pct, ...stateOf(pct) });
    }
  }
  rows.push(gauge("mvrv", "Price vs. what holders paid", "below 1× means the average holder is under water", "x", "low", mvrv));
  rows.push(gauge("sip", "Coins sitting in a profit", "share of all supply currently above its cost", "pctPlain", "low", col("sip")));
  rows.push(gauge("drawdown", "Drop from the all-time high", `how far below the $${(+ath).toFixed(2)} peak the price is`, "pct", "low", spot.map(p => (p / ath - 1) * 100)));
  rows.push(gauge("nrpl", "Profit vs. loss being cashed in", "are sellers, on net, locking in gains (+) or losses (−)", "usdm", "low", col("nrpl")));
  // crowd positioning (perp funding on Hyperliquid) — universal sentiment; positive = crowd paying to be long
  const ls = Array.isArray(longshort) ? longshort : (longshort?.days || longshort?.rows);
  if (Array.isArray(ls) && ls.length >= 60) {
    const g = gauge("funding", "Traders' positioning", "positive = the crowd pays to be long (greed); negative = pays to be short (fear)", "pct", "low", ls.map(r => (r.hlFunding != null ? r.hlFunding * 100 : null)));
    if (g) rows.push(g);
  }

  const out = rows.filter(Boolean);
  const score = out.find(r => r.key === "composite")?.pct ?? null;
  const cheap = out.filter(r => r.tone === "cheap").length, rich = out.filter(r => r.tone === "rich").length;
  return {
    date: onchain[onchain.length - 1].d, price: +spot[spot.length - 1].toFixed(6),
    score, total: out.length, cheap, rich, rows: out,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const rd = f => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; } };
  const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=public/valuation-check.json").slice(6);
  const r = valuationCheck({ onchain: rd("public/onchain.json") || [], longshort: rd("public/longshort.json"), valuation: rd("public/valuation.json") });
  if (!r) { console.error("valuation-check: not enough data"); process.exit(0); }
  writeFileSync(out, JSON.stringify(r));
  console.error(`market-conditions ${r.date}: score ${r.score}/100 · ${r.cheap} cheap · ${r.rich} rich`);
  for (const s of r.rows) console.error(`  ${s.label.padEnd(32)} ${String(s.reading).padStart(9)}  ${s.pct}/100  ${s.state}`);
}
