-- SPX6900 on BASE — ≥5k balance history for the multi-chain city + holder analysis (the Base sibling
-- of dune/spx6900_solana_balances.sql). Output shape is IDENTICAL: owner, balance, day → feeds the
-- same reconstruction (build-*-onchain.mjs → residents: current balance, holder age, net-flow).
--
-- ⭐ PREFER THE FREE BIGQUERY TWIN: bigquery/spx6900_base_balances.sql does the same job on the public
--   Base dataset for $0 (BigQuery's 1 TB/mo free scan) — no Dune credits. Base is EVM, so BigQuery is
--   the natural cheap path (same as the ETH extract). This Dune version is the alternative/fallback.
--
-- ⭐ WHY THIS STAYS CHEAP (read the Solana header first — same credit lesson). tokens_base.balances_daily
-- is DENSE (Dune carries every wallet's balance FORWARD to every day). A naive "≥5k, all days" pull is
-- the RESULT-READ trap: ~2k ≥5k wallets × ~600 days ≈ 1.2M rows ≈ thousands of read-credits. The FIX is
-- to keep only CHANGE-POINTS: LAG the balance per owner and emit a row only when it differs from the
-- prior ≥5k day (plus each owner's first ≥5k day = the holder-age anchor). That collapses the dense
-- table to a sparse change-log — a few tens of thousands of rows total, a tiny read — while giving
-- everything the city needs (first ≥5k day = age; deltas = flow; ≥5k membership by day).
--
-- ⚠ VERIFY BEFORE RUNNING (all FREE — schema browser + a bounded probe; Dune churns these):
--   • table:   tokens_base.balances_daily        (dense/forward-filled; same table the wallet-count query uses)
--   • columns: address · token_address · balance · day   (older vintage: wallet_address · amount)
--   • UNIT of `balance`: RAW base units (SPX Base decimals = 8) or human? This query assumes RAW and
--     filters `balance >= 5000 * 1e8`, outputs `balance/1e8` (human) — matching the Solana CSV, which
--     the reconstruction reads at --scale=1. If balances_daily is already HUMAN, change the filter to
--     `balance >= 5000` and drop the `/1e8`. CHECK a known wallet's value first (free).
--   • Filter token_address FIRST (as below) so the scan is pruned to SPX — never scan the whole table.
--
-- ⭐ CANARY DISCIPLINE (do NOT skip): run PHASE 1 (the 2026 slice) ONLY, then read BOTH the execution
--   credits AND the API result-read credits for downloading it. rows × (read-credits ÷ rows) × projected
--   total rows = the full read bill. If that's over budget, aggregate harder before PHASE 2. A bounded
--   single-chunk run is a few credits; a full-history dense pull without the LAG collapse is not.
--
-- ── PHASE 1 — the 2026 slice first (validate, cheap) ────────────────────────────────────────────────
--   {{day_lo}}=2026-01-01  {{day_hi}}=<today>.  Then reconstruct + sanity-check the numbers before history.
-- ── PHASE 2 — full history (backfill for true ages) ─────────────────────────────────────────────────
--   Base SPX deployed ~2024; step {{day_lo}}/{{day_hi}} in ~quarter chunks from the deploy month to now,
--   concat the CSVs OFFLINE, feed the reconstruction. Chunking keeps each run under the 2-min wall.
WITH params AS (
  SELECT 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c AS token   -- SPX6900 on Base (decimals = 8)
),
bal AS (
  SELECT
    address                       AS owner,
    CAST(balance AS double) / 1e8 AS bal,       -- ⚠ /1e8 assumes RAW; drop if balances_daily is human
    CAST(day AS date)             AS day
  FROM tokens_base.balances_daily
  WHERE token_address = (SELECT token FROM params)
    AND balance >= 5000 * 1e8                   -- ⚠ ≥5k in RAW base units (verify the unit)
    AND CAST(day AS date) >= DATE '{{day_lo}}'
    AND CAST(day AS date) <  DATE '{{day_hi}}'
),
chg AS (
  SELECT owner, bal, day,
         LAG(bal) OVER (PARTITION BY owner ORDER BY day) AS prev
  FROM bal
)
SELECT owner, bal AS balance, day
FROM chg
WHERE prev IS NULL OR bal <> prev              -- first ≥5k day (age anchor) + every balance change
ORDER BY owner, day
-- Reconstruction: node scripts/build-base-onchain.mjs --in=<concat.csv> --scale=1 (a copy of
--   build-solana-onchain.mjs with a BASE exclude set). CURRENT residency should come from a live
--   snapshot (Blockscout top-holders or a Dune daily delta on this table), NOT forward-fill — a ≥5k
--   change-log can't see drops below the bar, exactly as on Solana.
--
-- ⭐ BASE INFRA TO EXCLUDE (tag on Basescan, like the ETH/Solana sets — these are NOT residents):
--   • Wormhole bridge custody (Base SPX is bridge-minted)   • Aerodrome + Uniswap-Base LP pools
--   • Coinbase (NATIVE on Base — likely the single largest wallet)   • other CEX hot wallets
--   • the Dec-2024 airdrop distributor (the +50k one-week wallet spike the growth chart shows)
--   Raw top-100 concentration on Base looks extreme (Gini ~0.99) ONLY because of these — strip them
--   first, exactly as excluding them took ETH's raw top-100 from 68% to 58%.
