-- ============================================================================
-- SPX6900 on BASE — TOP HOLDERS (diagnostic, to answer "14 whales own half of Base")
-- ============================================================================
-- WHY THIS EXISTS
-- A public Base dashboard shows "14 whales = 49.6% of supply, top-100 68%, Gini 0.994".
-- That is almost certainly UNFILTERED. Base SPX is BRIDGE-MINTED, so the largest holders
-- are infrastructure by construction: the Wormhole bridge, Aerodrome/Uniswap-Base pools,
-- CEX hot wallets (Coinbase is native to Base), and the Dec-2024 airdrop distributor.
-- The same trap on Ethereum moved raw top-100 from 68% → 58% once 16 infra addresses were
-- excluded, so the honest Base number is currently unknown rather than alarming.
--
-- WHAT THIS IS NOT
-- This is deliberately a CURRENT-STATE snapshot, not a transfer-history reconstruction.
-- Concentration only needs today's balances. And cost basis / MVRV / realized price /
-- supply-in-profit should NOT be reconstructed for Base at all: the supply is bridge-minted,
-- so a coin arriving on Base was not "bought" there — treating the bridge mint as an
-- acquisition would manufacture a cost basis that never existed. Those metrics stay
-- ETH-native, which is where the real economic history lives.
--
-- COST
-- Reads Dune's PRE-COMPUTED balance table rather than scanning evt_Transfer — the cheap
-- pattern (a few credits, seconds, no 2-minute-timeout risk). Do NOT rewrite this as a
-- transfer scan; that is the shape that burned 654 credits on Solana.
--
-- VERIFY ON FIRST RUN (Dune renames these periodically): tokens_base.balances_daily with
-- columns address / token_address / balance / day. An older vintage uses
-- erc20_base.view_token_balances_daily with wallet_address / amount.
--
-- NEXT STEP after running: label the top ~40 on Basescan, add the non-person ones to an
-- EXCLUDE set (mirroring EXCLUDE_LABELS in build-onchain-local.mjs), and publish the
-- honest top-10 / top-100 share.
-- ============================================================================

WITH params AS (
  SELECT 0x50da645f148798f68ef2d7db7c1cb22a6819bb2c AS token, 8 AS decimals
),

latest AS (
  SELECT max(day) AS d
  FROM tokens_base.balances_daily, params
  WHERE token_address = params.token
),

held AS (
  SELECT
    b.address,
    b.balance / power(10, p.decimals) AS tokens
  FROM tokens_base.balances_daily b, params p, latest l
  WHERE b.token_address = p.token
    AND b.day = l.d
    AND b.balance > 0
),

total AS ( SELECT sum(tokens) AS supply, count(*) AS holders FROM held )

SELECT
  row_number() OVER (ORDER BY h.tokens DESC)               AS rank,
  h.address,
  h.tokens,
  100.0 * h.tokens / t.supply                              AS pct_of_base_supply,
  100.0 * sum(h.tokens) OVER (ORDER BY h.tokens DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        / t.supply                                         AS cumulative_pct,
  t.supply                                                 AS base_supply,
  t.holders                                                AS base_holders
FROM held h, total t
ORDER BY h.tokens DESC
LIMIT 50;
