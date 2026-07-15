-- ============================================================================
-- SPX6900 — ON-CHAIN VALUATION & DISTRIBUTION  (master CURRENT-STATE snapshot)
-- ============================================================================
-- Reconstructs every wallet's balance + average acquisition cost from the FULL
-- ERC-20 transfer history, then derives, in ONE execution:
--   realized_price · mvrv · supply_in_profit_pct · holder_count_eth ·
--   top10/top100 concentration · gini · age-band (HODL-wave) shares.
--   (all ETH-NATIVE — see the multi-chain note below on holder_count_eth.)
--
-- WHY one query: on Dune only EXECUTIONS cost credits — reading the cached
-- result via the API is free. So emit many columns per run and read them for
-- free. ~one full scan of SPX transfers per run → well within 2,500 credits/mo.
--
-- ⚠ SCHEDULING / FORWARD SERIES: a scheduled Dune query REPLACES its cached
-- result each run — it does NOT accumulate a growing table. This query returns
-- ONE row (today's state). To build the forward daily series, our own snapshot
-- cron pulls this row daily via the Dune API and appends it into history.json
-- (the accumulation layer, exactly like it banks HolderScan be/holders today).
-- The PAST comes from Stage 2 (historical daily-series variant), not from this.
--
-- ⚠ MULTI-CHAIN SCOPE: this query reads ETHEREUM transfers only, so every metric
-- here is ETH-NATIVE. That is CORRECT by design — cost basis / realized price /
-- MVRV / supply-in-profit / concentration can only be reconstructed on the chain
-- we can trace, and ~94% of SPX VALUE sits on ETH. But holder_count_eth is the
-- ETH slice (~49.5k), NOT the ~230k cross-chain headcount (ETH + Base ~114k +
-- Solana ~66k). The cross-chain total stays sourced from our existing bankers
-- (Base via Blockscout, Solana via RPC → holdersBase/holdersSol) — do NOT present
-- holder_count_eth as "total holders." (Base holder count could later move to a
-- sibling Dune query on erc20_base.evt_Transfer, Solana to the SPL tables, if we
-- ever consolidate headcount into Dune — but the valuation metrics stay ETH-only.)
--
-- STAGE 1 (this file): prove the numbers against HolderScan on TODAY's row
--   (realized_price ≈ HolderScan `be` ~$0.54; holder_count_eth ≈ our ETH snapshot).
-- STAGE 2 (after it validates): historical daily-series variant — cross-join a
--   day calendar; compute balance/cost AS-OF each day → backfills supply-in-
--   profit % + concentration to launch. Heavier — run once/weekly. Its cached
--   result IS the whole series (self-sufficient, no appender needed).
--
-- Methodology notes (honest, and where to tweak):
--  • decimals = 8 (CONFIRMED on Etherscan — "token contract with 8 decimals").
--  • Cost basis = VWAP of each address's RECEIVES (average-cost accounting;
--    sends don't change per-token basis). Standard tractable proxy for realized
--    cap; ~5% off HolderScan is expected (FIFO would differ slightly).
--  • "Hot-potato" caveat: address-level cost basis resets to the hop price every
--    time tokens pass through an INTERMEDIARY (CEX hot wallet, bridge, multi-hop
--    router) — so any such address NOT in `exclude` distorts realized price up
--    or down. The exclude list fights the known ones; full fidelity would need
--    transaction-graph tracing (out of scope). Document, don't chase.
--  • Age = days since the address LAST received (per-address proxy for per-coin
--    dormancy; a top-up resets the whole balance's age — fine for HODL waves).
--  • Price is GAP-FILLED to every day (forward-then-back fill) so no receive on
--    a day the price feed happened to miss is silently dropped from the VWAP —
--    the exact bug that skewed the original MVRV query.
--  • EXCLUDE contracts (LP pools, bridges, CEX, routers) so holder_count and
--    concentration count PEOPLE, not pools. Add every one you can identify to
--    `exclude` below — THIS IS THE #1 CORRECTNESS LEVER.
-- ============================================================================

WITH
params AS (
  SELECT
    0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c AS token,   -- SPX6900 ERC-20 (mainnet)
    8    AS decimals,                                        -- confirmed on Etherscan
    1e-9 AS dust                                             -- ignore balances below this
),

-- Non-holder addresses to strip from headcount & concentration. EXTEND THIS.
exclude AS (
  SELECT addr FROM (VALUES
      (0x0000000000000000000000000000000000000000)   -- mint/burn (zero address)
    , (0x52c77b0cb827afbad022e6d6caf2c44452edbc39)   -- Uniswap v2 SPX/WETH pool (our price-history POOL; verify on Etherscan)
    -- , (0x................)  -- add any Uniswap v3 pool(s)
    -- , (0x................)  -- add bridge lock addrs (Base/Wormhole etc.)
    -- , (0x................)  -- add CEX deposit/hot wallets you recognise
  ) AS t(addr)
),

-- Transfer date range → a calendar that spans it, so every transfer day gets a
-- (gap-filled) price and no receive is dropped for lack of an exact price row.
-- NOTE: use plain DATE throughout the day-granularity logic. Trino's sequence()
-- rejects `timestamp with time zone` + a day interval, and evt_block_time is
-- tz-aware on Dune, so CAST(... AS date) everywhere the day is used.
xfer_days AS (
  SELECT min(CAST(evt_block_time AS date)) AS d0,
         max(CAST(evt_block_time AS date)) AS d1
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = (SELECT token FROM params)
),
day_cal AS (
  SELECT ts AS d FROM UNNEST(sequence(
    (SELECT d0 FROM xfer_days), (SELECT d1 FROM xfer_days), interval '1' day
  )) AS t(ts)
),
px_raw AS (
  SELECT CAST(minute AS date) AS d, avg(price) AS price
  FROM prices.usd
  WHERE contract_address = (SELECT token FROM params)
    AND blockchain = 'ethereum'
  GROUP BY 1
),
-- Gap-filled daily price: forward-fill, then back-fill any leading gap, so EVERY
-- calendar day has a price (LEFT JOIN + last_value/first_value IGNORE NULLS).
px AS (
  SELECT c.d,
    coalesce(
      last_value(r.price)  IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
      first_value(r.price) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
    ) AS price
  FROM day_cal c
  LEFT JOIN px_raw r ON r.d = c.d
),
spot AS ( SELECT price FROM px ORDER BY d DESC LIMIT 1 ),

-- Per-address CURRENT balance = Σ signed transfer legs (+in / -out). Price-free,
-- so balance never depends on price coverage.
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

-- Per-address average acquisition cost = VWAP of RECEIVES, priced at the day's
-- (gap-filled) USD price so no receive is excluded.
cost AS (
  SELECT t."to" AS address,
         sum( (CAST(t.value AS double)/pow(10,(SELECT decimals FROM params))) * px.price )
           / nullif(sum( CAST(t.value AS double)/pow(10,(SELECT decimals FROM params)) ), 0) AS avg_cost
  FROM erc20_ethereum.evt_Transfer t
  JOIN px ON px.d = CAST(t.evt_block_time AS date)
  WHERE t.contract_address = (SELECT token FROM params)
  GROUP BY t."to"
),

-- Per-address last receive date → holding-age proxy.
last_recv AS (
  SELECT "to" AS address, max(CAST(evt_block_time AS date)) AS last_in
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = (SELECT token FROM params) AND value > 0
  GROUP BY "to"
),

-- Real holders: positive balance, not a contract/pool/bridge, with cost + age.
holders AS (
  SELECT b.address, b.balance, c.avg_cost,
         date_diff('day', lr.last_in, current_date) AS age_days
  FROM bal b
  JOIN cost c            ON c.address  = b.address
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
),

-- One pass of value-weighted sums (realized_price computed ONCE, downstream).
agg AS (
  SELECT
    sum(balance)                                                              AS tot_bal,
    sum(balance * avg_cost)                                                    AS tot_cost,
    count(*)                                                                   AS holder_count_eth,
    sum(CASE WHEN avg_cost <= (SELECT price FROM spot) THEN balance ELSE 0 END) AS profit_bal,
    sum(CASE WHEN rnk <= 10  THEN balance ELSE 0 END)                          AS top10_bal,
    sum(CASE WHEN rnk <= 100 THEN balance ELSE 0 END)                          AS top100_bal,
    sum(CASE WHEN age_days <  30                        THEN balance ELSE 0 END) AS a_lt1m,
    sum(CASE WHEN age_days >= 30  AND age_days < 90     THEN balance ELSE 0 END) AS a_1_3m,
    sum(CASE WHEN age_days >= 90  AND age_days < 180    THEN balance ELSE 0 END) AS a_3_6m,
    sum(CASE WHEN age_days >= 180 AND age_days < 365    THEN balance ELSE 0 END) AS a_6_12m,
    sum(CASE WHEN age_days >= 365                       THEN balance ELSE 0 END) AS a_gt12m
  FROM ranked
),
final AS (
  SELECT
    current_date                              AS d,
    (SELECT price FROM spot)                  AS spot_price,
    tot_cost / nullif(tot_bal, 0)             AS realized_price,   -- computed once
    100.0 * profit_bal  / nullif(tot_bal, 0)  AS supply_in_profit_pct,
    holder_count_eth,
    100.0 * top10_bal   / nullif(tot_bal, 0)  AS top10_share_pct,
    100.0 * top100_bal  / nullif(tot_bal, 0)  AS top100_share_pct,
    (SELECT gini FROM gini)                   AS gini,
    100.0 * a_lt1m  / nullif(tot_bal, 0)      AS age_lt1m_pct,
    100.0 * a_1_3m  / nullif(tot_bal, 0)      AS age_1_3m_pct,
    100.0 * a_3_6m  / nullif(tot_bal, 0)      AS age_3_6m_pct,
    100.0 * a_6_12m / nullif(tot_bal, 0)      AS age_6_12m_pct,
    100.0 * a_gt12m / nullif(tot_bal, 0)      AS age_gt12m_pct
  FROM agg
)
SELECT
  d, spot_price, realized_price,
  spot_price / nullif(realized_price, 0)      AS mvrv,             -- derived from the single realized_price
  supply_in_profit_pct, holder_count_eth,
  top10_share_pct, top100_share_pct, gini,
  age_lt1m_pct, age_1_3m_pct, age_3_6m_pct, age_6_12m_pct, age_gt12m_pct
FROM final
