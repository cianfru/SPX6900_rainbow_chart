// Refresh public/chain-wallets.json — the multi-chain wallet-count series
// (ETH + Base + Solana) the wallet-growth card + site chart read (bundle fallback).
//
// RELIABILITY DECISION (2026-07-16): the Base + Solana per-wallet as-of reconstructions
// are too heavy to EXECUTE on Dune's free-tier API (Solana returns empty, Base
// intermittently QUERY_STATE_FAILED), and reading their cached results proved fragile
// (a query's cache gets overwritten when its SQL is edited). So we do NOT touch Dune
// here at all. Instead:
//   • Base + Solana come from the committed BUNDLE (src/chain-wallets.js) — correct and
//     slow-moving; refreshed occasionally by re-bundling from a fresh CSV (owner sends it).
//   • ETH is overlaid from public/onchain.json (holder_count_eth, auto-refreshed weekly by
//     onchain.yml), so the total still ticks up every week with no fragile external calls.
// This can't fail on rate limits, heavy queries, or stale caches — it's a pure local merge.
import { readFile, writeFile } from "node:fs/promises";
import { CHAIN_WALLETS } from "../src/chain-wallets.js";

const OUT = "public/chain-wallets.json";

async function main() {
  // Fresh ETH holder counts from onchain.json (weekly), keyed by date.
  const eth = new Map();
  try {
    const oc = JSON.parse(await readFile("public/onchain.json", "utf8"));
    for (const r of oc) if (r?.d && r.holders > 0) eth.set(r.d, Math.round(r.holders));
  } catch { /* fall back to the bundle's ETH below */ }

  // Bundle is the spine (correct Base/Solana + full week set); overlay fresh ETH where we have it.
  const series = CHAIN_WALLETS.map(r => ({
    d: r.d,
    eth: eth.get(r.d) ?? r.eth,
    base: r.base,
    sol: r.sol,
  }));
  if (series.length < 50) throw new Error(`only ${series.length} rows — refusing to overwrite`);

  const next = JSON.stringify(series);
  let prev = null;
  try { prev = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (prev === next) { console.log(`No change (${series.length} weeks).`); return; }

  await writeFile(OUT, next);
  const c = series.at(-1);
  console.log(`Wrote ${OUT}: ${series.length} weeks · latest ETH ${c.eth} · Base ${c.base} · Sol ${c.sol} = ${c.eth + (c.base || 0) + (c.sol || 0)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-chain-wallets failed:", e.message); process.exit(1); });
}
