-- ============================================================================
-- SPX6900 — BASE CURRENT WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- v3 (2026-07-16): reads Dune's PRE-COMPUTED balance schema instead of re-summing
-- raw erc20_base.evt_Transfer. `tokens_base.balances_daily` is DENSE (Dune carries
-- each wallet's balance FORWARD to every day), so — unlike Solana's sparse
-- solana_utils.daily_balances — no interval forward-fill is needed: just filter to
-- the SPX token, keep balances > 0, sample Mondays, and count distinct wallets.
-- Reads already-aggregated balance state → runs in seconds, no transfer scanning.
--
-- Output: d (Monday), base_wallets (current holders that week). Latest ≈ 114k.
-- ⚠ VERIFY ON FIRST RUN (Dune has churned these column names across schema vintages):
--   • table:   tokens_base.balances_daily   (dense/forward-filled daily balances)
--   • wallet:  address        (older erc20.view_token_balances_daily uses wallet_address)
--   • token:   token_address
--   • balance: balance         (older vintage uses `amount`)
--   • day:     day
--   Adjust the four names to match your Dune column browser if the run errors. Filter
--   token_address FIRST (as below) so the scan is pruned to SPX — do not query the
--   whole balances table unfiltered (Dune warns that times out). Sanity: latest ≈ 114k.
--   If this schema ever gives trouble, the transfer-crossing version in git history
--   (v2) still runs fine — Base's transfer volume is small.
-- ============================================================================

WITH params AS (
  SELECT 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c AS token
)
SELECT
  CAST(day AS date) AS d,
  CAST(count(DISTINCT address) AS bigint) AS base_wallets
FROM tokens_base.balances_daily
WHERE token_address = (SELECT token FROM params)
  AND balance > 0
  AND day_of_week(CAST(day AS date)) = 1
GROUP BY CAST(day AS date)
ORDER BY d;
