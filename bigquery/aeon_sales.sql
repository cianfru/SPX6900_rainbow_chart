-- ============================================================================
-- PROJECT AEON — sales reconstruction        [Google BigQuery · FREE · replaces Dune nft.trades]
-- ============================================================================
-- Dune's `nft.trades` is a full marketplace decoder (Seaport/Blur/OpenSea + WETH/ETH + USD prices).
-- BigQuery has no such spellbook, so we reconstruct AEON sales from the RAW chain the pragmatic way:
--   a sale = an AEON ERC-721 Transfer (not a mint) in a tx where ETH and/or WETH was paid.
--   price(ETH) = the tx's ETH value (buyer → marketplace, the standard Seaport ETH path), OR, when
--                that's zero (bid/offer sales), the WETH that moved TO THE SELLER in the same tx.
--   sweeps (several AEON in one tx) split the tx price evenly across the tokens moved.
-- OUTPUT columns match dune/aeon_sales.csv EXCEPT price_usd, which BigQuery can't price — the builder
-- fills it from a daily ETH/USD rate (see build-aeon-sales-bq.mjs). currency is ETH for every row.
--
-- ⚠ VALIDATE BEFORE WIRING THE CRON. This is a heuristic reconstruction, not Dune's audited decoder:
--   • fees/royalties are INSIDE the tx value, so `price` = what the BUYER paid (gross), which is what
--     you want for a sale price — but it can differ from Dune's "trade amount" by the fee split.
--   • private/OTC transfers with a side ETH payment can look like sales; true gifts (no ETH/WETH) are
--     correctly excluded by the `paid > 0` filter.
--   • bundles that mix AEON with other NFTs mis-split the price (rare for a single-collection sweep).
--   RUN IT, export the CSV, and diff the last ~30 days against the final Dune pull before switching over.
--
-- COST: scans crypto_ethereum.logs (AEON slice) + transactions (value) + WETH logs, all partition-
-- pruned on block_timestamp from launch → a few hundred GB one-time, ~GB/day incremental (well inside
-- the free 1 TB/mo). Add `AND block_timestamp >= TIMESTAMP('<last csv day>')` for the daily delta.
-- ============================================================================
DECLARE AEON     STRING DEFAULT LOWER('0xc374a204334d4Edd4C6a62f0867C752d65E9579c');
DECLARE WETH     STRING DEFAULT '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
DECLARE TRANSFER STRING DEFAULT '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
DECLARE START    TIMESTAMP DEFAULT TIMESTAMP('2023-11-01');   -- AEON launch-ish; raise for a daily delta

CREATE TEMP FUNCTION hexToInt(h STRING) AS (   -- token id (small); last 15 hex chars are plenty
  (SELECT IFNULL(SUM(CAST(STRPOS('0123456789abcdef', SUBSTR(LOWER(h), LENGTH(h)-i+1, 1))-1 AS INT64) * POW(16, i-1)), 0)
   FROM UNNEST(GENERATE_ARRAY(1, LEAST(LENGTH(h), 15))) AS i)
);
CREATE TEMP FUNCTION weiToEth(h STRING) AS (   -- WETH/ETH amount (up to ~1e21 wei) → ETH as a FLOAT64
  -- float64 keeps ~15-16 significant digits; dividing by 1e18 and rounding to 6dp needs only the top
  -- digits, so approximating the low bits is fine for a display/analytics price.
  (SELECT IFNULL(SUM(CAST(STRPOS('0123456789abcdef', SUBSTR(LOWER(h), LENGTH(h)-i+1, 1))-1 AS INT64) * POW(16, i-1)), 0)
   FROM UNNEST(GENERATE_ARRAY(1, LEAST(LENGTH(h), 24))) AS i) / 1e18
);

WITH
-- AEON ERC-721 transfers, mints excluded
xfer AS (
  SELECT transaction_hash AS tx, block_timestamp AS time,
    CONCAT('0x', SUBSTR(topics[OFFSET(1)], 27)) AS seller,
    CONCAT('0x', SUBSTR(topics[OFFSET(2)], 27)) AS buyer,
    hexToInt(topics[OFFSET(3)])                 AS token_id
  FROM `bigquery-public-data.crypto_ethereum.logs`
  WHERE address = AEON AND topics[OFFSET(0)] = TRANSFER
    AND ARRAY_LENGTH(topics) = 4
    AND CONCAT('0x', SUBSTR(topics[OFFSET(1)], 27)) != '0x0000000000000000000000000000000000000000'
    AND block_timestamp >= START
),
cnt AS ( SELECT tx, COUNT(*) AS n FROM xfer GROUP BY tx ),
-- ETH paid: the transaction value + the router it hit (for the marketplace label)
ethtx AS (
  SELECT `hash` AS tx, value / 1e18 AS eth, to_address AS router
  FROM `bigquery-public-data.crypto_ethereum.transactions`
  WHERE block_timestamp >= START AND value > 0
),
-- WETH that moved TO THE SELLER in the tx (covers bid/offer sales where tx value is 0)
wtransfers AS (
  SELECT transaction_hash AS tx,
    CONCAT('0x', SUBSTR(topics[OFFSET(2)], 27)) AS to_addr,
    weiToEth(SUBSTR(data, 3))                   AS amt
  FROM `bigquery-public-data.crypto_ethereum.logs`
  WHERE address = WETH AND topics[OFFSET(0)] = TRANSFER AND ARRAY_LENGTH(topics) = 3
    AND block_timestamp >= START
),
weth_to_seller AS (
  SELECT x.tx, SUM(w.amt) AS weth
  FROM xfer x JOIN wtransfers w ON w.tx = x.tx AND w.to_addr = x.seller
  GROUP BY x.tx
)
SELECT
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S UTC', x.time)            AS time,
  x.token_id                                                   AS token_id,
  ROUND(COALESCE(e.eth, ws.weth, 0) / c.n, 6)                  AS price,
  'ETH'                                                        AS currency_symbol,
  CAST(NULL AS FLOAT64)                                        AS price_usd,   -- builder fills from ETH/USD
  CASE
    WHEN LOWER(e.router) IN ('0x00000000000000adc04c56bf30ac9d3c0aaf14dc',
                             '0x0000000000000068f116a894984e2db1123eb395',
                             '0x00000000000001ad428e4906ae43d8f9852d0dd6') THEN 'opensea'   -- Seaport 1.1/1.4/1.5/1.6
    WHEN LOWER(e.router) IN ('0x000000000000ad05ccc4f10045630fb830b95127',
                             '0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5',
                             '0x39da41747a83aee658334415666f3ef92dd0d541') THEN 'blur'
    ELSE 'other'
  END                                                          AS marketplace,
  x.buyer                                                      AS buyer,
  x.seller                                                     AS seller,
  x.tx                                                         AS tx_hash
FROM xfer x
JOIN cnt c ON c.tx = x.tx
LEFT JOIN (SELECT tx, MAX(eth) AS eth, ANY_VALUE(router) AS router FROM ethtx GROUP BY tx) e ON e.tx = x.tx
LEFT JOIN weth_to_seller ws ON ws.tx = x.tx
WHERE COALESCE(e.eth, ws.weth, 0) > 0     -- a real sale (ETH or WETH changed hands); free transfers drop out
ORDER BY x.time;
