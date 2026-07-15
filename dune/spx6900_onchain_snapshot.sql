-- ============================================================================
-- SPX6900 — ON-CHAIN VALUATION & DISTRIBUTION  (master CURRENT-STATE snapshot)
-- ============================================================================
-- Reconstructs every wallet's balance + average acquisition cost from the FULL
-- ERC-20 transfer history, then derives, in ONE execution:
--   realized_price · mvrv · supply_in_profit_pct · holder_count ·
--   top10/top100 concentration · gini · age-band (HODL-wave) shares.
--
-- WHY one query: on Dune only EXECUTIONS cost credits — reading the cached
-- result via the API is free. So emit many columns per run and read them for
-- free. Schedule this DAILY; each run appends today's row (the whole table is
-- the forward series). ~one full scan of SPX transfers per run → well within
-- the free 2,500 credits/mo.
--
-- STAGE 1 (this file): prove the numbers against HolderScan on TODAY's row
--   (realized_price ≈ HolderScan `be` ~$0.54; holder_count ≈ our snapshot).
-- STAGE 2 (after it validates): switch to the historical daily-series variant
--   (cross-join a day calendar; compute balance/cost AS-OF each day) to backfill
--   supply-in-profit % + concentration to launch. Heavier — run once/weekly.
--
-- Methodology notes (honest, and where to tweak):
--  • Cost basis = VWAP of each address's RECEIVES (average-cost accounting;
--    sends don't change per-token basis). Standard tractable approximation of
--    realized cap; ~5% of HolderScan is expected (FIFO would differ slightly).
--  • A coin is "in profit" if its holder's avg cost <= today's spot. This is
--    the Glassnode-style Percent-Supply-in-Profit, address-averaged.
--  • Age = days since the address LAST received (per-address proxy for per-coin
--    dormancy; a top-up resets the whole balance's age — acceptable for HODL
--    waves at this granularity).
--  • EXCLUDE contracts (LP pools, bridges, CEX, routers) so holder_count and
--    concentration count PEOPLE, not pools — mirrors our Blockscout is_contract
--    strip. Add every pool/bridge you can identify to `exclude` below; the
--    Uniswap v2 SPX/WETH pool is pre-filled. This is the #1 correctness lever.
-- ============================================================================

WITH
params AS (
  SELECT
    0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c AS token,   -- SPX6900 ERC-20 (mainnet)
    8    AS decimals,                                        -- verify on Etherscan
    1e-9 AS dust                                             -- ignore balances below this
),

-- Non-holder addresses to strip from headcount & concentration. EXTEND THIS.
exclude AS (
  SELECT addr FROM (VALUES
      (0x0000000000000000000000000000000000000000)   -- mint/burn (zero address)
    , (0x52c77b0cb827afbad022e6d6caf2c44452edbc39)   -- Uniswap v2 SPX/WETH pool (holds reserves)
    -- , (0x................)  -- add any Uniswap v3 pool(s)
    -- , (0x................)  -- add bridge lock addrs (Base/Wormhole etc.)
    -- , (0x................)  -- add CEX deposit/hot wallets you recognise
  ) AS t(addr)
),

-- Daily USD price of SPX from Dune's price feed (one row per day).
px AS (
  SELECT date_trunc('day', minute) AS d, avg(price) AS price
  FROM prices.usd
  WHERE contract_address = (SELECT token FROM params)
    AND blockchain = 'ethereum'
  GROUP BY 1
),
spot AS ( SELECT price FROM px ORDER BY d DESC LIMIT 1 ),

-- Per-address CURRENT balance = Σ signed transfer legs (+in / -out). No price
-- needed here, so balance is independent of price coverage.
bal AS (
  SELECT address, sum(amt) AS balance FROM (
    SELECT "to"   AS address,  CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt
      FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
    UNION ALL
    SELECT "from" AS address, -CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt
      FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
  ) legs
  GROUP BY address
),

-- Per-address average acquisition cost = VWAP of RECEIVES, priced at day.
cost AS (
  SELECT t."to" AS address,
         sum( (CAST(t.value AS double)/pow(10,(SELECT decimals FROM params))) * px.price )
           / nullif(sum( CAST(t.value AS double)/pow(10,(SELECT decimals FROM params)) ), 0) AS avg_cost
  FROM erc20_ethereum.evt_Transfer t
  JOIN px ON px.d = date_trunc('day', t.evt_block_time)
  WHERE t.contract_address = (SELECT token FROM params)
  GROUP BY t."to"
),

-- Per-address last receive date → holding-age proxy.
last_recv AS (
  SELECT "to" AS address, max(date_trunc('day', evt_block_time)) AS last_in
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = (SELECT token FROM params) AND value > 0
  GROUP BY "to"
),

-- Real holders: positive balance, not a contract/pool/bridge, with cost + age.
holders AS (
  SELECT b.address, b.balance, c.avg_cost,
         date_diff('day', lr.last_in, current_date) AS age_days
  FROM bal b
  JOIN cost c      ON c.address  = b.address
  LEFT JOIN last_recv lr ON lr.address = b.address
  WHERE b.balance > (SELECT dust FROM params)
    AND b.address NOT IN (SELECT addr FROM exclude)
),

ranked AS (
  SELECT balance, avg_cost, age_days,
         row_number() OVER (ORDER BY balance DESC) AS rnk
  FROM holders
),

-- Gini of the holder balance distribution (ascending rank).
gini_calc AS (
  SELECT balance,
         row_number() OVER (ORDER BY balance ASC) AS i,
         count(*)     OVER () AS n,
         sum(balance) OVER () AS s
  FROM holders
),
gini AS (
  SELECT (2.0 * sum(i * balance) / (max(n) * max(s))) - (max(n) + 1.0)/max(n) AS gini
  FROM gini_calc
)

SELECT
  current_date                                                                        AS d,
  (SELECT price FROM spot)                                                            AS spot_price,
  -- Realized price = Σ(balance × avg_cost) / Σ(balance); MVRV = spot / realized.
  sum(r.balance * r.avg_cost) / nullif(sum(r.balance), 0)                             AS realized_price,
  (SELECT price FROM spot) / nullif(sum(r.balance * r.avg_cost)/nullif(sum(r.balance),0), 0) AS mvrv,
  -- Supply in profit % (avg cost at or below today's spot).
  100.0 * sum(CASE WHEN r.avg_cost <= (SELECT price FROM spot) THEN r.balance ELSE 0 END)
        / nullif(sum(r.balance), 0)                                                   AS supply_in_profit_pct,
  count(*)                                                                            AS holder_count,
  -- Concentration: share of circulating (ex-contract) supply held by the top N.
  100.0 * sum(CASE WHEN r.rnk <= 10  THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS top10_share_pct,
  100.0 * sum(CASE WHEN r.rnk <= 100 THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS top100_share_pct,
  (SELECT gini FROM gini)                                                             AS gini,
  -- HODL waves: supply share by holding age.
  100.0 * sum(CASE WHEN r.age_days <  30                       THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS age_lt1m_pct,
  100.0 * sum(CASE WHEN r.age_days >= 30  AND r.age_days < 90  THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS age_1_3m_pct,
  100.0 * sum(CASE WHEN r.age_days >= 90  AND r.age_days < 180 THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS age_3_6m_pct,
  100.0 * sum(CASE WHEN r.age_days >= 180 AND r.age_days < 365 THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS age_6_12m_pct,
  100.0 * sum(CASE WHEN r.age_days >= 365                      THEN r.balance ELSE 0 END)/nullif(sum(r.balance),0) AS age_gt12m_pct
FROM ranked r
