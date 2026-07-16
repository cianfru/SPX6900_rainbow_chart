-- ============================================================================
-- SPX6900 — SOLANA CURRENT WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- LIGHT rewrite (2026-07-16): the previous as-of INTERVAL JOIN (holders × weeks) timed
-- out on the free tier (>2 min). This version avoids that join entirely with the
-- CROSSING / NET-FLOW method — the standard way to compute a running holder count:
--   • a wallet ENTERS the holder set when its balance crosses 0 → positive  (+1)
--   • a wallet EXITS when its balance crosses positive → 0                   (−1)
--   • current holders on any day = cumulative sum of (+1/−1) over time
-- No per-wallet × per-week panel → runs in seconds instead of timing out.
--
-- Output: d (Monday), sol_wallets (current holders that week). Latest should be ~66k.
-- ⚠ tokens_solana.transfers columns to_owner/from_owner/amount/block_time/token_mint_address
--   are owner-confirmed. `amount` scale is irrelevant for a headcount (we only test > 0).
-- ============================================================================

WITH params AS (
  SELECT 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr' AS mint, 1e-7 AS eps
),
legs AS (
  SELECT to_owner AS owner,  CAST(amount AS double) AS amt, CAST(block_time AS date) AS d
  FROM tokens_solana.transfers
  WHERE token_mint_address = (SELECT mint FROM params) AND to_owner IS NOT NULL
  UNION ALL
  SELECT from_owner AS owner, -CAST(amount AS double) AS amt, CAST(block_time AS date) AS d
  FROM tokens_solana.transfers
  WHERE token_mint_address = (SELECT mint FROM params) AND from_owner IS NOT NULL
),
daily AS ( SELECT owner, d, sum(amt) AS delta FROM legs GROUP BY owner, d ),
-- per-owner running balance (one window pass — no join)
running AS (
  SELECT owner, d,
         sum(delta) OVER (PARTITION BY owner ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal
  FROM daily
),
-- previous-day balance (separate step — Trino can't nest window fns)
state AS (
  SELECT owner, d, bal, lag(bal) OVER (PARTITION BY owner ORDER BY d) AS prev_bal
  FROM running
),
-- +1 on entry (0→+), −1 on exit (+→0)
trans AS (
  SELECT d,
         CASE WHEN bal > (SELECT eps FROM params) AND coalesce(prev_bal, 0) <= (SELECT eps FROM params) THEN 1
              WHEN bal <= (SELECT eps FROM params) AND prev_bal > (SELECT eps FROM params) THEN -1
              ELSE 0 END AS t
  FROM state
),
daily_net AS ( SELECT d, sum(t) AS net FROM trans WHERE t <> 0 GROUP BY d ),
cum AS ( SELECT d, sum(net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS holders FROM daily_net ),
-- forward-fill the daily cumulative onto a Monday grid
bounds AS ( SELECT min(d) AS d0, max(d) AS d1 FROM cum ),
cal AS ( SELECT ts AS d FROM UNNEST(sequence((SELECT d0 FROM bounds), (SELECT d1 FROM bounds))) AS t(ts) ),
filled AS (
  SELECT c.d,
         last_value(cum.holders) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS holders
  FROM cal c LEFT JOIN cum ON cum.d = c.d
)
SELECT d, CAST(holders AS bigint) AS sol_wallets
FROM filled
WHERE day_of_week(d) = 1 AND holders IS NOT NULL
ORDER BY d;
