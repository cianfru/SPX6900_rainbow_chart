-- ============================================================================
-- SPX6900 on BASE — ≥5k balance history, the FREE way   [Google BigQuery]
-- ============================================================================
-- The BigQuery twin of dune/spx6900_base_balances.sql (owner,balance,day → same reconstruction).
-- Base is an EVM chain, so this is the SAME cheap path as the ETH extract (bigquery/
-- spx6900_raw_transfers.sql) — FREE within BigQuery's 1 TB/month scan allowance. NO Dune credits.
--
-- We decode ERC-20 Transfer straight from the public Base LOGS table (every EVM dataset has `logs`,
-- so this doesn't depend on a decoded token_transfers table existing for Base). Then we reconstruct
-- each wallet's running balance from the transfer deltas and keep the ≥5k days — a sparse change-log
-- (one row per wallet per day it moved while ≥5k), which is a tiny result. That gives everything the
-- city needs: first ≥5k day = holder age, deltas = flow, ≥5k membership by day.
--
-- ⚠ VERIFY BEFORE RUNNING (all FREE in the BigQuery explorer — dataset/column names differ by vintage):
--   • DATASET: `bigquery-public-data.goog_blockchain_base_mainnet_us.logs` (Google's Base dataset).
--     If your project exposes Base under a different name, point the FROM at its `logs` table.
--     SHORTCUT: if a DECODED `...base....token_transfers` table exists (from_address/to_address/value/
--     token_address), skip the log decode entirely and select those 4 columns like the ETH query does.
--   • COLUMNS on `logs`: block_timestamp · address · topics (ARRAY<STRING>, 0x-prefixed 66-char) · data.
--   • Confirm the free-tier scan estimate (the "This query will process N" note) is < your remaining TB
--     before running. Filtering address to SPX keeps it small; still, get it right in ONE run.
--
-- ⚠ UNIT: SPX on Base has 8 decimals → this outputs balance/1e8 (human), matching the Solana CSV, which
--   the reconstruction reads at --scale=1. Individual holder balances (< ~90M SPX) are exact in FLOAT64;
--   only infra-scale wallets exceed that, and those are excluded at reconstruction anyway.
--
-- HOW TO RUN: paste → Run → SAVE RESULTS (CSV local if ≤16k rows; else → BigQuery table → Export to GCS
--   → download; or the bq CLI with --format=csv). Send Claude the CSV.
--
-- CHUNKING (optional, for a smaller single export — cost is unchanged, it's bytes-scanned not rows):
--   add  AND block_timestamp >= '2024-01-01' AND block_timestamp < '2025-01-01'  and run per year,
--   concat the CSVs OFFLINE. Base SPX deployed ~2024, so ~2 year-chunks cover it.
-- ============================================================================
CREATE TEMP FUNCTION hexToInt(h STRING) AS (
  -- last 15 hex chars → INT64 (exact for SPX raw values; a holder's balance is far under 16^15)
  (SELECT IFNULL(SUM(CAST(STRPOS('0123456789abcdef', SUBSTR(LOWER(h), LENGTH(h) - i + 1, 1)) - 1 AS INT64) * POW(16, i - 1)), 0)
   FROM UNNEST(GENERATE_ARRAY(1, LEAST(LENGTH(h), 15))) AS i)
);
WITH t AS (
  SELECT
    CONCAT('0x', SUBSTR(topics[OFFSET(1)], 27)) AS frm,   -- indexed `from` (last 40 hex of the 32-byte topic)
    CONCAT('0x', SUBSTR(topics[OFFSET(2)], 27)) AS too,   -- indexed `to`
    hexToInt(SUBSTR(data, 3))                   AS val,   -- non-indexed uint256 value (strip 0x)
    DATE(block_timestamp)                       AS day
  FROM `bigquery-public-data.goog_blockchain_base_mainnet_us.logs`
  WHERE address = LOWER('0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C')                          -- SPX6900 on Base
    AND topics[OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'  -- Transfer(address,address,uint256)
    AND ARRAY_LENGTH(topics) = 3                                                                -- ERC-20 (from,to indexed; value in data)
),
deltas AS (
  SELECT too AS owner,  val AS d, day FROM t   -- receiver gains
  UNION ALL
  SELECT frm AS owner, -val AS d, day FROM t   -- sender loses
),
daily AS (
  SELECT owner, day, SUM(d) AS net FROM deltas GROUP BY owner, day   -- one net delta per owner per active day
),
bal AS (
  SELECT owner, day, SUM(net) OVER (PARTITION BY owner ORDER BY day) AS raw_bal FROM daily   -- running balance
)
SELECT owner, raw_bal / 1e8 AS balance, day
FROM bal
WHERE raw_bal >= 5000 * 1e8            -- ≥5k cohort (the read-size lever) — the mint 0x000…000 nets negative, excluded
ORDER BY owner, day
-- Reconstruction: node scripts/build-base-onchain.mjs --in=<concat.csv> --scale=1  (a copy of
--   build-solana-onchain.mjs with a BASE exclude set). CURRENT residency should come from a live
--   snapshot (Blockscout top-holders, already used for the Base headcount) or a daily BigQuery delta —
--   NOT forward-fill, since a ≥5k change-log can't see drops below the bar (same as Solana).
--
-- ⭐ BASE INFRA TO EXCLUDE (tag on Basescan, like the ETH/Solana sets — NOT residents):
--   • Wormhole bridge custody (Base SPX is bridge-minted)   • Aerodrome + Uniswap-Base LP pools
--   • Coinbase (NATIVE on Base — likely the single largest wallet)   • other CEX hot wallets
--   • the Dec-2024 airdrop distributor (the +50k one-week wallet spike in the growth chart)
--   Raw Base top-100 concentration looks extreme (Gini ~0.99) ONLY because of these — strip them
--   first, exactly as excluding them took ETH's raw top-100 from 68% → 58%.
