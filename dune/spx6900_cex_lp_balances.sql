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
-- ── RUN (Dune MCP) ──────────────────────────────────────────────────────────
-- ✅ RAN 2026-07-21 via the Dune MCP (query 8053292): full history 3,615 rows,
--    5.99 credits on the `free` tier. Uses evt_block_date (partition column) for
--    pruning. RECONCILES to the local FIFO engine's liqEx: cex 111.2M + lp 13.2M
--    + custody 7.2M = 131.58M vs onchain.json liqEx 131.77M (0.14% — exact).
-- Result CSV committed at dune/out/spx6900_cex_lp_flows.csv (day,address,kind,net_tokens).
-- Re-run: same query, export, overwrite the CSV, re-run build-cex-flow.
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
    (0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43, 'cex'),      -- Coinbase
    (0x73d8bd54f7cf5fab43fe4ef40a62d390644946db, 'cex'),      -- exchange
    (0xdc154fcee1babb560e8528c3a7791527f01423df, 'custody'),  -- BitGo multi-sig (WalletSimple)
    -- Owner-tagged CEX coverage batch, 2026-07-22 (mostly pass-through deposit wallets):
    (0x377b8ce04761754e8ac153b47805a9cf6b190873, 'cex'),      -- Upbit
    (0xcffad3200574698b78f32232aa9d63eabd290703, 'cex'),      -- Crypto.com
    (0xab782bc7d4a2b306825de5a7730034f8f63ee1bc, 'cex'),      -- Bitvavo
    (0xa023f08c70a23abc7edfc5b6b5e171d78dfc947e, 'cex'),      -- Crypto.com 2
    (0xc882b111a75c0c657fc507c04fbfcd2cc984f071, 'cex'),      -- Gate.io
    (0x93228d328c9c74c2bfe9f97638bbb5ef322f2bd5, 'cex'),      -- Bybit 2
    (0xdd276dc5223d0120f9bf1776f38957cc8da23cb0, 'cex'),      -- KuCoin 2
    (0x91dca37856240e5e1906222ec79278b16420dc92, 'cex'),      -- Indodax
    (0x9642b23ed1e01df1092b92641051881a322f5d4e, 'cex'),      -- MEXC 2
    (0xe8c15aad9d4cd3f59c9dfa18828b91a8b2c49596, 'cex'),      -- KuCoin 3
    (0xcc282e2004428939ee5149a9e7872f0b4d5d5ec7, 'cex'),      -- Kraken 3
    (0x21a31ee1afc51d94c2efccaa2092ad1028285549, 'cex'),      -- Binance
    (0x33a64dcdfa041befebc9161a3e0c6180cd94fa89, 'cex'),      -- CoinSpot 2
    (0x548054687ef6c56c6d82e8269e5fd93d8b88fcb2, 'cex'),      -- CoinEx
    (0x0d0707963952f2fba59dd06f2b425ace40b492fe, 'cex'),      -- Gate.io 1
    -- Owner-tagged 2026-07-28. Both hold real balance, so leaving them out understated exchange
    -- supply rather than merely missing a label: the Revolut wallet alone was the largest single
    -- holder in the city and was wearing the "biggest whale" crown.
    (0x15da7556d5ed888306839bed06f868aeaedcb0d7, 'cex'),      -- Revolut-linked
    (0xb0a3a2b60e969afd26561429aa4c1444c57e4411, 'cex'),      -- MEXC
    (0x52c77b0cb827afbad022e6d6caf2c44452edbc39, 'lp'),       -- Uniswap v2 SPX/WETH pool
    -- Added 2026-08-10 (owner-flagged off the whale-watch list). MM/MEV-bot addresses are deliberately
    -- NOT here — they're excluded from holders but attributed to no venue (see EXCLUDE_LABELS kind:"mm").
    (0xf60c2ea62edbfe808163751dd0d8693dcb30019c, 'cex'),      -- Binance US
    (0x1a9d699aee3a56ca49d0cc3b542ae3a37885a3e1, 'cex'),      -- Upbit 2
    (0x7c706586679af2ba6d1a9fc2da9c6af59883fdd3, 'lp'),       -- Uniswap V3 SPX pool
    (0x000000000004444c5dc75cb358380d2e3de08a90, 'lp'),       -- Uniswap V4 PoolManager (singleton)
    -- Tagged in EXCLUDE_LABELS since early Aug but never added here → the Dune-based flow cards had
    -- been undercounting it (~$95M, a large exchange balance). Added 2026-08-10 to close the gap.
    (0x6fe39f2831caf58529779efdb73341aa64df50ab, 'cex')       -- CEX (0x6Fe3)
)
SELECT
  tr.evt_block_date AS day,                                  -- partition column → prunes scan
  t.address,
  t.kind,
  SUM(
      (CASE WHEN tr."to"   = t.address THEN CAST(tr.value AS double) ELSE 0 END)
    - (CASE WHEN tr."from" = t.address THEN CAST(tr.value AS double) ELSE 0 END)
  ) / 1e8                                                    AS net_tokens  -- signed: +in / −out
FROM erc20_ethereum.evt_Transfer tr
JOIN tagged t ON (tr."to" = t.address OR tr."from" = t.address)
WHERE tr.contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
  -- BOUNDED TEST (cheap dry run): AND tr.evt_block_date >= current_date - interval '90' day
GROUP BY 1, 2, 3
ORDER BY 1, 2
