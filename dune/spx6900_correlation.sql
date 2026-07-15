-- ============================================================================
-- SPX6900 — PEER CORRELATION  (which coins trade in lockstep with SPX6900?)
-- ============================================================================
-- Dune-native replacement for the CryptoCompare resemblance study: correlates
-- SPX6900's DAILY % RETURNS against every Ethereum token in prices.day and ranks
-- by Pearson r. Using RETURNS (not price levels) avoids the spurious "both charts
-- are going up" correlation. One execution, ~seconds, no API key.
--
-- USE: a RESEARCH / peer-SELECTION tool, not a post — a raw correlation
-- coefficient is too techy to card (owner rule: techy stats land weakly). The
-- winner feeds the aspirational same-age / "what came next" card machinery
-- (ageCard / whatNextCard), which IS the audience-facing output.
--
-- REVIEW FLAGS (Claude, 2026-07-15):
--  ⚠ prices.day columns — VERIFY on first run. If `timestamp` errors, the date
--    column is likely named `day`; or fall back to prices.usd with
--    date_trunc('day', minute) (heavier — prices.day is the optimized rollup).
--  ⚠ MARKET-BETA caveat — even on returns, most alts share a common crypto beta
--    (they all move with ETH/BTC), so the TOP of this list skews toward generic
--    high-beta alts, not SPX-SPECIFIC co-movement. To isolate idiosyncratic
--    co-movement, regress out a market index first and correlate the RESIDUAL
--    returns. Fine as a first pass; treat a high r as "moves with the market like
--    SPX does," not "uniquely tracks SPX."
--  ⚠ Pearson is outlier-sensitive — one +5000% low-liquidity day can dominate.
--    The `>= 90 overlapping days` HAVING filters brand-new noise; add a liquidity
--    floor (or swap to rank/Spearman) if junk low-caps surface at the top.
--  ℹ Stablecoins self-filter out (their ~0% daily returns → ~0 correlation → they
--    sink to the bottom of an ORDER BY DESC), so no explicit exclusion needed.
-- ============================================================================

WITH spx_raw AS (
  -- 1. Daily close prices for SPX6900 since ~launch.
  SELECT timestamp AS day, price AS spx_price
  FROM prices.day
  WHERE blockchain = 'ethereum'
    AND contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND timestamp >= DATE '2023-10-01'
),
spx_returns AS (
  -- 2. SPX daily % return.
  SELECT day,
         (spx_price - LAG(spx_price) OVER (ORDER BY day)) / LAG(spx_price) OVER (ORDER BY day) AS spx_return
  FROM spx_raw
),
other_raw AS (
  -- 3. Daily close prices for every OTHER Ethereum token.
  SELECT timestamp AS day, contract_address, symbol, price AS token_price
  FROM prices.day
  WHERE blockchain = 'ethereum'
    AND contract_address <> 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND symbol IS NOT NULL
    AND timestamp >= DATE '2023-10-01'
),
other_returns AS (
  -- 4. Each token's daily % return.
  SELECT day, contract_address, symbol,
         (token_price - LAG(token_price) OVER (PARTITION BY contract_address ORDER BY day))
           / LAG(token_price) OVER (PARTITION BY contract_address ORDER BY day) AS token_return
  FROM other_raw
)
-- 5. Join by day and run the Pearson correlation on returns.
SELECT o.symbol,
       o.contract_address,
       corr(o.token_return, s.spx_return) AS correlation_coefficient,
       count(*) AS overlapping_days
FROM other_returns o
JOIN spx_returns s ON o.day = s.day
GROUP BY o.symbol, o.contract_address
HAVING count(*) >= 90 AND corr(o.token_return, s.spx_return) IS NOT NULL
ORDER BY correlation_coefficient DESC
LIMIT 50;
