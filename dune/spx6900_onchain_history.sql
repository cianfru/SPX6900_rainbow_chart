-- ============================================================================
-- SPX6900 — ON-CHAIN VALUATION & DISTRIBUTION  (STAGE 2: historical WEEKLY series)
-- ============================================================================
-- Same reconstruction as the current-state snapshot (spx6900_onchain_snapshot.sql),
-- but evaluated AS-OF each week across the whole history → backfills
-- supply_in_profit_pct, concentration, gini and HODL-wave age bands to launch.
-- (realized_price is already backfilled via src/spx-mvrv.js, but recomputed here
-- so the whole series comes from ONE consistent method.)
--
-- ⚠ HEAVY QUERY — the credit-costly one: an as-of PANEL of every holder × every
-- week (a non-equi interval join). Run it ONCE (or occasionally) to SEED history;
-- the daily current-state snapshot keeps the tail fresh. WEEKLY sampling (Mondays)
-- keeps it ~7× cheaper than daily and is plenty for a chart. Its cached result IS
-- the full series — self-sufficient, no external appender needed for the past.
-- If it times out / costs too much: change day_of_week(d)=1 to a monthly sample
-- (day_of_month(d)=1), or narrow the date range, then widen once it runs.
--
-- Method mirrors Stage 1 EXACTLY (VWAP-of-receives cost basis, gap-filled daily
-- price, same 16-address exclude, address-level age proxy) — see the snapshot
-- file's header for the honesty caveats. Only difference: per-address state is
-- carried forward AS-OF each week via an interval join instead of "today".
-- ============================================================================

WITH
params AS (
  SELECT 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c AS token, 8 AS decimals, 1e-9 AS dust
),

-- VALIDATED exclude list — keep in sync with spx6900_onchain_snapshot.sql.
exclude AS (
  SELECT addr FROM (VALUES
      (0x0000000000000000000000000000000000000000)   -- mint/burn (zero address)
    , (0x000000000000000000000000000000000000dead)   -- dead/burn
    , (0x52c77b0cb827afbad022e6d6caf2c44452edbc39)   -- Uniswap v2 SPX/WETH pool
    , (0x3ee18b2214aff97000d974cf647e7c347e8fa585)   -- Wormhole bridge (Base/Solana supply)
    , (0x7dafba1d69f6c01ae7567ffd7b046ca03b706f83)   -- Kraken
    , (0xd2dd7b597fd2435b6db61ddf48544fd931e6869f)   -- Kraken
    , (0xdf5e3a1ed0c14a53eee240022301ecb9d267671b)   -- Kraken
    , (0x651641299c7ec0aa44ad7ed9b7e12702fed2022f)   -- Bybit
    , (0x0529ea5885702715e83923c59746ae8734c553b7)   -- Bitpanda
    , (0xf35a6bd6e0459a4b53a27862c51a2a7292b383d1)   -- CoinSpot
    , (0x9b0c45d46d386cedd98873168c36efd0dcba8d46)   -- Revolut
    , (0x3cc936b795a188f0e246cbb2d74c5bd190aecf18)   -- MEXC
    , (0x6d6cc65e2060d0a280fcd47b6c22ec5636797fec)   -- KuCoin
    , (0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43)   -- Coinbase
    , (0x73d8bd54f7cf5fab43fe4ef40a62d390644946db)   -- CEX (unlabeled)
    , (0xdc154fcee1babb560e8528c3a7791527f01423df)   -- contract (unlabeled non-person)
  ) AS t(addr)
),

