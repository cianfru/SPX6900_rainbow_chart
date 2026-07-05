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
const BYBIT_SYM = process.env.BYBIT_LS_SYMBOL || "SPXUSDT"; // confirmed by owner
// api.bybit.com geo-blocks US CI (403); api.bytick.com is Bybit's mirror, usually not.
const BYBIT_HOSTS = ["https://api.bytick.com", "https://api.bybit.com"];
const HL_COIN = process.env.HL_COIN || "SPX";

// Bybit global long/short ACCOUNT ratio (buyRatio ÷ sellRatio), last 30 daily points.
async function bybit() {
  for (const host of BYBIT_HOSTS) {
    try {
      const r = await fetch(`${host}/v5/market/account-ratio?category=linear&symbol=${BYBIT_SYM}&period=1d&limit=30`, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status}`);
      const list = (await r.json())?.result?.list;
      if (!Array.isArray(list) || !list.length) throw new Error("empty");
      const rows = list.map(d => {
        const buy = parseFloat(d.buyRatio), sell = parseFloat(d.sellRatio);
        return { date: new Date(+d.timestamp).toISOString().slice(0, 10), bybitLS: sell > 0 ? buy / sell : null };
      }).filter(r => r.bybitLS != null);
      if (rows.length) { console.log(`  bybit: ${host.replace("https://", "")} ${BYBIT_SYM} · ${rows.length} days`); return rows; }
    } catch (e) { console.warn(`  bybit ${host.replace("https://", "")}: ${e.message}`); }
  }
  return [];
}

const HL = "https://api.hyperliquid.xyz/info";
const hlPost = body => fetch(HL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Full hourly funding history for a coin, paged, aggregated to DAILY MEAN funding.
async function hlFundingDaily(coin) {
  const rows = [];
  let start = Date.parse("2024-01-01"), now = Date.now();
  for (let page = 0; page < 40 && start < now; page++) {
    const r = await hlPost({ type: "fundingHistory", coin, startTime: start });
    if (!r.ok) break;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const d of arr) rows.push({ time: d.time, rate: parseFloat(d.fundingRate) });
    const last = arr.at(-1).time;
    if (last <= start) break;
    start = last + 1;
    if (arr.length < 500) break; // caught up to now
  }
  const byDate = new Map();
  for (const d of rows) { const date = new Date(d.time).toISOString().slice(0, 10); const o = byDate.get(date) || { s: 0, n: 0 }; o.s += d.rate; o.n++; byDate.set(date, o); }
  return [...byDate].map(([date, o]) => ({ date, hlFunding: o.s / o.n }));
}

// Hyperliquid (on-chain): daily funding-rate HISTORY (backfilled) + today's open
// interest (only the current value is exposed, so OI accumulates day by day).
async function hyperliquid() {
  try {
    const r = await hlPost({ type: "metaAndAssetCtxs" });
    if (!r.ok) throw new Error(`ctx ${r.status}`);
    const [meta, ctxs] = await r.json();
    let i = meta.universe.findIndex(u => u.name === HL_COIN);
    if (i < 0) i = meta.universe.findIndex(u => u.name.toUpperCase().includes("SPX"));
    if (i < 0) throw new Error("no SPX-like coin listed");
    const name = meta.universe[i].name, oi = parseFloat(ctxs[i].openInterest);
    const funding = await hlFundingDaily(name);
    console.log(`  hyperliquid: ${name} · ${funding.length} days funding${funding.length ? ` (${funding[0].date} → ${funding.at(-1).date})` : ""} · OI ${oi}`);
    return { funding, oi: { date: new Date().toISOString().slice(0, 10), hlOI: oi } };
  } catch (e) { console.warn(`  hyperliquid: ${e.message}`); return null; }
}

async function main() {
  console.log("Banking SPX6900 futures positioning (Bybit L/S + Hyperliquid funding/OI)…");
  const [by, hl] = await Promise.all([bybit(), hyperliquid()]);
  if (!by.length && !hl) throw new Error("no positioning data from Bybit or Hyperliquid — check the Bybit symbol / Hyperliquid coin");

  let prev = [];
  try { const p = JSON.parse(await readFile(OUT, "utf8")); if (Array.isArray(p)) prev = p; } catch { /* first run */ }
  const byDate = new Map(prev.map(r => [r.date, r]));
  for (const r of by) byDate.set(r.date, { ...byDate.get(r.date), ...r });              // bybit L/S (if reachable)
  if (hl) {
    for (const f of hl.funding) byDate.set(f.date, { ...byDate.get(f.date), ...f });   // funding history (backfilled)
    byDate.set(hl.oi.date, { ...byDate.get(hl.oi.date), ...hl.oi });                   // today's OI
  }
  const merged = [...byDate.values()].filter(r => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const next = JSON.stringify(merged);
  let old = null; try { old = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (old === next) { console.log(`No change (${merged.length} days banked).`); return; }
  await writeFile(OUT, next);
  console.log(`Wrote ${OUT}: ${merged.length} days · ${merged[0].date} → ${merged.at(-1).date}`);
}

main().catch(e => { console.error("build-longshort failed:", e.message); process.exit(1); });
