-- ============================================================================
-- PROJECT AEON — full ERC-721 transfer history  [BigQuery · FREE alternative to Dune]
-- ============================================================================
-- Same output as dune/aeon_transfers.sql, from the FREE public Ethereum dataset (no Dune
-- credits). ERC-721 Transfer is decoded from raw logs: topic0 = the Transfer signature, and
-- for ERC-721 all three args are INDEXED → topics[1]=from, topics[2]=to, topics[3]=tokenId
-- (ERC-20 Transfer has only 3 topics — the ARRAY_LENGTH(topics)=4 filter keeps NFT transfers).
-- token_id fits int64 for a 3,333 collection. One tiny query, well within the free 1 TB/mo tier.
-- Export CSV → build-aeon-onchain.mjs.
-- ============================================================================
CREATE TEMP FUNCTION hexToInt(h STRING) AS (
  -- parse a hex string (no 0x) to INT64; safe for token ids up to ~2^63
  (SELECT IFNULL(SUM(CAST(STRPOS('0123456789abcdef', SUBSTR(LOWER(h), LENGTH(h) - i + 1, 1)) - 1 AS INT64) * POW(16, i - 1)), 0)
   FROM UNNEST(GENERATE_ARRAY(1, LEAST(LENGTH(h), 15))) AS i)   -- last 15 hex chars = plenty for a 3,333 collection
);
SELECT
  CONCAT('0x', SUBSTR(topics[OFFSET(1)], 27)) AS from_address,
  CONCAT('0x', SUBSTR(topics[OFFSET(2)], 27)) AS to_address,
  hexToInt(topics[OFFSET(3)])                 AS token_id,
  block_timestamp                             AS time
FROM `bigquery-public-data.crypto_ethereum.logs`
WHERE address = LOWER('0xc374a204334d4Edd4C6a62f0867C752d65E9579c')
  AND topics[OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'  -- Transfer(address,address,uint256)
  AND ARRAY_LENGTH(topics) = 4   -- ERC-721 (indexed tokenId); excludes ERC-20 transfers
ORDER BY block_timestamp;