-- Daily gap-filled price (prices receives AND supplies each week's spot).
xfer_days AS (
  SELECT CAST(min(evt_block_time) AS date) AS d0, CAST(max(evt_block_time) AS date) AS d1
  FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
),
day_cal AS (
  SELECT ts AS d FROM UNNEST(sequence((SELECT d0 FROM xfer_days), (SELECT d1 FROM xfer_days))) AS t(ts)
),
px_raw AS (
  SELECT CAST(minute AS date) AS d, avg(price) AS price
  FROM prices.usd
  WHERE contract_address = (SELECT token FROM params) AND blockchain = 'ethereum'
  GROUP BY 1
),
px AS (
  SELECT c.d,
    coalesce(
      last_value(r.price)  IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
      first_value(r.price) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
    ) AS price
  FROM day_cal c LEFT JOIN px_raw r ON r.d = c.d
),

-- Weekly grid = Mondays, each with that day's spot price.
weeks AS ( SELECT d AS wk, price AS spot FROM px WHERE day_of_week(d) = 1 ),

-- Per-address, per-day net change + receive value/amount (priced) + receive flag.
daily AS (
  SELECT address, d,
         sum(amt)                                        AS d_delta,
         sum(CASE WHEN amt > 0 THEN amt * price ELSE 0 END) AS d_cost_in,
         sum(CASE WHEN amt > 0 THEN amt ELSE 0 END)         AS d_amt_in,
         max(CASE WHEN amt > 0 THEN d END)               AS d_recv_day
  FROM (
    SELECT "to" AS address,  CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt,
           CAST(evt_block_time AS date) AS d
      FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
    UNION ALL
    SELECT "from" AS address, -CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt,
           CAST(evt_block_time AS date) AS d
      FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
  ) legs
  JOIN px ON px.d = legs.d
  GROUP BY address, d
),

-- Running per-address state at each of its event days.
state AS (
  SELECT address, d,
         sum(d_delta)   OVER w AS bal,
         sum(d_cost_in) OVER w AS cum_cost,
         sum(d_amt_in)  OVER w AS cum_amt,
         max(d_recv_day) OVER w AS last_recv
  FROM daily
  WINDOW w AS (PARTITION BY address ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
),

-- Turn event points into validity intervals [valid_from, valid_to).
intervals AS (
  SELECT address, d AS valid_from,
         coalesce(lead(d) OVER (PARTITION BY address ORDER BY d), DATE '2999-01-01') AS valid_to,
         bal, cum_cost, cum_amt, last_recv
  FROM state
),

-- As-of panel: each week × each holder's state at that week (ex-contracts/CEX, non-dust).
panel AS (
  SELECT w.wk, w.spot, i.bal,
         i.cum_cost / nullif(i.cum_amt, 0) AS avg_cost,
         date_diff('day', i.last_recv, w.wk) AS age_days
  FROM weeks w
  JOIN intervals i ON w.wk >= i.valid_from AND w.wk < i.valid_to
  WHERE i.bal > (SELECT dust FROM params)
    AND i.address NOT IN (SELECT addr FROM exclude)
),

-- Per-week ranks (concentration) + ascending rank/n/sum (gini).
ranked AS (
  SELECT wk, spot, bal, avg_cost, age_days,
         row_number() OVER (PARTITION BY wk ORDER BY bal DESC) AS rnk,
         row_number() OVER (PARTITION BY wk ORDER BY bal ASC)  AS i_asc,
         count(*)     OVER (PARTITION BY wk) AS n,
         sum(bal)     OVER (PARTITION BY wk) AS s
  FROM panel
)

SELECT
  wk AS d,
  max(spot)                                                                          AS spot_price,
  sum(bal * avg_cost) / nullif(sum(bal), 0)                                          AS realized_price,
  max(spot) / nullif(sum(bal * avg_cost) / nullif(sum(bal), 0), 0)                   AS mvrv,
  100.0 * sum(CASE WHEN avg_cost <= spot THEN bal ELSE 0 END) / nullif(sum(bal), 0)  AS supply_in_profit_pct,
  count(*)                                                                            AS holder_count_eth,
  100.0 * sum(CASE WHEN rnk <= 10  THEN bal ELSE 0 END) / nullif(sum(bal), 0)        AS top10_share_pct,
  100.0 * sum(CASE WHEN rnk <= 100 THEN bal ELSE 0 END) / nullif(sum(bal), 0)        AS top100_share_pct,
  (2.0 * sum(i_asc * bal) / (max(n) * max(s))) - (max(n) + 1.0)/max(n)               AS gini,
  100.0 * sum(CASE WHEN age_days <  30                       THEN bal ELSE 0 END) / nullif(sum(bal),0) AS age_lt1m_pct,
  100.0 * sum(CASE WHEN age_days >= 30  AND age_days < 90    THEN bal ELSE 0 END) / nullif(sum(bal),0) AS age_1_3m_pct,
  100.0 * sum(CASE WHEN age_days >= 90  AND age_days < 180   THEN bal ELSE 0 END) / nullif(sum(bal),0) AS age_3_6m_pct,
  100.0 * sum(CASE WHEN age_days >= 180 AND age_days < 365   THEN bal ELSE 0 END) / nullif(sum(bal),0) AS age_6_12m_pct,
  100.0 * sum(CASE WHEN age_days >= 365                      THEN bal ELSE 0 END) / nullif(sum(bal),0) AS age_gt12m_pct
FROM ranked
GROUP BY wk
ORDER BY wk
