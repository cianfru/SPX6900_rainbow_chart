-- ============================================================================
-- BITCOIN REALIZED CAP & MVRV from ~2010 → now            [Google BigQuery, FREE]
-- ============================================================================
-- Reconstructs Bitcoin's REALIZED CAP (and therefore MVRV = market-cap ÷ realized-
-- cap) from the PUBLIC `bigquery-public-data.crypto_bitcoin` UTXO set — the SAME
-- dataset btc_hodl_waves.sql uses. This makes BTC MVRV OUR OWN reproducible
-- reconstruction (no Coin Metrics dependency) and pushes the record back to ~2010-07,
-- roughly BTC age ~1.5y (its earliest real market price) — earlier than the Coin
-- Metrics series (2011). It CANNOT go earlier: Bitcoin had no market price before
-- mid-2010, so realized cap is genuinely undefined in 2009–early-2010. That limit is
-- physics of the data, not a gap we can close.
--
-- METHOD — realized cap the standard way (each coin valued at the price when it LAST
-- MOVED, i.e. when its current UTXO was created):
--   realized_cap(T) = Σ over UTXOs unspent at T of  value × price(month it was created)
--   supply(T)       = Σ over UTXOs unspent at T of  value            (every live sat)
--   market_cap(T)   = supply(T) × price(T)
--   MVRV(T)         = market_cap(T) / realized_cap(T)
-- Computed as an EVENT CUMSUM (not a calendar × 3B-UTXO as-of join): each UTXO emits
-- +value (and +value×price_created) at its creation month and the negatives at its
-- spend month; a running SUM over months is the stock. Monthly grid — plenty for a
-- 15-year MVRV curve, and it keeps the output tiny.
--
-- Coins created BEFORE the first priced month (2010-07) count toward SUPPLY but carry
-- realized value 0 (the standard treatment of never-priced early/Satoshi coins), so
-- the 2010–2011 stretch is inherently noisy/high — which is exactly why Coin Metrics
-- starts its series in 2011. Read the earliest months as unstable; splice/trust from
-- ~2011 onward where it should track Coin Metrics closely (a good cross-check).
--
-- ── COST GUARDRAILS (READ FIRST — BigQuery bills by BYTES SCANNED) ──────────
--   • Free tier = 1 TB/month (sandbox works with a plain Google account). This
--     touches only `outputs`(value, transaction_hash, index, block_timestamp) +
--     `inputs`(spent_transaction_hash, spent_output_index, block_timestamp):
--     expect ~0.4–0.7 TB → ONE full run per month. Do NOT iterate on the full tables.
--   • DRY-RUN first (top-right validator shows GB before you run).
--   • To validate the LOGIC cheaply, uncomment the TEST FILTER (early-years prune).
--   • Result is SMALL (~190 monthly rows) → SAVE RESULTS → CSV (local file).
--   • Send the CSV → `node scripts/build-btc-realized-cap.mjs --csv=<file>` bundles it.
-- ============================================================================

