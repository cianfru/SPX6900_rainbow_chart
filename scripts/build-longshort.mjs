// FOUNDATION banker: accumulate Binance futures Long/Short positioning for SPX6900
// into public/longshort.json (append-only, grows daily). The top-trader L/S ratios
// are a Binance analytics product (ITC's "Long/Short Ratios" chart); Binance is
// SPX's main venue. On-chain Hyperliquid funding/OI is a planned COMPLEMENT (its
// API exposes funding + open interest, not the top-trader L/S — a different metric).
//
// Binance's L/S endpoints only serve the last ~30 days, so we MERGE each run's
// window into the growing file — the history accumulates going forward. Runs in CI
// (the APIs are blocked from the dev sandbox); the chart fills in as days bank.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "public/longshort.json";
const BASE = "https://fapi.binance.com/futures/data";
// SPX6900's exact Binance PERP symbol is unverified from here — try candidates and
// use the first that returns data (the CI log reports which worked). Override with
// the repo variable BINANCE_LS_SYMBOL once we know it.
const CANDIDATES = process.env.BINANCE_LS_SYMBOL ? [process.env.BINANCE_LS_SYMBOL] : ["SPXUSDT", "SPX6900USDT", "1000SPXUSDT"];

async function fetchRatio(kind, symbol) {
  const r = await fetch(`${BASE}/${kind}?symbol=${symbol}&period=1d&limit=30`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${kind} ${r.status}`);
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) throw new Error(`${kind} empty`);
  return arr; // [{ longShortRatio, longAccount/longPosition, shortAccount, timestamp }, …]
}

async function forSymbol(symbol) {
  const [ta, tp, ga] = await Promise.all([
    fetchRatio("topLongShortAccountRatio", symbol),
    fetchRatio("topLongShortPositionRatio", symbol),
    fetchRatio("globalLongShortAccountRatio", symbol),
  ]);
  const byDate = new Map();
  const put = (arr, key) => { for (const d of arr) { const date = new Date(+d.timestamp).toISOString().slice(0, 10); const o = byDate.get(date) || { date }; o[key] = parseFloat(d.longShortRatio); byDate.set(date, o); } };
  put(ta, "topAcct"); put(tp, "topPos"); put(ga, "globalAcct");
  return [...byDate.values()];
}

async function main() {
  console.log("Fetching Binance top-trader Long/Short ratios…");
  let rows = null, used = null;
  for (const sym of CANDIDATES) {
    try { const r = await forSymbol(sym); if (r.length) { rows = r; used = sym; break; } }
    catch (e) { console.warn(`  ${sym}: ${e.message}`); }
  }
  if (!rows) throw new Error(`no Binance L/S data for any of [${CANDIDATES.join(", ")}] — is SPX6900 listed on Binance FUTURES? If under another symbol, set repo var BINANCE_LS_SYMBOL.`);
  console.log(`Binance symbol: ${used} · fetched ${rows.length} days (${rows[0].date} → ${rows.at(-1).date})`);

  // merge into the accumulating file — union by date, this run's values win.
  let prev = [];
  try { const p = JSON.parse(await readFile(OUT, "utf8")); if (Array.isArray(p)) prev = p; } catch { /* first run */ }
  const byDate = new Map(prev.map(r => [r.date, r]));
  for (const r of rows) byDate.set(r.date, { ...byDate.get(r.date), ...r });
  const merged = [...byDate.values()].filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const next = JSON.stringify(merged);
  let old = null; try { old = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (old === next) { console.log(`No change (${merged.length} days banked).`); return; }
  await writeFile(OUT, next);
  const last = merged.at(-1);
  console.log(`Wrote ${OUT}: ${merged.length} days · ${merged[0].date} → ${last.date} · latest topAcct=${last.topAcct} topPos=${last.topPos} global=${last.globalAcct}`);
}

main().catch(e => { console.error("build-longshort failed:", e.message); process.exit(1); });
