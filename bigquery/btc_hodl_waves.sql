-- ============================================================================
-- BITCOIN HODL WAVES from genesis (2009 → now)          [Google BigQuery, FREE]
-- ============================================================================
-- Reconstructs BTC's supply-by-holding-age bands over time from the PUBLIC
-- `bigquery-public-data.crypto_bitcoin` dataset. Bitcoin is UTXO-based, so age is
-- EXACT: a coin's age = time since its UTXO was created, and it "moves" only when
-- that UTXO is spent. (This is the original Unchained Capital HODL-waves method —
-- no FIFO approximation needed, unlike our ERC-20 reconstruction.)
--
-- METHOD (event-based, so it scales):
--   1. UTXO set = outputs LEFT JOIN inputs on (spent_transaction_hash, spent_output_index)
--      → every coin ever created with its (value, created, spent-or-NULL).
--   2. For each age band a UTXO lives through, emit +value at the date it ENTERS the
--      band and −value at the date it LEAVES (spent, or aged into the next band).
--   3. Cumulative-sum the deltas per band over a weekly grid → supply per band per
--      week → shares of total. Avoids the astronomically expensive naive
--      calendar × 3B-UTXO as-of join.
--
-- ── COST GUARDRAILS (READ FIRST — BigQuery bills by BYTES SCANNED) ──────────
--   • Free tier = 1 TB of query processing / month (BigQuery *sandbox* works with
--     just a Google account, no credit card). This query touches only 4 columns of
--     `outputs` + 3 of `inputs`; expect roughly 0.4–0.7 TB → it is a ONE-FULL-RUN-
--     PER-MONTH query on the free tier. Do NOT iterate on the full tables.
--   • DRY-RUN first: the console's query validator (top-right) shows "This query
--     will process X GB" BEFORE you run — sanity-check it there.
--   • LIMIT does NOT reduce bytes billed. To test the logic cheaply, uncomment the
--     two TEST FILTER lines below (early-years partition prune → a few GB) and
--     check the output shape, THEN remove them for the one real run.
--   • Verify column names in the console's schema browser first (free):
--     outputs: transaction_hash · index · block_timestamp · value
--     inputs:  spent_transaction_hash · spent_output_index · block_timestamp
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
--   1. console.cloud.google.com/bigquery (any Google account; sandbox is fine).
--   2. Paste, check the dry-run estimate, Run (takes a few minutes).
--   3. Result is SMALL (~900 weekly rows) → "SAVE RESULTS → CSV (local file)".
--   4. Send the CSV → it gets bundled like src/spx-onchain.js and the BTC
--      hodl-waves card/site chart is pure rendering from there.
--
-- BANDS: default mirrors OUR SPX hodlwaves (0-1m / 1-3m / 3-6m / 6-12m / 1y+) so the
-- two cards are directly comparable ("SPX's waves vs the king's"). For the classic
-- 11-band Unchained/Glassnode look, swap in the commented `bounds` block.
-- ============================================================================

WITH utxo AS (
  SELECT
    o.value AS v,                              -- satoshis (units cancel in shares)
    DATE(o.block_timestamp) AS created,
    DATE(i.block_timestamp) AS spent           -- NULL = still unspent today
  FROM `bigquery-public-data.crypto_bitcoin.outputs` o
  LEFT JOIN `bigquery-public-data.crypto_bitcoin.inputs` i
    ON  i.spent_transaction_hash = o.transaction_hash
    AND i.spent_output_index     = o.index
  WHERE o.value > 0
  -- TEST FILTER (uncomment BOTH to validate logic on ~2 years for a few GB):
  --   AND o.block_timestamp < TIMESTAMP '2011-01-01'
  --   AND (i.block_timestamp IS NULL OR i.block_timestamp < TIMESTAMP '2011-06-01')
),

-- band k spans [lo, hi) days of age; hi of the last band is effectively infinity
bounds AS (
  SELECT * FROM UNNEST([
    STRUCT(0 AS band, 0 AS lo, 30 AS hi),      -- 0–1m
    STRUCT(1, 30, 90),                         -- 1–3m
    STRUCT(2, 90, 180),                        -- 3–6m
    STRUCT(3, 180, 365),                       -- 6–12m
    STRUCT(4, 365, 40000)                      -- 1y+
  ])
  -- classic 11-band variant (Unchained/Glassnode):
  -- SELECT * FROM UNNEST([
  --   STRUCT(0 AS band, 0 AS lo, 1 AS hi), STRUCT(1,1,7), STRUCT(2,7,30),
  --   STRUCT(3,30,90), STRUCT(4,90,180), STRUCT(5,180,365), STRUCT(6,365,730),
  --   STRUCT(7,730,1095), STRUCT(8,1095,1825), STRUCT(9,1825,2920), STRUCT(10,2920,40000)])
),

-- +v when a UTXO enters a band, −v when it leaves (spent or aged onward). A UTXO
-- reaches band k only if it survives past created+lo. Future-dated events (young
-- coins' not-yet-happened band entries) are dropped by the d <= today filter below.
events AS (
  SELECT b.band, DATE_ADD(u.created, INTERVAL b.lo DAY) AS d, u.v AS delta
  FROM utxo u JOIN bounds b
    ON (u.spent IS NULL OR u.spent > DATE_ADD(u.created, INTERVAL b.lo DAY))
  UNION ALL
  SELECT b.band,
         LEAST(IFNULL(u.spent, DATE '9999-01-01'), DATE_ADD(u.created, INTERVAL b.hi DAY)) AS d,
         -u.v
  FROM utxo u JOIN bounds b
    ON (u.spent IS NULL OR u.spent > DATE_ADD(u.created, INTERVAL b.lo DAY))
),

-- weekly delta grid → running supply per band
weekly AS (
  SELECT band, DATE_TRUNC(d, WEEK(MONDAY)) AS wk, SUM(delta) AS delta
  FROM events
  WHERE d <= CURRENT_DATE()
  GROUP BY band, wk
),
series AS (
  SELECT band, wk,
         SUM(delta) OVER (PARTITION BY band ORDER BY wk ROWS UNBOUNDED PRECEDING) AS sat
  FROM weekly
)

-- one row per week: age-band SHARES (%) + total supply in BTC as a sanity column
-- (latest total should read ≈ 19.9M; shares should sum to ~100).
SELECT
  wk AS week,
  ROUND(100 * SUM(IF(band = 0, sat, 0)) / SUM(sat), 2) AS a0_under_1m,
  ROUND(100 * SUM(IF(band = 1, sat, 0)) / SUM(sat), 2) AS a1_1_3m,
  ROUND(100 * SUM(IF(band = 2, sat, 0)) / SUM(sat), 2) AS a2_3_6m,
  ROUND(100 * SUM(IF(band = 3, sat, 0)) / SUM(sat), 2) AS a3_6_12m,
  ROUND(100 * SUM(IF(band = 4, sat, 0)) / SUM(sat), 2) AS a4_over_1y,
  ROUND(SUM(sat) / 1e8, 0) AS total_btc
FROM series
GROUP BY wk
HAVING SUM(sat) > 0
ORDER BY wk;
