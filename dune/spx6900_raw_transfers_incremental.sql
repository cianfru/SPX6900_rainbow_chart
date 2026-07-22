-- ============================================================================
-- SPX6900 — INCREMENTAL raw-transfer delta for the weekly FIFO refresh  [Dune · Trino]
-- ============================================================================
-- WHY THIS EXISTS (owner's insight, 2026-07-22): the full history is ALREADY reconstructed
-- and bundled. We do NOT need to re-export all ~2.6M transfers every week — only the NEW
-- rows since the last run. That delta is tiny (SPX does ~2,500 transfers/day → ~17k/week),
-- so it is:
--   • CHEAP TO SCAN  — bounded by evt_block_time to recent partitions + one token filter →
--     a few GB → a HANDFUL of credits per run (~tens/month, nowhere near the 2,500 budget).
--   • SMALL TO READ  — ~17k rows × 4 cols ≈ 68k datapoints, ~0.7% of the free-tier result
--     allowance → NO 402 (the 402 only hit the 2.6M-row FULL export, a result-size limit,
--     NOT a scan/credit limit).
--
-- So the earlier "Dune can't refresh FIFO on free tier" was ONLY true for the bulk export.
-- The incremental delta is exactly the cheap pattern Dune is good at.
--
-- THE ONE REQUIREMENT: FIFO needs the FULL transfer history to compute per-lot ages back to
-- launch. Dune only hands us the delta, so WE persist the growing base ourselves (a committed/
-- release-asset archive), append this delta, and re-run the LOCAL FIFO engine ($0). That
-- persistence is the piece BigQuery gave us for free (its append table); on Dune we store it.
--
-- USAGE: replace {{since}} with the max evt_block_time already in the archive (the pipeline
-- passes it automatically). First-ever run: set it to launch to pull the whole history once.
-- ============================================================================

SELECT
  "from"          AS sender,
  "to"            AS receiver,
  evt_block_time  AS time,
  value           AS value          -- raw 8-decimal; the engine scales by 1e8
FROM erc20_ethereum.evt_Transfer
WHERE contract_address = 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c
  AND evt_block_time > TIMESTAMP '{{since}}'   -- e.g. '2026-07-20 00:00:00'; partition-pruned
ORDER BY evt_block_time;
