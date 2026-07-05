// FOUNDATION banker: accumulate SPX6900 futures POSITIONING into public/longshort.json
// (append-only, grows daily). Binance's L/S endpoints geo-block CI (HTTP 451 to US
// runners), so we use venues reachable from GitHub Actions:
//   • BYBIT — global long/short ACCOUNT ratio (the ITC "Long/Short" metric); seeds ~30d.
//   • HYPERLIQUID — on-chain, unmanipulable: current FUNDING rate + OPEN INTEREST
//     (a related positioning signal, banked one point/day).
// Soft on each source, so a partial fetch still banks. The chart fills in as history
// accumulates. Runs in CI (the exchange APIs are blocked from the dev sandbox).
import { readFile, writeFile } from "node:fs/promises";

const OUT = "public/longshort.json";
const BYBIT_SYMS = process.env.BYBIT_LS_SYMBOL ? [process.env.BYBIT_LS_SYMBOL] : ["SPXUSDT", "1000SPXUSDT", "SPX6900USDT"];
const HL_COIN = process.env.HL_COIN || "SPX";

// Bybit global long/short ACCOUNT ratio (buyRatio ÷ sellRatio), last 30 daily points.
async function bybit() {
  for (const sym of BYBIT_SYMS) {
    try {
      const r = await fetch(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${sym}&period=1d&limit=30`, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status}`);
      const list = (await r.json())?.result?.list;
      if (!Array.isArray(list) || !list.length) throw new Error("empty");
      const rows = list.map(d => {
        const buy = parseFloat(d.buyRatio), sell = parseFloat(d.sellRatio);
        return { date: new Date(+d.timestamp).toISOString().slice(0, 10), bybitLS: sell > 0 ? buy / sell : null };
      }).filter(r => r.bybitLS != null);
      if (rows.length) { console.log(`  bybit: ${sym} · ${rows.length} days`); return rows; }
    } catch (e) { console.warn(`  bybit ${sym}: ${e.message}`); }
  }
  return [];
}

// Hyperliquid current funding rate + open interest (on-chain). One point for today.
async function hyperliquid() {
  try {
    const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) });
    if (!r.ok) throw new Error(`${r.status}`);
    const [meta, ctxs] = await r.json();
    let i = meta.universe.findIndex(u => u.name === HL_COIN);
    if (i < 0) i = meta.universe.findIndex(u => u.name.toUpperCase().includes("SPX"));
    if (i < 0) throw new Error("no SPX-like coin listed");
    const name = meta.universe[i].name, c = ctxs[i];
    const funding = parseFloat(c.funding), oi = parseFloat(c.openInterest);
    console.log(`  hyperliquid: ${name} · funding ${funding} · OI ${oi}`);
    return { date: new Date().toISOString().slice(0, 10), hlFunding: funding, hlOI: oi };
  } catch (e) { console.warn(`  hyperliquid: ${e.message}`); return null; }
}

async function main() {
  console.log("Banking SPX6900 futures positioning (Bybit L/S + Hyperliquid funding/OI)…");
  const [by, hl] = await Promise.all([bybit(), hyperliquid()]);
  if (!by.length && !hl) throw new Error("no positioning data from Bybit or Hyperliquid — check the Bybit symbol / Hyperliquid coin");

  let prev = [];
  try { const p = JSON.parse(await readFile(OUT, "utf8")); if (Array.isArray(p)) prev = p; } catch { /* first run */ }
  const byDate = new Map(prev.map(r => [r.date, r]));
  for (const r of by) byDate.set(r.date, { ...byDate.get(r.date), ...r });
  if (hl) byDate.set(hl.date, { ...byDate.get(hl.date), ...hl });
  const merged = [...byDate.values()].filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const next = JSON.stringify(merged);
  let old = null; try { old = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (old === next) { console.log(`No change (${merged.length} days banked).`); return; }
  await writeFile(OUT, next);
  console.log(`Wrote ${OUT}: ${merged.length} days · ${merged[0].date} → ${merged.at(-1).date}`);
}

main().catch(e => { console.error("build-longshort failed:", e.message); process.exit(1); });
