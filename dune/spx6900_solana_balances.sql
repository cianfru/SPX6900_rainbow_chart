-- SPX6900 on SOLANA — daily balance-state for the city (holder AGE + NET-FLOW). THE VIABLE PATH.
-- MEASURED via the Dune MCP 2026-08-03 (see CLAUDE.md line ~515):
--   • tokens_solana.transfers = ~16 TB, mint does NOT prune → ~4,100 credits full history. ❌ (trap)
--   • solana_utils.daily_balances = 1.36 TB, mint does NOT prune EITHER, BUT it PRUNES ON `day`
--     (~0.025 credits/day) → full history in ~11 × ~90-day chunks ≈ ~24 credits, concat offline. ✅
-- So the ONLY cost lever is the `day` window — ALWAYS bound it, and NEVER run unbounded (a one-shot
-- full scan timed out at the 2-min wall). Earliest SPX Solana balance day = 2023-12-20 (launch).
--
-- ⚠ VERIFY column names first (Dune churns them; free metadata): expected
--   token_balance_owner · token_balance · day · token_mint_address.  The table is SPARSE — one row
--   per owner only when its balance CHANGES (forward-fill locally between rows).
--
-- ── RUN AS ~11 CHUNKS (each < 2-min wall, ~2-3 credits), export each CSV, concat offline ─────────
--   chunk the {{start}}/{{end}} window in ~90-day steps from 2023-12-15 to today:
--     2023-12-15 → 2024-03-15 → 2024-06-15 → 2024-09-15 → 2024-12-15 → 2025-03-15 → 2025-06-15
--     → 2025-09-15 → 2025-12-15 → 2026-03-15 → 2026-06-15 → (today)
--   (Dune vars, or just hard-edit the two dates per run.)
SELECT
  token_balance_owner  AS owner,      -- the wallet (Dune resolves owner for us)
  token_balance        AS balance,    -- balance AS OF `day`; SPX Solana decimals = 8 (scale locally if raw)
  day
FROM solana_utils.daily_balances
WHERE token_mint_address = 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr'   -- SPX6900 (Wormhole) on Solana
  AND day >= DATE '{{start}}'          -- ⭐ the ONLY cost lever — must stay bounded
  AND day <  DATE '{{end}}'
ORDER BY owner, day
-- Concatenated chunks → local build-solana-onchain.mjs:
--   AGE  = each owner's first `day` with balance > 0
--   FLOW = balance delta over the recent window (e.g. last 30d)
--   BALANCE = the live RPC value (getProgramAccounts in snapshot.mjs) — daily_balances confirms/backfills
--   → ~2,000 Queens-borough buildings at the flat 5,000-SPX residency bar.
-- Semantics caveat (unchanged): SPX Solana is Wormhole-minted, so cost-basis / MVRV / realized-price are
-- NOT honest here — but the city only needs balance + age + flow, which this delivers cleanly.
