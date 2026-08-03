-- ❌❌ SUPERSEDED — DO NOT USE. Measured via the Dune MCP 2026-08-03: Dune's tokens_solana.transfers
-- is ALSO a trap — ~16 TB, NOT partitioned/clustered by mint, so token_mint_address does NOT prune;
-- a 2-day SPX COUNT = 8.47 credits → full history ≈ ~4,100 credits (over the monthly quota). My "Dune
-- transfers is mint-indexed" assumption was wrong; the owner's dry-run disproved it. → Use
-- dune/spx6900_solana_balances.sql instead (solana_utils.daily_balances, prunes on `day`, ~24 credits
-- full history). Kept only as the record of why the transfers table is the wrong tool on BOTH platforms.
--
-- SPX6900 on SOLANA — SPL transfer history for the city (holder AGE + recent NET-FLOW).
-- Balance stays FREE from the Solana RPC (getProgramAccounts on the mint, the daily headcount); this
-- only supplies age (last move per wallet) + net-flow (Δ over a window). Output is tiny (SPX only).
--
-- ⭐ WHY DUNE, NOT BIGQUERY (measured 2026-08): BigQuery's crypto_solana_mainnet_us."Token Transfers"
-- is NOT clustered by mint, so a mint filter prunes nothing → a full-history dry-run is 30.6 TB, and
-- its addresses are ATAs (need owner mapping). Dune's tokens_solana.transfers is mint-indexed (a mint
-- filter is cheap) AND owner-resolved (real wallets, no ATA step). The old "Dune 10.5 TB Solana" was a
-- heavy as-of BALANCE join — a filtered transfer READ like this is the cheap pattern.
--
-- ── DISCIPLINE (Dune credits are the budget here) ───────────────────────────────────────────────
-- 1) SIZE/SCHEMA-first (FREE metadata): confirm the column names below against the Dune catalog for
--    `tokens_solana.transfers` (they've been stable, but verify from_owner/to_owner/amount/block_time
--    exist; some vintages expose `amount` raw + a display column). getTableSize is free.
-- 2) BOUNDED TEST on the FREE engine (performance:"free"): run it with an extra
--    `AND block_time >= now() - interval '90' day` and a LIMIT — read executionCostCredits.
-- 3) Only then the FULL run below (drop the 90-day/LIMIT). It should be a few credits, not tens.
--
-- ── THE EXTRACT ─────────────────────────────────────────────────────────────────────────────────
SELECT
  from_owner            AS from_wallet,   -- OWNER wallet (Dune resolves the ATA → owner for us)
  to_owner              AS to_wallet,
  amount,                                 -- token units; SPX Solana decimals = 8 (scale locally if raw)
  block_time            AS ts
FROM tokens_solana.transfers
WHERE token_mint_address = 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr'   -- SPX6900 (Wormhole) on Solana
  AND block_time >= TIMESTAMP '2023-12-01'                                   -- SPX's Solana history starts ~Dec-2023
ORDER BY block_time
-- Export CSV → local build (build-solana-onchain.mjs) joins it to the live RPC balances:
--   per-wallet last transfer = holder age; Σ(in) − Σ(out) over the window = net flow; balance from RPC.
