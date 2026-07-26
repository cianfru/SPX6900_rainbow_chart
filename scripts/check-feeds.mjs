// ============================================================================
// FEED CHECK — reach every upstream now, write nothing
// ============================================================================
//   node scripts/check-feeds.mjs            # exits 1 if a required feed is down
//   node scripts/check-feeds.mjs --warn     # report only
//
// audit-feeds.mjs reads what has already been banked; this asks the upstreams
// directly, on demand, so a broken feed can be found in a minute rather than at
// 00:17 UTC tomorrow. Run it after touching a fetcher, or when something looks stale.
//
// It calls THE SAME functions the snapshot cron calls — imported from snapshot.mjs,
// not reimplemented — because a probe that reimplements what it is probing drifts
// from it and then reassures you about code that is not running. snapshot.mjs guards
// its main() behind a direct-run check so importing it here banks nothing.
//
// Required vs optional is a judgement about what breaks if it is missing: the price
// and the ETH holder numbers are load-bearing for most of the site, while the Base
// and Solana counts feed two charts that degrade to their bundled history.
import {
  price, fng, sp500, softHs, baseHolders, baseSupply, solHolders, solSupply,
  total3es, cexLpBalances,
} from "./snapshot.mjs";

const WARN_ONLY = process.argv.includes("--warn");
const fNum = n => typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(n);

// ok(v) decides whether what came back is usable; expect describes the sane range,
// so a feed answering with something absurd reads as a failure rather than a number.
const CHECKS = [
  { name: "price", req: true, what: "SPX spot (GeckoTerminal → Coinbase)",
    run: price, ok: v => v > 0, expect: "> 0", show: v => `$${v}` },
  { name: "holders", req: true, what: "ETH holder count (HolderScan)",
    run: () => softHs("/holders"), ok: v => v?.holder_count > 1000,
    expect: "> 1,000", show: v => `${fNum(v?.holder_count)} holders` },
  { name: "pnl", req: true, what: "cost basis + PnL (HolderScan)",
    run: () => softHs("/stats/pnl"), ok: v => v?.break_even_price > 0,
    expect: "break-even > 0", show: v => `break-even $${v?.break_even_price}` },
  { name: "supply", req: true, what: "holder tiers (HolderScan)",
    run: () => softHs("/stats/supply-breakdown"), ok: v => v != null,
    expect: "an object", show: v => Object.keys(v || {}).slice(0, 4).join(", ") },
  { name: "fng", req: true, what: "Fear & Greed (alternative.me)",
    run: fng, ok: v => v >= 0 && v <= 100, expect: "0–100", show: v => String(v) },
  { name: "sp500", req: true, what: "S&P 500 close",
    run: sp500, ok: v => v > 1000, expect: "> 1,000", show: v => fNum(v) },

  { name: "cex/lp balances", req: true, what: "exchange + LP balances (public ETH RPC)",
    // The field that was null for 53 days. Required now precisely because it silently
    // was not: a probe that lets this one slide is the probe that missed it.
    run: cexLpBalances, ok: v => v?.cexBal > 50e6 && v?.lpBal > 1e6,
    expect: "cexBal > 50M, lpBal > 1M SPX",
    show: v => `exchanges ${fNum(v?.cexBal)} · LP ${fNum(v?.lpBal)} SPX` },

  { name: "base holders", req: false, what: "Base holder count (Blockscout)",
    run: baseHolders, ok: v => v > 10000, expect: "> 10,000", show: fNum },
  { name: "base supply", req: false, what: "Base bridged supply (Blockscout)",
    run: baseSupply, ok: v => v > 1e6, expect: "> 1M", show: v => fNum(Math.round(v)) },
  { name: "sol holders", req: false, what: "Solana holder count (public RPC)",
    run: solHolders, ok: v => v > 10000, expect: "> 10,000", show: fNum },
  { name: "sol supply", req: false, what: "Solana bridged supply (public RPC)",
    run: solSupply, ok: v => v > 1e6, expect: "> 1M", show: v => fNum(Math.round(v)) },
  { name: "total3es", req: false, what: "alt-market cap (CoinGecko + DefiLlama)",
    run: total3es, ok: v => v > 20e9, expect: "> $20B", show: v => `$${(v / 1e9).toFixed(1)}B` },
];

async function main() {
  console.log(`feed check — ${new Date().toISOString().slice(0, 19)}Z\n`);
  const down = [];

  for (const c of CHECKS) {
    const t0 = Date.now();
    let v = null, err = null;
    try { v = await c.run(); } catch (e) { err = e.message; }
    const ms = Date.now() - t0;
    const good = !err && c.ok(v);
    if (!good && c.req) down.push(c.name);

    const tag = good ? "  ok " : (c.req ? "FAIL " : "warn ");
    const detail = err ? `threw: ${err}`
      : v == null ? `returned null (expected ${c.expect})`
      : good ? c.show(v)
      : `${c.show(v)} — outside the sane range (${c.expect})`;
    console.log(`${tag} ${String(ms).padStart(5)}ms  ${c.name.padEnd(16)} ${detail}`);
    if (!good) console.log(`              ↳ ${c.what}`);
  }

  const reqDown = down.length;
  console.log(`\n${CHECKS.length - reqDown} of ${CHECKS.length} feeds answered usefully`);
  if (reqDown) {
    console.log(`REQUIRED FEEDS DOWN: ${down.join(", ")}`);
    console.log("The next snapshot would bank nulls for these. Fix before it runs.");
  } else {
    console.log("Every required upstream is reachable — the next snapshot has what it needs.");
  }
  if (reqDown && !WARN_ONLY) process.exit(1);
}

main().catch(e => { console.error("check-feeds:", e); process.exit(2); });
