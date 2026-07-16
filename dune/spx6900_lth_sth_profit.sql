-- ============================================================================
-- SPX6900 — LTH vs STH Supply in Profit / Loss   [Dune · Trino SQL] — DRAFT
-- ============================================================================
-- ⚠️⚠️ HEAVY QUERY — DO NOT RUN CASUALLY. Per-wallet FIFO lot reconstruction over the
-- full transfer history + a price join is the single most credit-expensive pattern on
-- Dune (this class is what drained the 2,500/mo). RULES:
--   1. VALIDATE STAGE 1 (as-of today, below) on its own first — it's one pass, cheap-ish.
--   2. For the historical daily series (STAGE 2, described at the bottom) develop on a
--      SHORT window first (add `AND evt_block_time > now() - interval '30' day` while
--      iterating) so a mistake costs ~nothing.
--   3. Run the full historical exactly ONCE, export the CSV, bundle it like
--      src/spx-onchain.js. NEVER put this on a cron — it forward-fills off the bundle.
--
-- METHOD — loop-free FIFO via CUMULATIVE MATCHING (SQL can't hold a per-wallet queue):
--   • rank each wallet's RECEIVES chronologically, stamping each "lot" with a cumulative
--     received range [cum_in_start, cum_in_end] and the USD price when it was received.
--   • sends consume the EARLIEST receives first (FIFO). After `total_out` tokens leave a
--     wallet, a lot is still-held = greatest(0, least(lot_amount, cum_in_end − total_out)).
--   • each surviving lot carries its acquisition TIME (→ age) and PRICE (→ profit/loss vs
--     spot). Classify LTH/STH by age ≥ threshold; in-loss when spot < acq_price.
--
-- SPX6900 is 8-DECIMAL (value / 1e8, NOT 1e18). ETH-native only (cost basis is only
-- reconstructable on the traceable chain). EXCLUDE list = the same 16 pool/bridge/CEX
-- addresses as the master query (LP/CEX swap at spot → they'd wreck the cost basis).
-- LTH threshold: memecoins move fast, so 155d (Bitcoin's) is too long — default 90d here;
-- swap `threshold_days` to 30 / 60 / 90 for the site toggle.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STAGE 1 — CURRENT STATE (as-of today). Run/validate THIS first. Cheap-ish: one
-- pass over transfers, no per-day panel. Sanity vs our numbers: supply-in-profit
-- (LTH_profit + STH_profit) / circulating ≈ our `sip` (~40%); age split should echo
-- the HODL-wave shares (age≥1y ≈ 38%).
-- ─────────────────────────────────────────────────────────────────────────────
WITH params AS (
  SELECT 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c AS token,  -- SPX6900 (8 decimals)
         90 AS threshold_days,                                  -- LTH cutoff (toggle 30/60/90)
         939000000.0 AS circ_supply                            -- circulating supply (tokens)
),
exclude AS (
  SELECT addr FROM (VALUES
      (0x0000000000000000000000000000000000000000), (0x000000000000000000000000000000000000dead)
    , (0x52c77b0cb827afbad022e6d6caf2c44452edbc39)  -- Uniswap v2 pool
    , (0x3ee18b2214aff97000d974cf647e7c347e8fa585)  -- Wormhole bridge
    , (0x7dafba1d69f6c01ae7567ffd7b046ca03b706f83), (0xd2dd7b597fd2435b6db61ddf48544fd931e6869f)
    , (0xdf5e3a1ed0c14a53eee240022301ecb9d267671b)  -- Kraken ×3
    , (0x651641299c7ec0aa44ad7ed9b7e12702fed2022f)  -- Bybit
    , (0x0529ea5885702715e83923c59746ae8734c553b7)  -- Bitpanda
    , (0xf35a6bd6e0459a4b53a27862c51a2a7292b383d1)  -- CoinSpot
    , (0x9b0c45d46d386cedd98873168c36efd0dcba8d46)  -- Revolut
    , (0x3cc936b795a188f0e246cbb2d74c5bd190aecf18)  -- MEXC
    , (0x6d6cc65e2060d0a280fcd47b6c22ec5636797fec)  -- KuCoin
    , (0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43)  -- Coinbase
    , (0x73d8bd54f7cf5fab43fe4ef40a62d390644946db)  -- CEX (unlabeled)
    , (0xdc154fcee1babb560e8528c3a7791527f01423df)  -- contract (unlabeled)
  ) AS t(addr)
),
-- daily USD price, forward/back-filled so a receive on a price-feed-gap day still gets a
-- price (the original-MVRV bug class). One row per day.
px_raw AS (
  SELECT date_trunc('day', minute) AS d, avg(price) AS price
  FROM prices.usd
  WHERE contract_address = (SELECT token FROM params) AND blockchain = 'ethereum'
  GROUP BY 1
),
cal AS ( SELECT d FROM UNNEST(sequence(DATE '2023-08-01', CURRENT_DATE, INTERVAL '1' DAY)) AS t(d) ),
px AS (
  SELECT c.d,
         coalesce(
           last_value(p.price) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
           first_value(p.price) IGNORE NULLS OVER (ORDER BY c.d ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING)
         ) AS price
  FROM cal c LEFT JOIN px_raw p ON p.d = c.d
),
-- incoming legs = coins ACQUIRED by a (non-excluded) wallet, priced at receive time.
receives AS (
  SELECT tr."to" AS wallet,
         tr.evt_block_time AS acq_time,
         CAST(tr.value AS double) / 1e8 AS amt,
         px.price AS acq_price
  FROM erc20_ethereum.evt_Transfer tr
  JOIN px ON px.d = CAST(tr.evt_block_time AS date)
  WHERE tr.contract_address = (SELECT token FROM params)
    AND tr."to" NOT IN (SELECT addr FROM exclude)
),
-- FIFO cumulative range per received lot (ordered by time then log index for stability).
lots AS (
  SELECT wallet, acq_time, acq_price, amt,
         sum(amt) OVER (PARTITION BY wallet ORDER BY acq_time) AS cum_in_end,
         sum(amt) OVER (PARTITION BY wallet ORDER BY acq_time) - amt AS cum_in_start
  FROM receives
),
-- total sent per wallet (all time). FIFO: sends consume the earliest cum_in ranges.
sent AS (
  SELECT tr."from" AS wallet, sum(CAST(tr.value AS double) / 1e8) AS total_out
  FROM erc20_ethereum.evt_Transfer tr
  WHERE tr.contract_address = (SELECT token FROM params)
    AND tr."from" NOT IN (SELECT addr FROM exclude)
  GROUP BY 1
),
held AS (
  SELECT l.acq_time, l.acq_price,
         greatest(0, least(l.amt, l.cum_in_end - coalesce(s.total_out, 0))) AS held_qty
  FROM lots l LEFT JOIN sent s ON s.wallet = l.wallet
),
spot AS ( SELECT price AS p FROM px ORDER BY d DESC LIMIT 1 )
SELECT
  CASE WHEN date_diff('day', h.acq_time, now()) >= (SELECT threshold_days FROM params)
       THEN 'LTH' ELSE 'STH' END AS cohort,
  round(100.0 * sum(CASE WHEN spot.p <  h.acq_price THEN h.held_qty ELSE 0 END) / (SELECT circ_supply FROM params), 2) AS pct_supply_in_loss,
  round(100.0 * sum(CASE WHEN spot.p >= h.acq_price THEN h.held_qty ELSE 0 END) / (SELECT circ_supply FROM params), 2) AS pct_supply_in_profit
FROM held h CROSS JOIN spot
WHERE h.held_qty > 0
GROUP BY 1
ORDER BY 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- STAGE 2 — HISTORICAL DAILY SERIES (the chart). HEAVY — run ONCE, then bundle.
-- Turn Stage 1 "as-of today" into "as-of each day d" by making `total_out`, the held
-- lots, and `spot` all a function of d:
--   • total_out_asof(wallet, d) = sum of sends with block_time <= d  (a window/range).
--   • a lot exists as-of d only if acq_time <= d; held_qty uses total_out_asof.
--   • profit/loss uses px.price on day d (not just today); age = date_diff(d, acq_time).
--   • output: SELECT d, cohort, pct_in_loss, pct_in_profit ... GROUP BY d, cohort
--     (WEEKLY sample `WHERE day_of_week(d)=1` to cut ~7× the work, like the master query).
-- This is the expensive non-equi/as-of panel (lots × days). Then plot LTH-loss / STH-loss
-- as a stacked area beneath spot (STAGE 1's two columns become the "today" marker).
--
-- ⏱️ BEATING THE 2-MINUTE FREE-TIER TIMEOUT (a query that hits it STILL burns credits, so
--    NEVER let one approach 2 min — design every run to finish in seconds). In order:
--   1. DEVELOP ON A SLICE. While iterating, cap the transfer CTEs with a short window
--      (`AND evt_block_time > now() - interval '30' day`) so a mistake costs ~nothing.
--   2. CHUNK THE FULL RUN BY TIME. Don't run all 3 years at once — it times out. Run it
--      one YEAR (or quarter) at a time by bounding the OUTPUT day-grid, e.g.:
--         WHERE d >= DATE '2024-01-01' AND d < DATE '2025-01-01'   -- 2024 chunk
--      Each chunk finishes well under 2 min; export each CSV; concatenate the chunks
--      OFFLINE into the bundle (src/*.js). Full history gets computed — just in N safe
--      runs instead of one impossible one. This is THE reliable way to beat the timeout.
--   3. SAMPLE COARSER for the deepest/oldest chunks (monthly `day_of_month(d)=1`) where
--      daily detail matters least.
--   4. STAGE INTERMEDIATES. If a single chunk still nears the limit, save `held`/`lots` as
--      its own Dune query (runs once, caches), then read that cached result (free) from a
--      lighter downstream query instead of recomputing the reconstruction each time.
-- ─────────────────────────────────────────────────────────────────────────────
