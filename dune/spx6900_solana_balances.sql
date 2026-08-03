-- SPX6900 on SOLANA — balance-state for the city + crowd-behaviour parity with Ethereum.
--
-- ⚠⚠⚠ READ THIS — THE 2026-08-03 CREDIT INCIDENT. Executing on Dune is cheap (partition pruning on
-- month/day → ~2-3 credits/chunk). PULLING THE RESULT OUT IS NOT: Dune's API bills a SEPARATE
-- "result-read" meter by DATAPOINT (~1.95 credits per 1,000 rows). The raw full history is ~1.3M
-- rows → ~2,500 read-credits = a WHOLE monthly account, drained in one job. That is what happened.
-- The lesson from CLAUDE.md ("measure BOTH charges — the read is the killer") applies HERE.
--
-- ⭐ THE FIX: make the OUTPUT small at the source. We only ever analyse the ≥5,000-SPX cohort (the
-- city's residency bar AND the ETH crowd-analysis bar — wallets that EVER held ≥5k). Filtering to
-- token_balance ≥ 5k collapses ~1.3M rows (all ~66k holders) to just that cohort's ≥5k history —
-- roughly a fifth to a tenth — and gives everything the ETH parity needs: arrival (first ≥5k day),
-- exit (last ≥5k day + gap), holding-age, and net-flow among the cohort. It does NOT change execution
-- cost (still cheap); it slashes the READ cost, which is the whole point.
--
-- ⭐ CANARY DISCIPLINE (do NOT skip — this is what was skipped): run chunk 1 ONLY, then measure
--    (a) rows returned and (b) actual read-credits for downloading it → read-credits ÷ rows × TOTAL
--    projected rows = the full read bill. If that projection is over budget, STOP and aggregate
--    further (e.g. weekly per owner) BEFORE running chunks 2-11. Never fire a background bulk pull.
--
-- ⚠ VERIFY the ≥5k threshold's UNIT first (free): SELECT one known big wallet's token_balance and see
--    if it's human (5000) or raw base units (5000e8; SPX Solana decimals = 8). Set THRESH accordingly.
--    Columns (free metadata): token_balance_owner · token_balance · day · token_mint_address · month.
--
-- ── ⭐ PHASE 1 — RUN THE 2026 SLICE FIRST, validate, THEN dig into history ───────────────────────
--   One chunk: {{month_lo}}=2026-01-01 {{month_hi}}=2026-10-01 {{day_lo}}=2026-01-01 {{day_hi}}=today.
--   With the ≥5k filter this returns only the 2026 ≥5k cohort → small read. Canary it (measure read
--   cost), then:  node scripts/build-solana-onchain.mjs --in=dune/out/spx6900_solana_balances.csv
--   → public/solana-onchain.json (residents + age + flow). ⚠ ages are floored by the slice start
--   (2026-01-01) until full history lands — expected, that's the phase-2 job.
--
-- ── PHASE 2 — FULL HISTORY for correct holder-AGES (backfill; we already have 2026) ──────────────
-- ⚠⚠ 2-MINUTE EXECUTION WALL: daily_balances is 1.36 TB; a window that scans too many partitions runs
--    past the 2-min free-engine wall → TIMES OUT *and still charges* (measured: a full-YEAR 2025 pull
--    timed out and burned credits). QUARTERS (~90 days) stay under the wall; never a year. Run these 9
--    chunks (LO→HI into {{month_lo/hi}} + {{day_lo/hi}}), each ~2-3 credits, download each via the
--    browser, then CONCAT with the 2026 CSV you already have:
--      2023-12-15→2024-03-15 · →06-15 · →09-15 · →12-15 · 2024-12-15→2025-03-15 · →06-15 · →09-15
--      · →12-15 · 2025-12-15→2026-01-01
--   Concatenated (with 2026) → build-solana-onchain.mjs → real ages across the full lifespan, and it
--   SEEDS the daily-pipeline archive (solana-onchain.yml). PHASE 3 (exits/cohort survival) later needs
--   the ever-≥5k owners' below-bar path — see the SUB-5k TAIL note at the bottom.
SELECT
  token_balance_owner  AS owner,
  token_balance        AS balance,
  day
FROM solana_utils.daily_balances
WHERE token_mint_address = 'J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr'   -- SPX6900 (Wormhole) on Solana
  AND token_balance >= 5000                    -- ⭐ ≥5k cohort — the read-cost lever (VERIFY unit; use 5000e8 if raw)
  AND month >= DATE '{{month_lo}}'             -- partition column (cheap execution) — superset of the day window
  AND month <  DATE '{{month_hi}}'
  AND day   >= TIMESTAMP '{{day_lo}}'          -- exact bounds
  AND day   <  TIMESTAMP '{{day_hi}}'
ORDER BY owner, day
-- Concatenated chunks → local build-solana-onchain.mjs:
--   AGE = each owner's first ≥5k `day`; EXIT = last ≥5k `day`; FLOW = balance delta over the window;
--   BALANCE = live RPC value (getProgramAccounts). → Queens-borough buildings + Solana cohort analysis.
-- Semantics caveat: Wormhole-minted → cost-basis / MVRV / realized-price are NOT honest on Solana;
-- balance + age + flow + cohort survival/entries/exits ARE (they don't need cost basis).
--
-- OPTIONAL SUB-5k TAIL (only if a later refinement needs the full path below the bar): pull the
-- DISTINCT ≥5k owners once (tiny), then a second query WHERE token_balance_owner IN (...) for their
-- full history. Not needed for the first cut — the ≥5k history already gives ETH parity.
