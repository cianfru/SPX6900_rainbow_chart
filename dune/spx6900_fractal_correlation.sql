-- ============================================================================
-- SPX6900 — FRACTAL / CROSS-CORRELATION  (does SPX's last 12mo rhyme with a
-- token's PAST era?)
-- ============================================================================
-- The rigorous version of the same-age / "what came next" thesis: instead of
-- correlating two coins on the same calendar day, TIME-SHIFT — align SPX6900's
-- last 12 months against another token's historical window by SEQUENCE POSITION
-- (ROW_NUMBER day 1..N), then Pearson-correlate their daily % returns. High r =
-- SPX's recent trajectory rhymes with that token's past era. Directly supports
-- the whatnext / peer cards (pick the peer whose FRACTAL matches, by data).
--
-- Template: set the target token address + its historical window in the CTE
-- below (defaults: PEPE's 2024 run vs SPX's last 12mo). Change and re-run per
-- hypothesis; the join auto-truncates to the shorter window.
--
-- REVIEW FLAGS (Claude, 2026-07-15):
--  ⚠ prices.day columns — same as the sibling query: if `timestamp` errors, the
--    date column may be `day` (or fall back to prices.usd + date_trunc).
--  ⚠ Shape, not magnitude — correlation says "same-shaped path," NOT "same size
--    of move." That's what we want for a fractal/rhyme, but never present it as a
--    price forecast (honesty rail: "history rhymes, not a forecast").
--  ⚠ One target token per run — this tests a hypothesis; to SCAN eras you'd
--    parameterize the target loop-side (or sweep a few candidates by hand).
-- ============================================================================

WITH spx_period AS (
  -- 1. SPX6900's last 12 months, days numbered 1..N (calendar-independent).
  SELECT timestamp AS calendar_date,
         price AS spx_price,
         (price - LAG(price) OVER (ORDER BY timestamp)) / LAG(price) OVER (ORDER BY timestamp) AS spx_return,
         ROW_NUMBER() OVER (ORDER BY timestamp) AS sequence_id
  FROM prices.day
  WHERE blockchain = 'ethereum'
    AND contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND timestamp >= NOW() - INTERVAL '12' MONTH
),
target_historical_period AS (
  -- 2. A target token's specific historical era, numbered 1..N to match.
  SELECT timestamp AS calendar_date,
         symbol,
         price AS token_price,
         (price - LAG(price) OVER (ORDER BY timestamp)) / LAG(price) OVER (ORDER BY timestamp) AS token_return,
         ROW_NUMBER() OVER (ORDER BY timestamp) AS sequence_id
  FROM prices.day
  WHERE blockchain = 'ethereum'
    AND contract_address = 0x6982508145454ce325ddbe47a25d4ec3d2311933  -- PEPE (change per hypothesis)
    AND timestamp >= DATE '2024-01-01'
    AND timestamp <= DATE '2024-12-31'
)
-- 3. Join by sequence order (not calendar day) and correlate returns.
SELECT t.symbol AS historical_token,
       MIN(s.calendar_date) AS spx_start_date,
       MAX(s.calendar_date) AS spx_end_date,
       MIN(t.calendar_date) AS historical_comparison_start,
       MAX(t.calendar_date) AS historical_comparison_end,
       COUNT(*) AS total_days_compared,
       CORR(t.token_return, s.spx_return) AS sequence_correlation
FROM spx_period s
JOIN target_historical_period t ON s.sequence_id = t.sequence_id
WHERE s.spx_return IS NOT NULL AND t.token_return IS NOT NULL
GROUP BY t.symbol;
