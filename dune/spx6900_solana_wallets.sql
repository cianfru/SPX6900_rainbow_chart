-- ============================================================================
-- SPX6900 — SOLANA CURRENT WALLET COUNT over time (weekly)   [Dune · Trino SQL]
-- ============================================================================
-- Distinct OWNER wallets that CURRENTLY hold SPX on Solana (balance > 0), as of each
-- week, reconstructed from tokens_solana.transfers. Replaces two flawed earlier takes:
--   • the CUMULATIVE-ever query (COUNT of first-seen wallets, running-summed) — that
--     only ever grows (363k ever vs ~66k now); it counts wallets that long since sold.
--   • the alternative source that cold-started at ~12k in Oct-2024.
-- tokens_solana.transfers has SPX data back to Dec-2023, so this gives a CLEAN current-
-- holder series from ~launch (no cold start, and it can fall — the honest metric).
--
-- SANITY CHECK: the latest week should land near ~66k (the known current Solana count).
--
-- ⚠ Notes / verify-flags:
--   • Columns to_owner / from_owner / block_time / token_mint_address are owner-confirmed
--     working; `amount` assumed to be the transfer token amount — for a HEADCOUNT the
--     decimal scale is irrelevant (we only test balance > 0).
--   • `bal > 0` uses a tiny epsilon to shrug off float rounding when a wallet's ins and
--     outs net to ~0 (closed token accounts).
--   • Excluding the Wormhole custody account is OPTIONAL for a headcount (one address).
--   • Heavy-ish non-equi as-of join → WEEKLY sampling keeps it cheap; if it times out,
--     switch day_of_week(d)=1 to a monthly sample (day_of_month(d)=1).
-- ============================================================================

WITH params AS (
  SELECT 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr' AS mint
),
legs AS (
  SELECT to_owner AS owner,  CAST(amount AS double) AS amt, CAST(block_time AS date) AS d
  FROM tokens_solana.transfers
  WHERE token_mint_address = (SELECT mint FROM params) AND to_owner IS NOT NULL
  UNION ALL
  SELECT from_owner AS owner, -CAST(amount AS double) AS amt, CAST(block_time AS date) AS d
  FROM tokens_solana.transfers
  WHERE token_mint_address = (SELECT mint FROM params) AND from_owner IS NOT NULL
),
xfer_days AS ( SELECT min(d) AS d0, max(d) AS d1 FROM legs ),
day_cal AS ( SELECT ts AS d FROM UNNEST(sequence((SELECT d0 FROM xfer_days), (SELECT d1 FROM xfer_days))) AS t(ts) ),
weeks AS ( SELECT d AS wk FROM day_cal WHERE day_of_week(d) = 1 ),

daily AS ( SELECT owner, d, sum(amt) AS d_delta FROM legs GROUP BY owner, d ),
state AS (
  SELECT owner, d, sum(d_delta) OVER (PARTITION BY owner ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal
  FROM daily
),
intervals AS (
  SELECT owner, d AS valid_from,
         coalesce(lead(d) OVER (PARTITION BY owner ORDER BY d), DATE '2999-01-01') AS valid_to, bal
  FROM state
)
SELECT w.wk AS d, count(DISTINCT i.owner) AS sol_wallets
FROM weeks w
JOIN intervals i ON w.wk >= i.valid_from AND w.wk < i.valid_to
WHERE i.bal > 0.0000001
GROUP BY w.wk
ORDER BY w.wk;
