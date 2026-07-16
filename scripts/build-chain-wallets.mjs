// Extend the multi-chain wallet-count series FORWARD from the daily snapshot →
// public/chain-wallets.json (read by the wallet-growth card + site chart).
//
// NO DUNE, ZERO CREDITS. The historical series (launch → the bundle's last week) is the
// validated one-time Dune reconstruction src/chain-wallets.js. From that seam forward we
// simply append the daily chain counts snapshot.mjs already banks for FREE — ETH via
// HolderScan, Base via Blockscout, Solana via a public RPC — so the chart keeps growing
// on its own with no query executions. Runs inside the daily snapshot workflow.
//
// SEAM SPLICE: the snapshot's Base source (Blockscout, ~127k) sits ~12.6k ABOVE the
// bundle's Dune reconstruction (~114k) — a holder-DEFINITION gap, not real growth. Naively
// appending it would draw a fake +12.6k Base jump at the handoff. Instead we rebase each
// chain's forward points by the per-chain offset measured at the seam date: the PAST stays
// the reconstruction as-is; the FORWARD points continue the reconstruction's LEVEL while
// carrying the real day-over-day deltas the free sources report. (ETH & Solana offsets are
// ~noise; Base is the meaningful one.)
import { readFile, writeFile } from "node:fs/promises";
import { CHAIN_WALLETS } from "../src/chain-wallets.js";

const OUT = "public/chain-wallets.json";
const HIST = "public/history.json";

// Pure, unit-testable: bundle (past) + rebased daily snapshots (forward).
export function extendForward(bundle, history) {
  if (!bundle?.length) return [];
  const seam = bundle[bundle.length - 1];
  const seamDate = seam.d;

  // snapshot series from history.json — only fully-populated multi-chain days.
  const snaps = (history || [])
    .map(r => ({ d: r?.d, eth: r?.holders, base: r?.holdersBase, sol: r?.holdersSol }))
    .filter(r => r.d && Number.isFinite(r.eth) && Number.isFinite(r.base) && Number.isFinite(r.sol));

  // per-chain offset at the seam (latest snapshot on or before the bundle's last date).
  const at = [...snaps].reverse().find(r => r.d <= seamDate);
  const off = at
    ? { eth: seam.eth - at.eth, base: seam.base - at.base, sol: seam.sol - at.sol }
    : { eth: 0, base: 0, sol: 0 };

  const fwd = snaps
    .filter(r => r.d > seamDate)
    .map(r => ({
      d: r.d,
      eth: Math.round(r.eth + off.eth),
      base: Math.round(r.base + off.base),
      sol: Math.round(r.sol + off.sol),
    }));

  return [...bundle, ...fwd];
}

async function main() {
  let history = [];
  try { history = JSON.parse(await readFile(HIST, "utf8")); }
  catch (e) { console.warn(`no ${HIST} (${e.message}) — writing bundle only`); }

  const series = extendForward(CHAIN_WALLETS, history);
  if (series.length < 50) throw new Error(`only ${series.length} points — refusing to overwrite`);

  const next = JSON.stringify(series);
  let prev = null;
  try { prev = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (prev === next) { console.log(`No change (${series.length} points).`); return; }

  await writeFile(OUT, next);
  const c = series.at(-1), added = series.length - CHAIN_WALLETS.length;
  console.log(`Wrote ${OUT}: ${series.length} points (+${added} forward) · latest ${c.d} ETH ${c.eth} · Base ${c.base} · Sol ${c.sol} = ${c.eth + c.base + c.sol}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-chain-wallets failed:", e.message); process.exit(1); });
}
