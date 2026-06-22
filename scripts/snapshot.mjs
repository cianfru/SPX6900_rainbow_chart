// Daily snapshot of SPX6900 on-chain conviction data → public/history.json.
// Run by .github/workflows/snapshot.yml. Append-only, one record per day.
import { readFile, writeFile } from "node:fs/promises";

const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const HS = `https://api.holderscan.com/v0/eth/tokens/${CONTRACT}`;
const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const KEY = process.env.HOLDERSCAN_KEY;
const FILE = "public/history.json";

async function hs(path) {
  const r = await fetch(`${HS}${path}`, { headers: { "x-api-key": KEY, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Holderscan ${path} → ${r.status}`);
  return r.json();
}
async function softHs(path) {
  try { return await hs(path); } catch (e) { console.warn(e.message); return null; }
}

async function price() {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}`, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.data?.attributes?.base_token_price_usd); if (p > 0) return p; }
  } catch (e) { console.warn("gecko:", e.message); }
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/SPX-USD/ticker", { headers: { Accept: "application/json", "User-Agent": "spx6900-rainbow" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j.price); if (p > 0) return p; }
  } catch (e) { console.warn("coinbase:", e.message); }
  return null;
}

// Crypto Fear & Greed Index (alternative.me, free/no-key). Reachable from CI even
// though it's blocked in some sandboxes. limit=1 = today's value (0..100).
async function fng() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const v = parseInt(j?.data?.[0]?.value, 10);
    return Number.isFinite(v) ? v : null;
  } catch (e) { console.warn("fng:", e.message); return null; }
}

async function main() {
  if (!KEY) throw new Error("Missing HOLDERSCAN_KEY env (set it as a repo secret)");

  const sup = await hs("/stats/supply-breakdown"); // required
  const [p, stats, pnl, breakdowns, fearGreed] = await Promise.all([
    price(), softHs("/stats"), softHs("/stats/pnl"), softHs("/holders/breakdowns"), fng(),
  ]);

  const rec = {
    d: new Date().toISOString().slice(0, 10),
    p,
    holders: breakdowns?.total_holders ?? null,
    be: pnl?.break_even_price ?? null,
    gini: stats?.gini ?? null,
    fng: fearGreed,
    sup,
  };

  let arr = [];
  try { const txt = await readFile(FILE, "utf8"); const parsed = JSON.parse(txt); if (Array.isArray(parsed)) arr = parsed; } catch { /* first run */ }
  arr = arr.filter(x => x.d !== rec.d); // one record per day (replace today's if rerun)
  arr.push(rec);
  arr.sort((a, b) => a.d.localeCompare(b.d));

  await writeFile(FILE, JSON.stringify(arr));
  console.log(`snapshot ${rec.d} · price ${p} · holders ${rec.holders} · ${arr.length} records total`);
}

main().catch(e => { console.error(e); process.exit(1); });
