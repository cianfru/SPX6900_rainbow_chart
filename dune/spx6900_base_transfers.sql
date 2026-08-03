-- ============================================================================
-- SPX6900 on BASE — FULL transfer history (every holder, like Ethereum)   [Dune · Trino]
-- ============================================================================
-- Base is NOT in BigQuery's free public catalog (no goog_blockchain_base dataset — that's paid-only
-- via Analytics Hub). Dune DOES host decoded, indexed Base data for free, so this is the path. Base is
-- small, so — like the ETH extract — we pull the WHOLE decoded transfer history and reconstruct
-- everything LOCALLY (net balances → holders, ages, flow, exits, cohorts). erc20_base.evt_Transfer is
-- already decoded, so there is NO raw-log/hex/topic parsing.
--
-- ⭐ COST — Dune bills the RESULT-READ by datapoint (rows × columns), which is the real meter (execution
--   is cheap). So: (1) only 4 columns below (dropped tx_hash to cut ~20% of the read); (2) CANARY FIRST
--   — run the free COUNT to size the pull before fetching:
--       SELECT count(*) FROM erc20_base.evt_Transfer
--       WHERE contract_address = 0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C;
--     read ≈ rows × 4 × ~0.002 credits (≈ AEON's 42k rows → ~135 cr). A few hundred k transfers is a
--     few hundred credits ONE-TIME (fine within the 2,500/mo budget); if it's millions, use the
--     keyless Blockscout fetcher instead (see the note at the bottom — zero credits).
--
-- ⚠ VERIFY (free, in Dune's schema browser): table erc20_base.evt_Transfer · columns "from" · "to" ·
--   value · evt_block_time · contract_address. (Older vintage: tokens_base tables — adjust if it errors.)
-- ⚠ UNIT: SPX on Base = 8 decimals. `value` is the RAW uint256 (Trino decimal, EXACT — no FLOAT
--   precision loss); value/1e8 = human. Output human here → reconstruction reads --scale=1.
-- ============================================================================
SELECT
  "from"          AS sender,
  "to"            AS receiver,
  value / 1e8     AS amount,        -- human (Base decimals = 8); exact Trino decimal
  evt_block_time  AS time
FROM erc20_base.evt_Transfer
WHERE contract_address = 0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C   -- SPX6900 on Base (varbinary literal, unquoted)
ORDER BY evt_block_time
-- CHUNK if a single export is too large to download (block-range, cost unchanged — concat offline):
--   AND evt_block_time >= TIMESTAMP '2024-01-01' AND evt_block_time < TIMESTAMP '2025-01-01'
--
-- Reconstruction (build when the CSV lands, validated — not blind):
--   node scripts/build-base-onchain.mjs --in=<transfers.csv> --scale=1
-- = a net-balance replay from transfers (mint 0x0 = source; each wallet's running balance over time) →
-- residents with LEGACY forward-fill membership (current = last balance; ≥5k → resident). Full history
-- incl. sub-5k/exits means forward-fill is correct AND cohort/survival/exit analysis works — ETH parity.
-- Sanity: total holders near the ~114k Blockscout headcount (before infra exclusion).
--
-- ⭐ BASE INFRA TO EXCLUDE (tag on Basescan — NOT residents):
--   • Wormhole bridge custody (Base SPX is bridge-minted)   • Aerodrome + Uniswap-Base LP pools
--   • Coinbase (NATIVE on Base — likely the single largest wallet)   • other CEX hot wallets
--   • the Dec-2024 airdrop distributor (the +50k one-week wallet spike in the growth chart)
--   Raw Base top-100 concentration looks extreme ONLY because of these — strip them first, exactly as
--   excluding them took ETH's raw top-100 from 68% → 58%.
--
-- ⭐ ZERO-CREDIT ALTERNATIVE — Blockscout (keyless; the repo already uses it for the Base headcount):
--   paginate getLogs on this contract + topic0 0xddf252ad…3b3ef over block ranges → the same transfers,
--   $0. Claude can write + unit-test the paginating fetcher (Node, runs in CI) if you'd rather not spend
--   any Dune read. Say the word.
