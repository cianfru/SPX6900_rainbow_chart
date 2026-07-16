-- ============================================================================
-- SPX6900 — SOLANA CURRENT WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- v3 (2026-07-16): reads Dune's PRE-COMPUTED balance-state schema `solana_utils`
-- instead of reconstructing running balances from tokens_solana.transfers. Dune
-- already maintains per-wallet balances, so we skip ALL inflow/outflow math →
-- runs in seconds on the free tier instead of scanning millions of transfers
-- (this is the fix for "Solana too heavy to execute via the free-tier API").
--
-- `solana_utils.daily_balances` is SPARSE — a row exists only on a day a wallet's
-- balance CHANGES — so a plain GROUP BY day would count that day's active traders
-- and MISS every passive holder. Fix = forward-fill via VALIDITY INTERVALS: each
-- balance row is valid from its day until the wallet's NEXT change (or today), then
-- range-join those intervals against a clean Monday calendar and count balances > 0.
-- The range join (BETWEEN) is light because it joins already-aggregated balance
-- states, not raw transfers, and discards bal<=0 intervals BEFORE the join.
--
-- Output: d (Monday), sol_wallets (current holders that week). Latest ≈ 66k.
-- ⚠ VERIFY ON FIRST RUN: (1) the mint below is OUR SPX Wormhole mint — the one that
--   validated to ~66k. Do NOT use the "SPX1Q8…" placeholder from the docs example;
--   it is not our token. (2) columns token_balance_owner / token_balance /
--   token_mint_address / day exist on solana_utils.daily_balances (adjust if Dune
--   renamed them). Sanity: latest week ≈ 66k, organic ramp from ~Dec-2023.
-- ============================================================================

WITH params AS (
  SELECT 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr' AS mint
),
-- validity interval per balance change: valid from its day until the wallet's next
-- change (minus a day so intervals don't overlap), else today.
balance_intervals AS (
  SELECT
    token_balance_owner AS owner,
    CAST(day AS date) AS valid_from,
    COALESCE(
      lead(CAST(day AS date)) OVER (PARTITION BY token_balance_owner ORDER BY day) - INTERVAL '1' DAY,
      CURRENT_DATE
    ) AS valid_to,
    token_balance AS bal
  FROM solana_utils.daily_balances
  WHERE token_mint_address = (SELECT mint FROM params)
),
-- weekly (Monday) calendar; day_of_week(d)=1 = Monday, so dates line up with the ETH
-- Monday spine the pipeline merges on. 2023-11-06 is a Monday, safely pre-launch.
cal AS (
  SELECT ts AS d
  FROM UNNEST(sequence(DATE '2023-11-06', CURRENT_DATE, INTERVAL '7' DAY)) AS t(ts)
)
SELECT c.d AS d, CAST(count(DISTINCT bi.owner) AS bigint) AS sol_wallets
FROM cal c
JOIN balance_intervals bi
  ON c.d BETWEEN bi.valid_from AND bi.valid_to
WHERE bi.bal > 0
GROUP BY c.d
ORDER BY c.d;
