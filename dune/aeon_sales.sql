-- ============================================================================
-- PROJECT AEON — full sales history  [Dune · Trino, spellbook nft.trades]
-- ============================================================================
-- Every marketplace sale of the collection: price in its native currency AND USD,
-- the marketplace, buyer/seller. Feeds the floor + sales-price chart (ETH + USD):
--   • daily floor proxy   = MIN(eth price) per day (true listing floor isn't free;
--                           the live listing floor comes from the Alchemy banker)
--   • sales volume         = SUM(amount_usd) / SUM(eth) per day
--   • per-sale scatter     = every trade, ETH + USD
--
-- ⚠ FULL-HISTORY form (seed / manual). The daily CI job PATCHes in `AND block_time >= <archive's
-- last day>` via build-aeon-dune-refresh.mjs and pulls only the delta — re-downloading all ~17k
-- sales daily cost ~73 credits/day in Dune's "API Result Read" charge (by datapoints, separate
-- from the cheap execution). VERIFY on first run (Dune spellbook columns churn): nft.trades should
-- expose blockchain · nft_contract_address · token_id · amount_original · amount_usd ·
-- currency_symbol · project · block_time · buyer/seller.
--
-- Export CSV → build-aeon-sales.mjs (daily floor/volume + per-sale, ETH & USD).
-- ============================================================================
SELECT
  block_time                         AS time,
  token_id,
  amount_original                    AS price,           -- price in the sale currency
  currency_symbol,                                       -- ETH / WETH / USDC / …
  amount_usd                         AS price_usd,
  project                            AS marketplace,      -- opensea / blur / …
  buyer,
  seller,
  tx_hash
FROM nft.trades
WHERE blockchain = 'ethereum'
  AND nft_contract_address = 0xc374a204334d4edd4c6a62f0867c752d65e9579c
  AND amount_usd IS NOT NULL
ORDER BY block_time;