WITH price_m AS (
  SELECT * FROM UNNEST([
    STRUCT(DATE '2010-07-01' AS m, 0.0699 AS usd),
    STRUCT(DATE '2010-08-01' AS m, 0.06 AS usd),
    STRUCT(DATE '2010-09-01' AS m, 0.0619 AS usd),
    STRUCT(DATE '2010-10-01' AS m, 0.1989 AS usd),
    STRUCT(DATE '2010-11-01' AS m, 0.2299 AS usd),
    STRUCT(DATE '2010-12-01' AS m, 0.3 AS usd),
    STRUCT(DATE '2011-01-01' AS m, 0.52 AS usd),
    STRUCT(DATE '2011-02-01' AS m, 0.89 AS usd),
    STRUCT(DATE '2011-03-01' AS m, 0.7925 AS usd),
    STRUCT(DATE '2011-04-01' AS m, 2.211 AS usd),
    STRUCT(DATE '2011-05-01' AS m, 8.741 AS usd),
    STRUCT(DATE '2011-06-01' AS m, 16.1 AS usd),
    STRUCT(DATE '2011-07-01' AS m, 13.53 AS usd),
    STRUCT(DATE '2011-08-01' AS m, 8.969 AS usd),
    STRUCT(DATE '2011-09-01' AS m, 4.772 AS usd),
    STRUCT(DATE '2011-10-01' AS m, 3.248 AS usd),
    STRUCT(DATE '2011-11-01' AS m, 2.97 AS usd),
    STRUCT(DATE '2011-12-01' AS m, 4.248 AS usd),
    STRUCT(DATE '2012-01-01' AS m, 5.381 AS usd),
    STRUCT(DATE '2012-02-01' AS m, 4.868 AS usd),
    STRUCT(DATE '2012-03-01' AS m, 4.808 AS usd),
    STRUCT(DATE '2012-04-01' AS m, 4.979 AS usd),
    STRUCT(DATE '2012-05-01' AS m, 5.18 AS usd),
    STRUCT(DATE '2012-06-01' AS m, 6.69 AS usd),
    STRUCT(DATE '2012-07-01' AS m, 9.098 AS usd),
    STRUCT(DATE '2012-08-01' AS m, 10.92 AS usd),
    STRUCT(DATE '2012-09-01' AS m, 12.39 AS usd),
    STRUCT(DATE '2012-10-01' AS m, 11.2 AS usd),
    STRUCT(DATE '2012-11-01' AS m, 12.56 AS usd),
    STRUCT(DATE '2012-12-01' AS m, 13.45 AS usd),
    STRUCT(DATE '2013-01-01' AS m, 19.53 AS usd),
    STRUCT(DATE '2013-02-01' AS m, 33.38 AS usd),
    STRUCT(DATE '2013-03-01' AS m, 92.19 AS usd),
    STRUCT(DATE '2013-04-01' AS m, 142 AS usd),
    STRUCT(DATE '2013-05-01' AS m, 132.1 AS usd),
    STRUCT(DATE '2013-06-01' AS m, 93.33 AS usd),
    STRUCT(DATE '2013-07-01' AS m, 98.58 AS usd),
    STRUCT(DATE '2013-08-01' AS m, 137.8 AS usd),
    STRUCT(DATE '2013-09-01' AS m, 131.7 AS usd),
    STRUCT(DATE '2013-10-01' AS m, 204.2 AS usd),
    STRUCT(DATE '2013-11-01' AS m, 1102 AS usd),
    STRUCT(DATE '2013-12-01' AS m, 726.5 AS usd),
    STRUCT(DATE '2014-01-01' AS m, 817.9 AS usd),
    STRUCT(DATE '2014-02-01' AS m, 586.3 AS usd),
    STRUCT(DATE '2014-03-01' AS m, 502.3 AS usd),
    STRUCT(DATE '2014-04-01' AS m, 436.9 AS usd),
    STRUCT(DATE '2014-05-01' AS m, 620.5 AS usd),
    STRUCT(DATE '2014-06-01' AS m, 637.8 AS usd),
    STRUCT(DATE '2014-07-01' AS m, 560.8 AS usd),
    STRUCT(DATE '2014-08-01' AS m, 508.1 AS usd),
    STRUCT(DATE '2014-09-01' AS m, 376 AS usd),
    STRUCT(DATE '2014-10-01' AS m, 336.6 AS usd),
    STRUCT(DATE '2014-11-01' AS m, 376.5 AS usd),
    STRUCT(DATE '2014-12-01' AS m, 310.1 AS usd),
    STRUCT(DATE '2015-01-01' AS m, 228.6 AS usd),
    STRUCT(DATE '2015-02-01' AS m, 236.2 AS usd),
    STRUCT(DATE '2015-03-01' AS m, 243.3 AS usd),
    STRUCT(DATE '2015-04-01' AS m, 236.2 AS usd),
    STRUCT(DATE '2015-05-01' AS m, 233.5 AS usd),
    STRUCT(DATE '2015-06-01' AS m, 256.3 AS usd),
    STRUCT(DATE '2015-07-01' AS m, 288.7 AS usd),
    STRUCT(DATE '2015-08-01' AS m, 230.1 AS usd),
    STRUCT(DATE '2015-09-01' AS m, 236 AS usd),
    STRUCT(DATE '2015-10-01' AS m, 325.8 AS usd),
    STRUCT(DATE '2015-11-01' AS m, 371.5 AS usd),
    STRUCT(DATE '2015-12-01' AS m, 432.2 AS usd),
    STRUCT(DATE '2016-01-01' AS m, 364.4 AS usd),
    STRUCT(DATE '2016-02-01' AS m, 432.1 AS usd),
    STRUCT(DATE '2016-03-01' AS m, 415.4 AS usd),
    STRUCT(DATE '2016-04-01' AS m, 447.9 AS usd),
    STRUCT(DATE '2016-05-01' AS m, 534.2 AS usd),
    STRUCT(DATE '2016-06-01' AS m, 637.4 AS usd),
    STRUCT(DATE '2016-07-01' AS m, 657.3 AS usd),
    STRUCT(DATE '2016-08-01' AS m, 571.8 AS usd),
    STRUCT(DATE '2016-09-01' AS m, 608.3 AS usd),
    STRUCT(DATE '2016-10-01' AS m, 697.3 AS usd),
    STRUCT(DATE '2016-11-01' AS m, 731.8 AS usd),
    STRUCT(DATE '2016-12-01' AS m, 971.7 AS usd),
    STRUCT(DATE '2017-01-01' AS m, 968.3 AS usd),
    STRUCT(DATE '2017-02-01' AS m, 1193 AS usd),
    STRUCT(DATE '2017-03-01' AS m, 1039 AS usd),
    STRUCT(DATE '2017-04-01' AS m, 1321 AS usd),
    STRUCT(DATE '2017-05-01' AS m, 2329 AS usd),
    STRUCT(DATE '2017-06-01' AS m, 2491 AS usd),
    STRUCT(DATE '2017-07-01' AS m, 2740 AS usd),
    STRUCT(DATE '2017-08-01' AS m, 4394 AS usd),
    STRUCT(DATE '2017-09-01' AS m, 4135 AS usd),
    STRUCT(DATE '2017-10-01' AS m, 6369 AS usd),
    STRUCT(DATE '2017-11-01' AS m, 10410 AS usd),
    STRUCT(DATE '2017-12-01' AS m, 13620 AS usd),
    STRUCT(DATE '2018-01-01' AS m, 11160 AS usd),
    STRUCT(DATE '2018-02-01' AS m, 10710 AS usd),
    STRUCT(DATE '2018-03-01' AS m, 7127 AS usd),
    STRUCT(DATE '2018-04-01' AS m, 9250 AS usd),
    STRUCT(DATE '2018-05-01' AS m, 7111 AS usd),
    STRUCT(DATE '2018-06-01' AS m, 6117 AS usd),
    STRUCT(DATE '2018-07-01' AS m, 8186 AS usd),
    STRUCT(DATE '2018-08-01' AS m, 7047 AS usd),
    STRUCT(DATE '2018-09-01' AS m, 6635 AS usd),
    STRUCT(DATE '2018-10-01' AS m, 6481 AS usd),
    STRUCT(DATE '2018-11-01' AS m, 3833 AS usd),
    STRUCT(DATE '2018-12-01' AS m, 3810 AS usd),
    STRUCT(DATE '2019-01-01' AS m, 3413 AS usd),
    STRUCT(DATE '2019-02-01' AS m, 3825 AS usd),
    STRUCT(DATE '2019-03-01' AS m, 4104 AS usd),
    STRUCT(DATE '2019-04-01' AS m, 5200 AS usd),
    STRUCT(DATE '2019-05-01' AS m, 8651 AS usd),
    STRUCT(DATE '2019-06-01' AS m, 12350 AS usd),
    STRUCT(DATE '2019-07-01' AS m, 9535 AS usd),
    STRUCT(DATE '2019-08-01' AS m, 9589 AS usd),
    STRUCT(DATE '2019-09-01' AS m, 8064 AS usd),
    STRUCT(DATE '2019-10-01' AS m, 9407 AS usd),
    STRUCT(DATE '2019-11-01' AS m, 7439 AS usd),
    STRUCT(DATE '2019-12-01' AS m, 7308 AS usd),
    STRUCT(DATE '2020-01-01' AS m, 9510 AS usd),
    STRUCT(DATE '2020-02-01' AS m, 8802 AS usd),
    STRUCT(DATE '2020-03-01' AS m, 6403 AS usd),
    STRUCT(DATE '2020-04-01' AS m, 8744 AS usd),
    STRUCT(DATE '2020-05-01' AS m, 9427 AS usd),
    STRUCT(DATE '2020-06-01' AS m, 9140 AS usd),
    STRUCT(DATE '2020-07-01' AS m, 10900 AS usd),
    STRUCT(DATE '2020-08-01' AS m, 11700 AS usd),
    STRUCT(DATE '2020-09-01' AS m, 10840 AS usd),
    STRUCT(DATE '2020-10-01' AS m, 13440 AS usd),
    STRUCT(DATE '2020-11-01' AS m, 17720 AS usd),
    STRUCT(DATE '2020-12-01' AS m, 27130 AS usd),
    STRUCT(DATE '2021-01-01' AS m, 34200 AS usd),
    STRUCT(DATE '2021-02-01' AS m, 46550 AS usd),
    STRUCT(DATE '2021-03-01' AS m, 55730 AS usd),
    STRUCT(DATE '2021-04-01' AS m, 54990 AS usd),
    STRUCT(DATE '2021-05-01' AS m, 35710 AS usd),
    STRUCT(DATE '2021-06-01' AS m, 35970 AS usd),
    STRUCT(DATE '2021-07-01' AS m, 39980 AS usd),
    STRUCT(DATE '2021-08-01' AS m, 48940 AS usd),
    STRUCT(DATE '2021-09-01' AS m, 42250 AS usd),
    STRUCT(DATE '2021-10-01' AS m, 61840 AS usd),
    STRUCT(DATE '2021-11-01' AS m, 57850 AS usd),
    STRUCT(DATE '2021-12-01' AS m, 46510 AS usd),
    STRUCT(DATE '2022-01-01' AS m, 37850 AS usd),
    STRUCT(DATE '2022-02-01' AS m, 37800 AS usd),
    STRUCT(DATE '2022-03-01' AS m, 47460 AS usd),
    STRUCT(DATE '2022-04-01' AS m, 39740 AS usd),
    STRUCT(DATE '2022-05-01' AS m, 29090 AS usd),
    STRUCT(DATE '2022-06-01' AS m, 20750 AS usd),
    STRUCT(DATE '2022-07-01' AS m, 23650 AS usd),
    STRUCT(DATE '2022-08-01' AS m, 20310 AS usd),
    STRUCT(DATE '2022-09-01' AS m, 19440 AS usd),
    STRUCT(DATE '2022-10-01' AS m, 20590 AS usd),
    STRUCT(DATE '2022-11-01' AS m, 16460 AS usd),
    STRUCT(DATE '2022-12-01' AS m, 16600 AS usd),
    STRUCT(DATE '2023-01-01' AS m, 23800 AS usd),
    STRUCT(DATE '2023-02-01' AS m, 23160 AS usd),
    STRUCT(DATE '2023-03-01' AS m, 28040 AS usd),
    STRUCT(DATE '2023-04-01' AS m, 29220 AS usd),
    STRUCT(DATE '2023-05-01' AS m, 27760 AS usd),
    STRUCT(DATE '2023-06-01' AS m, 30080 AS usd),
    STRUCT(DATE '2023-07-01' AS m, 29310 AS usd),
    STRUCT(DATE '2023-08-01' AS m, 27300 AS usd),
    STRUCT(DATE '2023-09-01' AS m, 26920 AS usd),
    STRUCT(DATE '2023-10-01' AS m, 34560 AS usd),
    STRUCT(DATE '2023-11-01' AS m, 37800 AS usd),
    STRUCT(DATE '2023-12-01' AS m, 42600 AS usd),
    STRUCT(DATE '2024-01-01' AS m, 42890 AS usd),
    STRUCT(DATE '2024-02-01' AS m, 54480 AS usd),
    STRUCT(DATE '2024-03-01' AS m, 69700 AS usd),
    STRUCT(DATE '2024-04-01' AS m, 63800 AS usd),
    STRUCT(DATE '2024-05-01' AS m, 67580 AS usd),
    STRUCT(DATE '2024-06-01' AS m, 60320 AS usd),
    STRUCT(DATE '2024-07-01' AS m, 68240 AS usd),
    STRUCT(DATE '2024-08-01' AS m, 59160 AS usd),
    STRUCT(DATE '2024-09-01' AS m, 65660 AS usd),
    STRUCT(DATE '2024-10-01' AS m, 72780 AS usd),
    STRUCT(DATE '2024-11-01' AS m, 95660 AS usd),
    STRUCT(DATE '2024-12-01' AS m, 95180 AS usd),
    STRUCT(DATE '2025-01-01' AS m, 104800 AS usd),
    STRUCT(DATE '2025-02-01' AS m, 83900 AS usd),
    STRUCT(DATE '2025-03-01' AS m, 84360 AS usd),
    STRUCT(DATE '2025-04-01' AS m, 93810 AS usd),
    STRUCT(DATE '2025-05-01' AS m, 104000 AS usd),
    STRUCT(DATE '2025-06-01' AS m, 108400 AS usd),
    STRUCT(DATE '2025-07-01' AS m, 117900 AS usd),
    STRUCT(DATE '2025-08-01' AS m, 112500 AS usd),
    STRUCT(DATE '2025-09-01' AS m, 109700 AS usd),
    STRUCT(DATE '2025-10-01' AS m, 108200 AS usd),
    STRUCT(DATE '2025-11-01' AS m, 90840 AS usd),
    STRUCT(DATE '2025-12-01' AS m, 87160 AS usd),
    STRUCT(DATE '2026-01-01' AS m, 89160 AS usd),
    STRUCT(DATE '2026-02-01' AS m, 65880 AS usd),
    STRUCT(DATE '2026-03-01' AS m, 65970 AS usd),
    STRUCT(DATE '2026-04-01' AS m, 76350 AS usd),
    STRUCT(DATE '2026-05-01' AS m, 73540 AS usd),
    STRUCT(DATE '2026-06-01' AS m, 63250 AS usd)
  ])
),
utxo AS (
  SELECT
    o.value AS v,
    DATE_TRUNC(DATE(o.block_timestamp), MONTH) AS created_m,
    DATE_TRUNC(DATE(i.block_timestamp), MONTH) AS spent_m     -- NULL = still unspent
  FROM `bigquery-public-data.crypto_bitcoin.outputs` o
  LEFT JOIN `bigquery-public-data.crypto_bitcoin.inputs` i
    ON  i.spent_transaction_hash = o.transaction_hash
    AND i.spent_output_index     = o.index
  WHERE o.value > 0
  -- TEST FILTER (uncomment BOTH to validate on ~2 years for a few GB, then remove):
  --   AND o.block_timestamp < TIMESTAMP '2012-01-01'
  --   AND (i.block_timestamp IS NULL OR i.block_timestamp < TIMESTAMP '2012-06-01')
),
-- price each UTXO at its CREATION month (LEFT JOIN so pre-2010-07 coins keep supply
-- but get realized value 0 via COALESCE — the standard never-priced-coin treatment)
priced AS (
  SELECT u.v, u.created_m, u.spent_m, u.v * COALESCE(pc.usd, 0) / 1e8 AS rc_usd
  FROM utxo u
  LEFT JOIN price_m pc ON pc.m = u.created_m
),
-- +stock at creation, -stock at spend, for BOTH supply (sats) and realized cap (USD)
deltas AS (
  SELECT created_m AS m, SUM(v) AS d_sup, SUM(rc_usd) AS d_rc FROM priced GROUP BY 1
  UNION ALL
  SELECT spent_m AS m, -SUM(v) AS d_sup, -SUM(rc_usd) AS d_rc FROM priced WHERE spent_m IS NOT NULL GROUP BY 1
),
grid AS (
  SELECT m, SUM(d_sup) AS d_sup, SUM(d_rc) AS d_rc FROM deltas GROUP BY 1
),
cum AS (
  SELECT m,
    SUM(d_sup) OVER (ORDER BY m) AS supply_sats,
    SUM(d_rc)  OVER (ORDER BY m) AS realized_cap_usd
  FROM grid
)
SELECT
  FORMAT_DATE('%Y-%m-%d', c.m) AS date,
  ROUND(c.supply_sats / 1e8, 2) AS supply_btc,
  ROUND((c.supply_sats / 1e8) * pm.usd, 0) AS market_cap_usd,
  ROUND(c.realized_cap_usd, 0) AS realized_cap_usd,
  ROUND(((c.supply_sats / 1e8) * pm.usd) / NULLIF(c.realized_cap_usd, 0), 4) AS mvrv
FROM cum c
JOIN price_m pm ON pm.m = c.m          -- only priced months (2010-07 →) reach the output
WHERE c.realized_cap_usd > 0
ORDER BY c.m;
