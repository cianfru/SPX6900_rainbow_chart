-- ============================================================================
-- SPX6900 on BASE — FULL on-chain reconstruction (every holder, no ≥5k cut)   [Google BigQuery]
-- ============================================================================
-- Base is a small, cheap EVM chain — so we do it exactly like Ethereum: pull the WHOLE history and
-- reconstruct everything locally. No 5k cut at the source. BigQuery bills BYTES SCANNED (not rows),
-- and `WHERE address = <SPX>` prunes to the token either way, so the full set costs the same scan as a
-- filtered one — and it's FREE within BigQuery's 1 TB/month allowance. NO Dune credits.
--
-- Output is the FULL per-wallet daily balance change-log (owner, balance, day) for EVERY holder,
-- including sub-5k balances and drops to zero. That completeness is the point: because exits BELOW any
-- bar are visible, the reconstruction gets current membership by simple forward-fill (a wallet that
-- fell under 5k has a low/zero row → correctly dropped) AND can do cohort / survival / exit analysis —
-- full parity with the Ethereum FIFO suite. (Solana only had a ≥5k slice, which is why it needed the
-- dense-snapshot membership trick; Base doesn't.)
--
-- We decode ERC-20 Transfer straight from the public Base LOGS table (every EVM dataset has `logs`, so
-- this doesn't depend on a decoded token_transfers table existing for Base), then run each wallet's
-- balance forward from the transfer deltas.
--
-- ⚠ VERIFY BEFORE RUNNING (all FREE in the BigQuery explorer):
--   • DATASET: `bigquery-public-data.goog_blockchain_base_mainnet_us.logs` (Google's Base dataset). If
--     Base is exposed under another name in your project, point the FROM at its `logs` table. SHORTCUT:
--     if a DECODED `...base....token_transfers` exists (from_address/to_address/value/token_address),
--     select those 4 raw columns instead and skip the log decode (like bigquery/spx6900_raw_transfers.sql).
--   • COLUMNS on `logs`: block_timestamp · address · topics (ARRAY<STRING>, 0x-prefixed 66-char) · data.
--   • Check the "This query will process N" estimate is < your remaining free TB before running. Get it
--     right in ONE run (don't loop-debug — that's the only way to nibble the free TB).
--   • UNIT: SPX on Base = 8 decimals → output is balance/1e8 (human), reconstruction reads --scale=1.
--     Value precision matches the ETH engine (FLOAT64; a holder's balance is far under 2^53 raw).
--
-- HOW TO RUN: paste → Run → SAVE RESULTS (CSV local if ≤16k rows; else → temp BigQuery table → Export
--   to GCS → download; or `bq query --use_legacy_sql=false --format=csv --max_rows=100000000`). Send the CSV.
-- ============================================================================
CREATE TEMP FUNCTION hexToInt(h STRING) AS (
  -- last 15 hex chars → INT64 (exact for SPX values; a transfer is far under 16^15)
  (SELECT IFNULL(SUM(CAST(STRPOS('0123456789abcdef', SUBSTR(LOWER(h), LENGTH(h) - i + 1, 1)) - 1 AS INT64) * POW(16, i - 1)), 0)
   FROM UNNEST(GENERATE_ARRAY(1, LEAST(LENGTH(h), 15))) AS i)
);
WITH t AS (
  SELECT
    CONCAT('0x', SUBSTR(topics[OFFSET(1)], 27)) AS frm,   -- indexed `from`
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
  SELECT owner, day, SUM(d) AS net FROM deltas GROUP BY owner, day   -- net delta per owner per active day
),
bal AS (
  SELECT owner, day, SUM(net) OVER (PARTITION BY owner ORDER BY day) AS raw_bal FROM daily   -- running balance
)
SELECT owner, raw_bal / 1e8 AS balance, day
FROM bal
WHERE owner <> '0x0000000000000000000000000000000000000000'   -- drop the mint/zero address (nets negative)
ORDER BY owner, day
-- Every holder's full balance path (incl. sub-5k + exits). Reconstruction:
--   node scripts/build-base-onchain.mjs --in=<concat.csv> --scale=1
-- = a copy of build-solana-onchain.mjs with a BASE exclude set, using LEGACY forward-fill membership
-- (current balance = last row; ≥5k → resident). Because sub-5k/exit rows are present, forward-fill is
-- correct here — no dense-snapshot needed. Sanity: current ≥5k residents + a total holder count near
-- the ~114k Blockscout headcount (before infra exclusion).
--
-- ⭐ BASE INFRA TO EXCLUDE (tag on Basescan — NOT residents):
--   • Wormhole bridge custody (Base SPX is bridge-minted)   • Aerodrome + Uniswap-Base LP pools
--   • Coinbase (NATIVE on Base — likely the single largest wallet)   • other CEX hot wallets
--   • the Dec-2024 airdrop distributor (the +50k one-week wallet spike in the growth chart)
--   Raw Base top-100 concentration looks extreme (Gini ~0.99) ONLY because of these — strip them first,
--   exactly as excluding them took ETH's raw top-100 from 68% → 58%.
