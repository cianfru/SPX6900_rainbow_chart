-- ============================================================================
-- SPX6900 — TOTAL HOLDERS across ETH + Base + Solana, DAILY   [Dune · Trino SQL]
-- ============================================================================
-- ONE self-contained query → ONE API read for the whole multi-chain series
-- (replaces: ETH-from-onchain.json + two separate chain queries merged in JS).
-- All three chains come from Dune's PRE-COMPUTED balance tables — NO transfer
-- scanning, so it runs light enough to schedule:
--   • ETH  tokens_ethereum.balances_daily  (DENSE / forward-filled) minus our
--          CEX/bridge/pool exclude list  → ≈ 49.5k (matches Etherscan)
--   • Base tokens_base.balances_daily      (DENSE / forward-filled)  → ≈ 114.6k
--   • Sol  solana_utils.daily_balances     (SPARSE) → interval forward-fill → ≈ 66k
-- Output: day, eth_holders, base_holders, sol_holders, total_holders + daily change.
--
-- WHY OUR OWN, not a stranger's public query: a third-party count returns ~65k on
-- ETH (raw / all-time, contradicts Etherscan's ~49.5k) and could be deleted / made
-- private / re-defined under us. This owns the definition end-to-end (honesty moat)
-- and is defensible against Etherscan. Numbers stay ours; the daily+one-call shape
-- is the good idea we borrowed.
--
-- ⚠ VERIFY ON FIRST RUN (Dune churns column names across schema vintages):
--   • EVM balances_daily wallet column = `address`  (older erc20.view_* = wallet_address)
--   • EVM balances_daily balance column = `balance`  (older vintage = `amount`)
--   • Solana daily_balances = token_balance_owner / token_balance / token_mint_address / day
--   • mint stays OUR Wormhole mint J3NKxx…3KFr (NOT the SPX1Q8… docs placeholder)
--   Filter token FIRST (as below) so scans are pruned to SPX. Sanity: total ≈ 230k.
--   If an EVM balances_daily scan is slow/huge, add `AND day_of_week(CAST(day AS date))=1`
--   to sample weekly, or fall back to the crossing-method queries in git.
-- ============================================================================

WITH eth_excl AS (
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
-- ETH: dense daily balances, current holders (bal>0), minus CEX/bridge/pool.
eth AS (
  SELECT CAST(day AS date) AS d, count(DISTINCT address) AS holders
  FROM tokens_ethereum.balances_daily
  WHERE token_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
    AND balance > 0
    AND address NOT IN (SELECT addr FROM eth_excl)
  GROUP BY 1
),
-- Base: dense daily balances, current holders (bal>0).
base AS (
  SELECT CAST(day AS date) AS d, count(DISTINCT address) AS holders
  FROM tokens_base.balances_daily
  WHERE token_address = 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c
    AND balance > 0
  GROUP BY 1
),
-- Solana: sparse balances → validity intervals (valid until the wallet's next change)
-- range-joined to a daily calendar; count owners holding (bal>0) each day.
sol_intervals AS (
  SELECT
    token_balance_owner AS owner,
    CAST(day AS date) AS valid_from,
    COALESCE(
      lead(CAST(day AS date)) OVER (PARTITION BY token_balance_owner ORDER BY day) - INTERVAL '1' DAY,
      CURRENT_DATE
    ) AS valid_to,
    token_balance AS bal
  FROM solana_utils.daily_balances
  WHERE token_mint_address = 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr'
),
sol_cal AS (
  SELECT ts AS d FROM UNNEST(sequence(DATE '2023-11-01', CURRENT_DATE, INTERVAL '1' DAY)) AS t(ts)
),
sol AS (
  SELECT c.d AS d, count(DISTINCT bi.owner) AS holders
  FROM sol_cal c
  JOIN sol_intervals bi ON c.d BETWEEN bi.valid_from AND bi.valid_to
  WHERE bi.bal > 0
  GROUP BY c.d
),
-- align the three daily series on the day (full outer join, mirror the reference query)
combined AS (
  SELECT
    COALESCE(e.d, b.d, s.d) AS day,
    COALESCE(e.holders, 0) AS eth_holders,
    COALESCE(b.holders, 0) AS base_holders,
    COALESCE(s.holders, 0) AS sol_holders
  FROM eth e
  FULL OUTER JOIN base b ON e.d = b.d
  FULL OUTER JOIN sol  s ON COALESCE(e.d, b.d) = s.d
)
SELECT
  day,
  eth_holders,
  base_holders,
  sol_holders,
  eth_holders + base_holders + sol_holders AS total_holders,
  (eth_holders + base_holders + sol_holders)
    - lag(eth_holders + base_holders + sol_holders) OVER (ORDER BY day) AS daily_holder_change
FROM combined
ORDER BY day;
