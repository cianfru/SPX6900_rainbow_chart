-- ============================================================================
-- SPX6900 on SOLANA — TOP HOLDERS (dormant reference; see the recommendation below)
-- ============================================================================
-- RECOMMENDATION: DO NOT RUN THIS UNLESS SOMETHING SPECIFIC NEEDS IT.
-- Kept as a reference so the shape is on record, not because it is on the roadmap.
--
-- Three reasons Solana reconstruction is poor value for this project:
--
--   1. SEMANTICS. Solana SPX is Wormhole-minted against SPX locked on Ethereum. A coin
--      arriving on Solana was not BOUGHT there, so cost basis / MVRV / realized price /
--      supply-in-profit cannot be reconstructed honestly — treating a bridge mint as an
--      acquisition manufactures a cost basis that never existed. Those metrics are correct
--      today precisely because they are ETH-native.
--   2. COST HISTORY. Solana is where this project's credit budget actually burned: one
--      as-of reconstruction scanned 10.5 TB for 654 credits, and the interval-join variants
--      timed out (which still charges). Solana's account model makes balance history
--      genuinely awkward — balances live in token accounts, not on the wallet.
--   3. COVERAGE ALREADY EXISTS. Holder COUNT — the one Solana number worth publishing — is
--      already banked daily for free from a public RPC (see solHolders in snapshot.mjs),
--      currently ~66k holders against 83.8M tokens (8.9% of supply).
--
-- IF IT IS EVER RUN: this is the CURRENT-STATE shape, deliberately not the as-of one.
-- Taking the latest row per owner is a plain window function; the version that blew the
-- budget forward-filled sparse balances across a date spine with a non-equi join. Do not
-- reintroduce that pattern.
--
-- BEFORE RUNNING (the discipline that keeps this cheap):
--   1. getTableSize on solana_utils.daily_balances — free metadata call.
--   2. Run once with `AND day > now() - interval '7' day` and LIMIT 100 to prove the
--      columns and see the cost, on the `free` engine tier.
--   3. Only then widen. Read executionCostCredits before and after.
--
-- VERIFY COLUMNS FIRST — Dune renames Solana tables more often than EVM ones. Expected:
-- solana_utils.daily_balances with token_balance_owner / token_balance /
-- token_mint_address / day. Some vintages expose token_mint instead of token_mint_address.
-- ============================================================================

WITH params AS (
  SELECT 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr' AS mint   -- Wormhole SPX on Solana
),

-- Latest known balance per owner. daily_balances is SPARSE (a row only when the balance
-- changes), so "current" = the most recent row for that owner — a partition, NOT a join
-- against a calendar spine.
latest_per_owner AS (
  SELECT
    token_balance_owner AS owner,
    token_balance       AS tokens,
    day,
    ROW_NUMBER() OVER (PARTITION BY token_balance_owner ORDER BY day DESC) AS rn
  FROM solana_utils.daily_balances, params
  WHERE token_mint_address = params.mint
),

held AS (
  SELECT owner, tokens
  FROM latest_per_owner
  WHERE rn = 1 AND tokens > 0
),

total AS ( SELECT sum(tokens) AS supply, count(*) AS holders FROM held )

SELECT
  row_number() OVER (ORDER BY h.tokens DESC)               AS rank,
  h.owner,
  h.tokens,
  100.0 * h.tokens / t.supply                              AS pct_of_solana_supply,
  100.0 * sum(h.tokens) OVER (ORDER BY h.tokens DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        / t.supply                                         AS cumulative_pct,
  t.supply                                                 AS solana_supply,
  t.holders                                                AS solana_holders
FROM held h, total t
ORDER BY h.tokens DESC
LIMIT 50;
