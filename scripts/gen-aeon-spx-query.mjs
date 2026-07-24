// Generates dune/aeon_spx_balances.sql — the SPX6900 balance query filtered to the
// current AEON skyline holders (embedded as a VALUES list), so the result is tiny
// (~one row per holder) and the scan is the tightest possible. Regenerate whenever the
// holder set changes:  node scripts/gen-aeon-spx-query.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SPX = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const src = process.argv.find(s => s.startsWith("--onchain="))?.slice(11) || "public/aeon-onchain.json";
const out = process.argv.find(s => s.startsWith("--out="))?.slice(6) || "dune/aeon_spx_balances.sql";

const d = JSON.parse(readFileSync(src, "utf8"));
const addrs = (d.holders || []).map(h => h.a.toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a));
if (!addrs.length) { console.error("no holder addresses in", src); process.exit(1); }
const values = addrs.map(a => `  (${a})`).join(",\n");

const sql = `-- ============================================================================
-- SPX6900 balance for the AEON holders  →  cross-holder axis for the Holder Skyline
-- ============================================================================
-- We only track AEON NFT holders, so this pulls SPX6900 balances ONLY for the ${addrs.length}
-- wallets in the skyline (embedded below) — a tiny result (~${addrs.length} rows) and the tightest
-- possible scan. build-aeon-onchain.mjs --spx=this.csv joins it so tower height can combine
-- AEON held + SPX held (× holding duration).
--
-- CHEAP: filters the SPX contract's evt_Transfer partition to just these addresses and
-- GROUPs net flow (received - sent) -> current balance. Plain filter + UNION + GROUP BY, no
-- joins/windows, no balances_daily (that table timed out - every token x address x day).
-- SPX6900 ERC-20: ${SPX} - decimals 8. Output columns: address, spx (human units).
-- Regenerate if the holder set changes: node scripts/gen-aeon-spx-query.mjs
-- ============================================================================
WITH aeon (address) AS (
  VALUES
${values}
),
flows AS (
  SELECT "to"   AS address,  CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = ${SPX}
    AND "to"   IN (SELECT address FROM aeon)
  UNION ALL
  SELECT "from" AS address, -CAST(value AS DOUBLE) AS v
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = ${SPX}
    AND "from" IN (SELECT address FROM aeon)
)
SELECT address, SUM(v) / 1e8 AS spx
FROM flows
GROUP BY address
HAVING SUM(v) > 100000000     -- >= 1 SPX (8 decimals); drops dust
ORDER BY spx DESC;
`;
writeFileSync(out, sql);
console.log(`wrote ${out} with ${addrs.length} embedded addresses`);
