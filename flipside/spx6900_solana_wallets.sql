-- ============================================================================
-- SPX6900 — SOLANA WALLET COUNT over time (weekly)   [Flipside Crypto · Snowflake SQL]
-- ============================================================================
-- Distinct OWNER wallets holding the SPX mint with a positive balance, as of each
-- week, reconstructed from SPL token transfers (no price join needed — it's a
-- headcount). Feeds the multi-chain wallet-growth race/card alongside ETH (already
-- bundled in src/spx-onchain.js) + Base (dune/spx6900_base_wallets.sql).
--
-- ⚠ Flipside = Snowflake SQL (NOT Trino/Dune): TABLE(GENERATOR), seq4(), DATEADD,
--   QUALIFY, ::date, ROWS BETWEEN … . Download the result as CSV (free) → send it and
--   we bundle it like src/spx-onchain.js.
--
-- ⚠ VERIFY table/column names on first run (Flipside renames layers periodically):
--   • Transfers: solana.core.fact_transfers is expected to be SPL token transfers
--     with columns mint, amount (decimal-adjusted), tx_from, tx_to, block_timestamp.
--     If that table is SOL-only, use the SPL token-transfer table your account exposes
--     (an ez_/fact_token_transfers variant).
--   • tx_from / tx_to should already be OWNER wallets. If they're token-ACCOUNTS,
--     resolve owners first via solana.core.fact_token_account_owners (or similar).
--   • Excluding the Wormhole custody + CEX accounts is OPTIONAL for a headcount (a
--     handful of addresses barely move a ~66k count) — add a NOT IN (...) filter to
--     the final owners if you want it exact.
-- ============================================================================

WITH params AS (
  SELECT 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr' AS mint   -- SPX6900 SPL mint
),

legs AS (
  -- +amount to the receiver owner, −amount from the sender owner
  SELECT block_timestamp::date AS d, tx_to AS owner, amount AS amt
  FROM solana.core.fact_transfers
  WHERE mint = (SELECT mint FROM params) AND tx_to IS NOT NULL
  UNION ALL
  SELECT block_timestamp::date, tx_from, -amount
  FROM solana.core.fact_transfers
  WHERE mint = (SELECT mint FROM params) AND tx_from IS NOT NULL
),

daily AS (
  SELECT owner, d, SUM(amt) AS d_delta
  FROM legs GROUP BY owner, d
),

-- running per-owner balance at each of its activity days
state AS (
  SELECT owner, d,
         SUM(d_delta) OVER (PARTITION BY owner ORDER BY d
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal
  FROM daily
),

-- validity intervals: this balance holds until the owner's next activity day
intervals AS (
  SELECT owner, d AS valid_from,
         COALESCE(LEAD(d) OVER (PARTITION BY owner ORDER BY d), CURRENT_DATE + 1) AS valid_to,
         bal
  FROM state
),

-- weekly grid (Mondays) from first Solana activity to today
weeks AS (
  SELECT DATE_TRUNC('week', DATEADD('week', seq4(), DATE '2024-02-01')) AS wk   -- adjust start to first SPX Solana activity
  FROM TABLE(GENERATOR(ROWCOUNT => 250))
  QUALIFY wk <= CURRENT_DATE
)

SELECT w.wk AS d,
       COUNT(DISTINCT i.owner) AS sol_wallets
FROM weeks w
JOIN intervals i
  ON w.wk >= i.valid_from AND w.wk < i.valid_to
WHERE i.bal > 0.0000001          -- dust floor (transfers net to ~0 for closed accounts)
GROUP BY w.wk
ORDER BY w.wk;
