-- ============================================================================
-- PROJECT AEON — full ERC-721 transfer history  [Dune · Trino]
-- ============================================================================
-- Contract: 0xc374a204334d4Edd4C6a62f0867C752d65E9579c (Ethereum), 3,333 supply.
-- NFTs are CLEAN vs the coin: each tokenId has ONE owner + ONE last-transfer time,
-- so holder-age / concentration / ownership need NO FIFO — just the transfer log.
--
-- ⚠ This is the FULL-HISTORY form (for seeding / manual runs). The daily CI job does NOT run
-- it as-is — build-aeon-dune-refresh.mjs PATCHes in `AND evt_block_time >= <archive's last day>`
-- so it pulls only the delta. Re-downloading all ~25k rows daily cost ~62 credits/day in Dune's
-- "API Result Read" charge (billed by datapoints, separate from the cheap query execution).
-- Downstream, a local Node reconstruction (build-aeon-onchain.mjs) derives per-token current
-- owner + age → HODL waves, holder-age bands, top-N concentration, holders-by-count distribution.
--
-- VERIFY on first run (Dune column names churn): erc721_ethereum.evt_Transfer should expose
-- "from" · "to" · tokenId · evt_block_time · contract_address. If tokenId errors, try `id`.
-- ============================================================================
SELECT
  "from"          AS from_address,
  "to"            AS to_address,
  tokenId         AS token_id,
  evt_block_time  AS time
FROM erc721_ethereum.evt_Transfer
WHERE contract_address = 0xc374a204334d4edd4c6a62f0867c752d65e9579c
ORDER BY evt_block_time;
