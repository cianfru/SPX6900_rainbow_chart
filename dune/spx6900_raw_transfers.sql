-- ============================================================================
-- SPX6900 — CHEAP RAW EXTRACT for the LOCAL FIFO engine   [Dune · Trino SQL]
-- ============================================================================
-- The heavy per-wallet FIFO math runs LOCALLY in Node (scripts/build-onchain-local.mjs),
-- NOT on Dune. Dune does ONLY the cheap part it's great at: filter + dump raw rows. No
-- joins, no window functions, no as-of panels → GB not TB, a handful of credits, no
-- 2-minute-timeout risk. This replaces the heavy in-Dune reconstruction entirely.
--
-- WORKFLOW: run BOTH queries below → "Download CSV" for each → send Claude the two files →
--   `node scripts/build-onchain-local.mjs --transfers=transfers.csv --prices=prices.csv`
--   produces the whole on-chain suite (realized price, MVRV, supply-in-profit, HODL waves,
--   concentration, gini, LTH/STH split) → bundle. NO Dune credits spent on the math.
--
-- If the transfer CSV is too big to export in one shot, CHUNK by year (add the commented
-- WHERE on evt_block_time) and concat the CSVs locally — same idea, for file size not compute.
-- ============================================================================

-- ── QUERY 1: raw transfers (pull RAW value; the engine scales by 1e8 = SPX decimals) ──
SELECT
  "from"          AS sender,
  "to"            AS receiver,
  evt_block_time  AS time,
  value           AS value        -- raw (8-decimal); do NOT divide here (engine handles it)
FROM erc20_ethereum.evt_Transfer
WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
  -- CHUNK if the export is too large (run once per year, concat offline):
  -- AND evt_block_time >= DATE '2024-01-01' AND evt_block_time < DATE '2025-01-01'
ORDER BY evt_block_time;   -- (optional; the engine re-sorts anyway)

-- ── QUERY 2: daily USD price (tiny — ~1000 rows, near-free) — run SEPARATELY ──
-- SELECT
--   date_trunc('day', minute) AS day,
--   avg(price)                AS price
-- FROM prices.usd
-- WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
--   AND blockchain = 'ethereum'
-- GROUP BY 1
-- ORDER BY 1;
