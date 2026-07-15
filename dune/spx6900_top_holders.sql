-- ============================================================================
-- SPX6900 — TOP ETH HOLDERS (diagnostic to build the `exclude` list)
-- ============================================================================
-- The master snapshot's concentration + gini + realized_price are sensitive to
-- non-person addresses (LP pools, the bridge lock holding Base/Solana supply,
-- CEX hot wallets, routers) sitting in the top holders. This lists the top 40
-- by balance with signals to classify each:
--   • is_contract = true  → almost certainly a pool/bridge/router (exclude it).
--   • very high n_recv/n_send → router/pool/CEX behaviour even if EOA-fronted.
--   • huge single balance + few txns → likely a bridge lock or treasury.
-- Cross-reference each address on Etherscan (it labels most CEX/bridge addrs),
-- then paste the non-person ones into `exclude` in the snapshot query and re-run.
-- Expect gini and top10/top100 to drop toward realistic levels afterward, while
-- holder_count_eth barely moves (it's robust — a handful of addresses out of ~49.6k).
-- ============================================================================

WITH
params AS ( SELECT 0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c AS token, 8 AS decimals ),

legs AS (
  SELECT "to"   AS address,  CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt, 1 AS is_in
    FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
  UNION ALL
  SELECT "from" AS address, -CAST(value AS double)/pow(10,(SELECT decimals FROM params)) AS amt, 0 AS is_in
    FROM erc20_ethereum.evt_Transfer WHERE contract_address = (SELECT token FROM params)
),
agg AS (
  SELECT address,
         sum(amt)                            AS balance,
         sum(is_in)                          AS n_recv,
         sum(1 - is_in)                       AS n_send
  FROM legs
  GROUP BY address
),
tot AS ( SELECT sum(balance) AS s FROM agg WHERE balance > 0 )

SELECT
  a.address,
  a.balance,
  100.0 * a.balance / (SELECT s FROM tot)   AS share_pct,
  a.n_recv,
  a.n_send,
  -- Contract detection: present in creation traces ⇒ it's a contract (pool/bridge/
  -- router), not a person. If ethereum.creation_traces is unavailable in your
  -- Dune tier, delete this column + the LEFT JOIN and classify via Etherscan.
  (ct.address IS NOT NULL)                   AS is_contract
FROM agg a
LEFT JOIN ethereum.creation_traces ct ON ct.address = a.address
WHERE a.balance > 0
ORDER BY a.balance DESC
LIMIT 40
