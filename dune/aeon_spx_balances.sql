-- ============================================================================
-- SPX6900 balance per wallet  →  cross-holder axis for the Aeon Holder Skyline
-- ============================================================================
-- Returns every wallet's current SPX6900 (Ethereum) balance = net of all transfers
-- (received − sent) for the ONE token. build-aeon-onchain.mjs --spx=this.csv joins it
-- to the AEON holders so a skyline tower can combine AEON held + SPX held (× duration)
-- — the tallest tower = biggest AEON *and* SPX holder, longest.
--
-- ⭐ CHEAP PATTERN (the earlier tokens_ethereum.balances_daily version TIMED OUT — that
-- table is every token × address × day, enormous). This scans only the SPX contract's
-- own evt_Transfer partition (~2.6M rows, a few GB, a handful of credits — the SAME
-- bounded pattern as the raw-transfer dump, no 2-min-timeout risk) and GROUPs to a
-- current balance. Output ~49k rows (well under the result-size limit). A plain
-- filter + UNION + GROUP BY — NO joins, NO window functions, NO balances_daily.
--
-- SPX6900 ERC-20: 0xE0f63A424a4439cBE457d80e4f4b51ad25b2c56C · decimals 8.
-- VERIFY columns on first run: erc20_ethereum.evt_Transfer exposes contract_address ·
-- "from" · "to" · value. Output columns: address, spx (human units).
-- ============================================================================
WITH flows AS (
  SELECT "to"   AS address,  CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
  UNION ALL
  SELECT "from" AS address, -CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
)
SELECT
  address,
  SUM(v) / 1e8 AS spx
FROM flows
GROUP BY address
HAVING SUM(v) > 100000000        -- ≥ 1 SPX (8 decimals); drops dust + the zero-net churn
ORDER BY spx DESC;
