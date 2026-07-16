-- ============================================================================
-- SPX6900 — BASE CURRENT WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- LIGHT rewrite (2026-07-16, crossing/net-flow method — same as the Solana query) that
-- avoids the heavy as-of interval join, so it runs in seconds and never times out:
--   • ENTER the holder set when balance crosses 0 → positive  (+1)
--   • EXIT when balance crosses positive → 0                   (−1)
--   • holders on any day = cumulative sum of (+1/−1), sampled to Mondays
-- Output: d (Monday), base_wallets (current holders). Latest should be ~114k.
-- Base SPX contract 0x50dA645f…bb2C, decimals 8 (scale irrelevant for a headcount).
-- ============================================================================

WITH params AS (
  SELECT 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c AS token, 1e-9 AS eps
),
legs AS (
  SELECT "to" AS addr,  CAST(value AS double) AS amt, CAST(evt_block_time AS date) AS d
  FROM erc20_base.evt_Transfer WHERE contract_address = (SELECT token FROM params)
  UNION ALL
  SELECT "from" AS addr, -CAST(value AS double) AS amt, CAST(evt_block_time AS date) AS d
  FROM erc20_base.evt_Transfer WHERE contract_address = (SELECT token FROM params)
),
daily AS ( SELECT addr, d, sum(amt) AS delta FROM legs GROUP BY addr, d ),
state AS (
  SELECT addr, d,
         sum(delta) OVER (PARTITION BY addr ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal,
         lag(sum(delta) OVER (PARTITION BY addr ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))
           OVER (PARTITION BY addr ORDER BY d) AS prev_bal
  FROM daily
),
trans AS (
  SELECT d,
         CASE WHEN bal > (SELECT eps FROM params) AND coalesce(prev_bal, 0) <= (SELECT eps FROM params) THEN 1
              WHEN bal <= (SELECT eps FROM params) AND prev_bal > (SELECT eps FROM params) THEN -1
              ELSE 0 END AS t
  FROM state
),
daily_net AS ( SELECT d, sum(t) AS net FROM trans WHERE t <> 0 GROUP BY d ),
cum AS ( SELECT d, sum(net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS holders FROM daily_net ),
bounds AS ( SELECT min(d) AS d0, max(d) AS d1 FROM cum ),
cal AS ( SELECT ts AS d FROM UNNEST(sequence((SELECT d0 FROM bounds), (SELECT d1 FROM bounds))) AS t(ts) ),
filled AS (
  SELECT c.d,
         last_value(cum.holders) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS holders
  FROM cal c LEFT JOIN cum ON cum.d = c.d
)
SELECT d, CAST(holders AS bigint) AS base_wallets
FROM filled
WHERE day_of_week(d) = 1 AND holders IS NOT NULL
ORDER BY d;
