-- ============================================================================
-- SPX6900 — RAW TRANSFERS, the FREE (no-Dune-credit) way   [Google BigQuery]
-- ============================================================================
-- Same job as dune/spx6900_raw_transfers.sql, but sourced from the PUBLIC Ethereum
-- dataset on BigQuery — which is FREE (1 TB of query scan per month, no charge). Use this
-- when Dune credits are spent (they only reset monthly) and you don't want to wait.
--
-- WHY IT FITS THE FREE TIER: this is a plain filtered SELECT of 4 columns from one token —
-- BigQuery bills by BYTES SCANNED, and even scanning the whole token_transfers table for
-- these columns is well under the 1 TB/month free allowance for a SINGLE run. Get the query
-- right first (it's trivial), then run ONCE. (Don't loop-debug it — that's the only way to
-- nibble the free TB.)
--
-- HOW TO RUN (console.cloud.google.com/bigquery, any free Google account):
--   1. Paste the query, Run.
--   2. Results > SAVE RESULTS. If ≤ ~16k rows: "CSV (local file)". If more (likely — SPX
--      has lots of transfers): "BigQuery table" (a temp table), then that table's EXPORT >
--      "Export to GCS" as CSV, and download from the bucket. Or use the bq CLI:
--        bq query --use_legacy_sql=false --format=csv --max_rows=100000000 \
--          "$(cat bigquery/spx6900_raw_transfers.sql)" > transfers.csv
--   3. Send Claude transfers.csv → `node scripts/build-onchain-local.mjs --transfers=transfers.csv --prices=prices.csv`.
--
-- PRICE CSV: you do NOT need a second query for price — we already bundle the full daily
-- SPX/USD series (src/spx-daily.js, CoinGecko "max"). Claude emits prices.csv from that
-- bundle locally, so this transfers pull is the ONLY thing you need to fetch.
--
-- Column headers (sender/receiver/time/value) match what the local FIFO engine auto-detects;
-- `value` is the RAW 8-decimal integer — the engine scales by 1e8, so do NOT divide here.
--
-- INTRA-BLOCK ORDERING (validated 2026-07-19): block_timestamp is per-BLOCK (second
-- granularity), so a receive and a send in the SAME block share a timestamp with no order.
-- The engine handles this by replaying each same-timestamp block RECEIVES-first (a send
-- can't spend what it hasn't received) — which reconciles exactly to the Dune ground truth
-- (rp $0.534, 49,566 holders, 687.7M held). For a future re-bundle you can get EXACT
-- ordering instead by also selecting `block_number` and `log_index` and sorting by them —
-- then the receives-first heuristic is unnecessary. Not needed now (heuristic reconciles).
-- ============================================================================

SELECT
  from_address    AS sender,
  to_address      AS receiver,
  block_timestamp AS time,
  value           AS value          -- raw (8-decimal); engine divides by 1e8
FROM `bigquery-public-data.crypto_ethereum.token_transfers`
WHERE token_address = '0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c';   -- SPX6900 (Ethereum)
-- (no ORDER BY — the engine re-sorts by timestamp anyway; sorting in BQ just costs time.)

-- If you ever want to CHUNK by year to keep a single export small (file size, not cost):
--   AND block_timestamp >= '2024-01-01' AND block_timestamp < '2025-01-01'
-- Run once per year, concat the CSVs offline — the engine re-sorts anyway.
