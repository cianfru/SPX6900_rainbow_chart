-- SPX6900 on SOLANA — SPL transfer history for the city (holder AGE + recent NET-FLOW).
-- Balance is NOT reconstructed here: we already pull per-wallet balances FREE from the Solana RPC
-- (getProgramAccounts on the SPX mint, the daily headcount). So this query only supplies the two
-- things the RPC can't cheaply give: when each wallet last moved (age) and its net flow over a window.
--
-- ⚠⚠ SOLANA IS WHERE BIGQUERY BUDGETS DIE. READ THIS HEADER BEFORE RUNNING ANYTHING.
-- BigQuery bills by BYTES SCANNED = (the columns you SELECT) × (rows read AFTER partition/cluster
-- pruning). A `WHERE mint = SPX` is only CHEAP if the table is CLUSTERED by the mint column. If it is
-- merely partitioned by date, that filter prunes NOTHING on the row axis — it reads every token's
-- transfers across all of Solana history (many TB). The last Solana as-of reconstruction on Dune
-- scanned 10.5 TB for exactly this reason. We do not gamble — we MEASURE first, for free.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 0 — confirm the table and whether it prunes.  FREE (metadata only, zero bytes scanned).
-- The transfers table is under `bigquery-public-data.crypto_solana_mainnet_us` (verify the exact name
-- in the console — a Google-MANAGED variant may exist as `goog_blockchain_solana_mainnet_us`). Run:
--
--   SELECT table_name FROM `bigquery-public-data.crypto_solana_mainnet_us.INFORMATION_SCHEMA.TABLES`
--   WHERE LOWER(table_name) LIKE '%transfer%';
--
--   SELECT ddl FROM `bigquery-public-data.crypto_solana_mainnet_us.INFORMATION_SCHEMA.TABLES`
--   WHERE table_name = '<the transfers table>';
--
-- In that DDL look for two lines:
--   PARTITION BY DATE(block_timestamp)   ← expected; lets a date range prune (but not to one mint)
--   CLUSTER BY mint[, …]                 ← THE ONE THAT MATTERS. If present → the query below prunes
--                                          to SPX only and costs a few GB. If ABSENT → it's TB-scale;
--                                          use the chunked fallback + the dry-run gate below.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 1 — DRY-RUN the real query.  FREE (returns the EXACT bytes it WOULD scan, before any spend).
-- Paste the extract below into the BQ editor: it shows "This query will process X" above the Run
-- button. Or:  bq query --dry_run --use_legacy_sql=false '<query>'.
--   • X < ~1 TB  → run it (that's your monthly free budget).
--   • X > ~1 TB  → do NOT run as-is; drop to the chunked fallback and/or trim columns.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 2 — THE EXTRACT. Minimal columns ONLY — every extra column is more bytes scanned.
-- ⚠ Column names below are the LIKELY SPL shape; VERIFY them against the DDL from Step 0 and rename if
-- needed. SPL transfers reference TOKEN ACCOUNTS; we want the OWNER wallet (the resident), so prefer
-- the *_owner columns if they exist. If only token-account columns exist, we resolve owners locally
-- from the RPC's account→owner map (we already fetch it for the headcount).
SELECT
  source_owner       AS from_wallet,     -- fall back to `source` (token account) if no *_owner column
  destination_owner  AS to_wallet,       -- fall back to `destination`
  amount,                                -- raw base units (SPX Solana decimals = 8) — scale locally
  block_timestamp    AS ts
FROM `bigquery-public-data.crypto_solana_mainnet_us.token_transfers`   -- ⚠ VERIFY exact table name
WHERE mint = 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr'            -- SPX6900 (Wormhole) on Solana
  AND block_timestamp >= TIMESTAMP '2023-12-01'                        -- SPX's Solana history starts ~Dec-2023
;
-- Output is TINY (SPX only) → export CSV → local build joins it to the live RPC balances:
--   per-wallet last transfer  = holder age;  Σ(in) − Σ(out) over the window = net flow.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- FALLBACK — CHUNK BY YEAR if the dry-run is over ~1 TB (i.e. the table is NOT clustered by mint).
-- Each slice stays well under the monthly 1 TB free budget; concatenate the CSVs offline. A 2-3 TB
-- total then costs $0 spread over 2-3 calendar months, or ~$5/TB one-time on a single paid month.
--   ... AND block_timestamp >= '2023-12-01' AND block_timestamp < '2025-01-01'
--   ... AND block_timestamp >= '2025-01-01' AND block_timestamp < '2026-01-01'
--   ... AND block_timestamp >= '2026-01-01'
