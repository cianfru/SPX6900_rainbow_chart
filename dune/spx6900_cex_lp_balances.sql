-- SPX6900 — CEX / LP / custody balances over time (exchange-flow / netflow groundwork)
-- ============================================================================
-- WHY: coins flowing ONTO exchanges = sell-side pressure, OFF = accumulation /
-- self-custody (the classic BTC-world exchange-netflow read). Our edge vs BTC
-- analytics: we ALSO have the Uniswap LP balance, so we can separate liquidity
-- DEPTH (LP) from exchange SELL-SIDE (CEX) instead of lumping them.
--
-- WHAT THIS RETURNS: for every tagged CEX/LP/custody address, the daily SIGNED
-- net token flow (+in / −out) on days it moved. Downstream (local Node) we:
--   cumulative-sum per address → running balance; sum by kind → cexBal / lpBal /
--   custodyBal over time; sample weekly; weekly netflow = Δ balance week-over-week.
-- Keeping the carry-forward + weekly resample LOCAL keeps this query cheap and
-- avoids the credit-heavy as-of / non-equi join.
--
-- WHY evt_Transfer (not a balances_daily table): the transfer schema is stable
-- and this is HARD-BOUNDED to ONE token (SPX) AND ~13 addresses, so it prunes to
-- a few GB, not TB — a few credits, no timeout. It also matches EXACTLY what our
-- local FIFO engine tracks for these addresses (exBal), so the two never drift.
--
-- ADDRESSES: kept in sync with EXCLUDE_LABELS in scripts/build-onchain-local.mjs.
-- Only CoinSpot + KuCoin are venue-named so far; the other 9 are generic CEX.
-- Coverage is the accuracy lever — add more tagged CEX addrs here as they're found.
--
-- ── CREDIT-SAFE RUN (Dune MCP) ──────────────────────────────────────────────
-- 1. FREE first: searchTables / getTableSize / schema to confirm
--    erc20_ethereum.evt_Transfer has columns: contract_address, "from", "to",
--    value, evt_block_time (Dune churns names — verify before running).
-- 2. BOUNDED test on the `free` engine tier: uncomment the LAST-90-DAYS line in
--    the WHERE, run, read executionCostCredits. Should be ~free/seconds.
-- 3. Full run: comment that line back out, run once. Export CSV.
-- CSV → send to Claude Code → build-cex-flow bundling script → the card.
--
-- decimals(SPX) = 8. Token = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
-- ============================================================================

WITH tagged (address, kind) AS (
  VALUES
    (0xf35a6bd6e0459a4b53a27862c51a2a7292b383d1, 'cex'),      -- CoinSpot
    (0x6d6cc65e2060d0a280fcd47b6c22ec5636797fec, 'cex'),      -- KuCoin
    (0x7dafba1d69f6c01ae7567ffd7b046ca03b706f83, 'cex'),      -- exchange
    (0xd2dd7b597fd2435b6db61ddf48544fd931e6869f, 'cex'),      -- exchange
    (0xdf5e3a1ed0c14a53eee240022301ecb9d267671b, 'cex'),      -- exchange
    (0x651641299c7ec0aa44ad7ed9b7e12702fed2022f, 'cex'),      -- exchange
    (0x0529ea5885702715e83923c59746ae8734c553b7, 'cex'),      -- exchange
    (0x9b0c45d46d386cedd98873168c36efd0dcba8d46, 'cex'),      -- exchange
    (0x3cc936b795a188f0e246cbb2d74c5bd190aecf18, 'cex'),      -- exchange
    (0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43, 'cex'),      -- exchange
    (0x73d8bd54f7cf5fab43fe4ef40a62d390644946db, 'cex'),      -- exchange
    (0xdc154fcee1babb560e8528c3a7791527f01423df, 'custody'),  -- BitGo multi-sig (WalletSimple)
    (0x52c77b0cb827afbad022e6d6caf2c44452edbc39, 'lp')        -- Uniswap v2 SPX/WETH pool
)
SELECT
  CAST(tr.evt_block_time AS date)                            AS day,
  t.address,
  t.kind,
  SUM(
      (CASE WHEN tr."to"   = t.address THEN CAST(tr.value AS double) ELSE 0 END)
    - (CASE WHEN tr."from" = t.address THEN CAST(tr.value AS double) ELSE 0 END)
  ) / 1e8                                                    AS net_tokens  -- signed: +in / −out
FROM erc20_ethereum.evt_Transfer tr
JOIN tagged t ON (tr."to" = t.address OR tr."from" = t.address)
WHERE tr.contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
  -- BOUNDED TEST: uncomment for the cheap free-tier dry run, then comment back out.
  -- AND tr.evt_block_time >= now() - interval '90' day
GROUP BY 1, 2, 3
ORDER BY 1, 2
