// Generates dune/aeon_spx_balances.sql — the SPX6900 balance query filtered to the
// CURRENT AEON holders (ALL of them, embedded as a VALUES list) so the combined
// AEON+SPX skyline ranking is fair: a low-NFT / high-SPX wallet can still earn a tall
// tower. Result is one row per holder-that-also-holds-SPX; the scan is the tightest
// possible. Reads the transfer log to get every current owner (aeon-onchain.json only
// carries the top 120). Regenerate whenever holders change:
//   node scripts/gen-aeon-spx-query.mjs --transfers=dune/out/aeon_transfers.csv
import { readFileSync, writeFileSync } from "node:fs";

const SPX = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const ZERO = "0x" + "0".repeat(40), DEAD = "0x000000000000000000000000000000000000dead";
const transfers = process.argv.find(s => s.startsWith("--transfers="))?.slice(12) || "dune/out/aeon_transfers.csv";
const out = process.argv.find(s => s.startsWith("--out="))?.slice(6) || "dune/aeon_spx_balances.sql";

// Every current owner = last `to` per token (excluding burns) from the transfer log.
const lines = readFileSync(transfers, "utf8").split(/\r?\n/).filter(Boolean);
const head = lines[0].split(",").map(h => h.trim().toLowerCase());
const iTo = head.indexOf("to_address"), iId = head.indexOf("token_id"), iT = head.indexOf("time");
const owner = new Map();  // token_id -> {to, t}
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(","); const t = Date.parse(c[iT].replace(" UTC", "Z").replace(" ", "T"));
  const p = owner.get(c[iId]); if (!p || t >= p.t) owner.set(c[iId], { to: c[iTo].toLowerCase(), t });
}
const addrs = [...new Set([...owner.values()].map(o => o.to))].filter(a => a !== ZERO && a !== DEAD && /^0x[0-9a-f]{40}$/.test(a));
if (!addrs.length) { console.error("no holder addresses parsed from", transfers); process.exit(1); }
const values = addrs.map(a => `  (${a})`).join(",\n");

const sql = `-- ============================================================================
-- SPX6900 balance for the AEON holders  →  cross-holder axis for the Holder Skyline
-- ============================================================================
-- Pulls SPX6900 balances for ALL ${addrs.length} current AEON holders (embedded below) so the
-- combined AEON+SPX skyline ranking is fair — a low-NFT / high-SPX wallet can still rank.
-- Only wallets that also hold SPX come back (a tiny result); build-aeon-onchain.mjs
-- --spx=this.csv joins it so tower height combines AEON held + SPX held (× holding duration).
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
