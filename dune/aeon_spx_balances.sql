-- ============================================================================
-- SPX6900 balance per wallet  →  cross-holder axis for the Aeon Holder Skyline
-- ============================================================================
-- Returns every wallet's current SPX6900 (Ethereum) balance. build-aeon-onchain.mjs
-- --spx=this.csv joins it to the AEON holders, so the skyline tower height can combine
-- AEON held + SPX held (× holding duration) — the tallest tower = biggest AEON *and*
-- SPX holder, longest. Cheap: a single-token balance read (pre-computed balance table,
-- NOT a transfer scan) → a few GB, no timeout, the cheap pattern.
--
-- SPX6900 ERC-20: 0xE0f63A424a4439cBE457d80e4f4b51ad25b2c56C · decimals 8.
--
-- VERIFY on first run (Dune balance-table names churn): tokens_ethereum.balances_daily
-- should expose address · token_address · balance · day. If it errors, the older
-- vintage is `erc20_ethereum.evt_Transfer`-derived — prefer the pre-computed balances
-- table over re-summing transfers (transfers = the expensive pattern). Output columns:
-- address, spx  (human units).  Only wallets with a non-dust balance are returned.
-- ============================================================================
WITH latest AS (
  SELECT address, balance
  FROM tokens_ethereum.balances_daily
  WHERE token_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND day = (SELECT max(day) FROM tokens_ethereum.balances_daily
               WHERE token_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c)
)
SELECT
  address,
  CAST(balance AS DOUBLE) / 1e8 AS spx
FROM latest
WHERE balance > 100000000            -- ≥ 1 SPX (8 decimals); drop dust
ORDER BY balance DESC;
