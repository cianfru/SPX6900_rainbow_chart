-- ============================================================================
-- SPX6900 — BASE WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- Distinct addresses holding SPX on Base with a positive balance, as of each week,
-- from erc20_base.evt_Transfer. Headcount only (no price join → light + cheap).
-- Feeds the multi-chain wallet-growth race alongside ETH (bundled in
-- src/spx-onchain.js) + Solana (flipside/spx6900_solana_wallets.sql).
--
-- Same as-of weekly method as the ETH history query, minus the cost-basis machinery.
-- Excluding contracts is OPTIONAL for a headcount (a handful of addresses barely move
-- a ~114k count); add a NOT IN (...) on the final addresses if you want it exact.
-- Base SPX contract 0x50dA645f…bb2C (decimals 8 — verify on Basescan).
-- ============================================================================

WITH params AS (
  SELECT 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c AS token, 8 AS decimals
),
xfer_days AS (
  SELECT min(CAST(evt_block_time AS date)) AS d0, max(CAST(evt_block_time AS date)) AS d1
  FROM erc20_base.evt_Transfer WHERE contract_address = (SELECT token FROM params)
),
day_cal AS (
  SELECT ts AS d FROM UNNEST(sequence((SELECT d0 FROM xfer_days), (SELECT d1 FROM xfer_days))) AS t(ts)
),
weeks AS ( SELECT d AS wk FROM day_cal WHERE day_of_week(d) = 1 ),

legs AS (
  SELECT "to" AS addr,  CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt, CAST(evt_block_time AS date) AS d
    FROM erc20_base.evt_Transfer WHERE contract_address = (SELECT token FROM params)
  UNION ALL
  SELECT "from" AS addr, -CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt, CAST(evt_block_time AS date) AS d
    FROM erc20_base.evt_Transfer WHERE contract_address = (SELECT token FROM params)
),
daily AS ( SELECT addr, d, sum(amt) AS d_delta FROM legs GROUP BY addr, d ),
state AS (
  SELECT addr, d, sum(d_delta) OVER (PARTITION BY addr ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal
  FROM daily
),
intervals AS (
  SELECT addr, d AS valid_from,
         coalesce(lead(d) OVER (PARTITION BY addr ORDER BY d), DATE '2999-01-01') AS valid_to, bal
  FROM state
)
SELECT w.wk AS d, count(DISTINCT i.addr) AS base_wallets
FROM weeks w
JOIN intervals i ON w.wk >= i.valid_from AND w.wk < i.valid_to
WHERE i.bal > 1e-9
GROUP BY w.wk
ORDER BY w.wk;
