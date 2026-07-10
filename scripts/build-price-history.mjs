// Build a DENSE daily price history for the site's drawn charts, decoupled from
// the thinned model-fit bundle (src/data.js DEFAULT_RAW is deliberately ~weekly
// for the power-law fit). The site was drawing boxy early-history lines because
// the live /api/prices didn't re-serve dense 2024–2025 daily data; this fetches
// full daily history from every source, merges by date, and writes
// public/price-history.json, which the site loads as its dense drawing base.
//
// Runs in CI (GitHub Actions can reach these APIs, the sandbox can't). Historical
// closes don't change, so a weekly refresh keeps it current + fills recent days.
import { readFile, writeFile } from "node:fs/promises";

const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const OUT = "public/price-history.json";

// GeckoTerminal daily candles, PAGED backwards via before_timestamp so we get the
// full history (one page is 1000 candles; we page until the pool's first day).
async function gecko() {
  const out = [];
  let before = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 6; page++) {
    const url = `https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base&before_timestamp=${before}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`gecko ${res.status}`);
    const list = (await res.json())?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list) || !list.length) break;
    for (const [ts, , , , c] of list) out.push([ts, c]);
    const oldest = Math.min(...list.map(r => r[0]));
    if (oldest >= before) break;        // no progress → stop
    before = oldest - 1;
    if (list.length < 1000) break;      // reached the first candle
  }
  return out.map(([ts, c]) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: c }))
    .filter(p => p.price > 0);
}

// Bybit spot SPXUSDT — continuous CEX daily closes (fills any on-chain gaps).
async function bybit() {
  const res = await fetch("https://api.bybit.com/v5/market/kline?category=spot&symbol=SPXUSDT&interval=D&limit=1000", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`bybit ${res.status}`);
  const list = (await res.json())?.result?.list;
  if (!Array.isArray(list) || !list.length) throw new Error("bybit empty");
  return list.map(r => ({ date: new Date(parseInt(r[0], 10)).toISOString().slice(0, 10), price: parseFloat(r[4]) })).filter(p => p.price > 0);
}

// CoinGecko COIN API (aggregated across markets) daily closes. Distinct from
// GeckoTerminal (the DEX-pool product above): the free/demo tier caps market_chart
// history to the last 365 DAYS — which still reaches back ~a year and, crucially,
// covers the true intraday ATH region (Jul '25) the thinned DEX OHLCV misses. A paid
// PRO key (COINGECKO_PRO_KEY) auto-upgrades this to days=max = FULL daily history back
// to launch. id override: COINGECKO_ID (default spx6900); demo key: COINGECKO_KEY.
async function coingecko() {
  const id = process.env.COINGECKO_ID || "spx6900";
  const proKey = process.env.COINGECKO_PRO_KEY, demoKey = process.env.COINGECKO_KEY;
  const host = proKey ? "https://pro-api.coingecko.com" : "https://api.coingecko.com";
  const days = proKey ? "max" : "365"; // free tier is capped at 365; pro unlocks max
  const headers = { Accept: "application/json" };
  if (proKey) headers["x-cg-pro-api-key"] = proKey;
  else if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  const res = await fetch(`${host}/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`, { headers });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const prices = (await res.json())?.prices;
  if (!Array.isArray(prices) || !prices.length) throw new Error("coingecko empty");
  const byDay = new Map(); // one point per day; last write per date
  for (const [ms, p] of prices) if (p > 0) byDay.set(new Date(ms).toISOString().slice(0, 10), p);
  return [...byDay].map(([date, price]) => ({ date, price }));
}

// Uniswap subgraph (The Graph decentralized network). tokenDayDatas gives one
// priceUSD per day back to the token's FIRST trade (Aug '23) — so it densifies the
// ENTIRE launch era that CoinGecko's free 365-day window can't reach, at no cost, and
// on the same on-chain lineage as the bundle. Needs a free Graph Studio API key
// (GRAPH_API_KEY); soft-skips without one. The subgraph id defaults to Uniswap v2
// mainnet — override with GRAPH_SUBGRAPH_ID if SPX's pool is v3 (id
// 5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV) or the default is wrong. Token: GRAPH_TOKEN.
async function graph() {
  const key = process.env.GRAPH_API_KEY;
  if (!key) throw new Error("no GRAPH_API_KEY — skipping");
  const subgraph = process.env.GRAPH_SUBGRAPH_ID || "A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum"; // Uniswap v2 mainnet
  const token = (process.env.GRAPH_TOKEN || "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c").toLowerCase();
  const url = `https://gateway.thegraph.com/api/${key}/subgraphs/id/${subgraph}`;
  const out = [];
  let lastDate = 0;
  for (let page = 0; page < 10; page++) { // page by date cursor (The Graph caps `first` at 1000)
    const query = `{ tokenDayDatas(first: 1000, orderBy: date, orderDirection: asc, where: { token: "${token}", date_gt: ${lastDate} }) { date priceUSD } }`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query }) });
    if (!res.ok) throw new Error(`graph ${res.status}`);
    const j = await res.json();
    if (j.errors?.length) throw new Error(`graph: ${j.errors[0].message}`);
    const rows = j?.data?.tokenDayDatas;
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) { const p = parseFloat(r.priceUSD); if (p > 0) out.push({ date: new Date(r.date * 1000).toISOString().slice(0, 10), price: p }); }
    lastDate = rows[rows.length - 1].date;
    if (rows.length < 1000) break;
  }
  return out;
}

// Coinbase SPX-USD daily (listed Feb 2025) — paged 300 at a time.
async function coinbase() {
  const out = [];
  let end = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 4; page++) {
    const start = end - 300 * 86400;
    const res = await fetch(`https://api.exchange.coinbase.com/products/SPX-USD/candles?granularity=86400&start=${start}&end=${end}`, { headers: { Accept: "application/json", "User-Agent": "spx6900-rainbow" } });
    if (!res.ok) break;
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const [ts, , , , c] of arr) out.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: c });
    end = start;
  }
  return out.filter(p => p.price > 0);
}

async function soft(fn, name) {
  try { const r = await fn(); console.log(`  ${name}: ${r.length} pts${r.length ? ` (${r.reduce((m, p) => p.date < m ? p.date : m, "9")} → ${r.reduce((m, p) => p.date > m ? p.date : m, "0")})` : ""}`); return r; }
  catch (e) { console.warn(`  ${name}: ${e.message}`); return []; }
}

async function main() {
  console.log("Fetching daily price history from all sources…");
  const [g, b, c, cg, gr] = await Promise.all([
    soft(gecko, "geckoterminal"), soft(bybit, "bybit"), soft(coinbase, "coinbase"), soft(coingecko, "coingecko"), soft(graph, "uniswap-subgraph"),
  ]);

  // Merge by date (later set = higher priority). Priority, low→high:
  //   coingecko (aggregated) < CEX (coinbase, bybit) < uniswap-subgraph (on-chain, full
  //   launch-era history) < geckoterminal (our exact pool). On-chain sources win over CEX/
  //   aggregator; the subgraph backfills the entire launch era nothing else reaches, while
  //   GeckoTerminal stays authoritative for the recent months it covers.
  const byDate = new Map();
  for (const p of cg) byDate.set(p.date, p.price);
  for (const p of c) byDate.set(p.date, p.price);
  for (const p of b) byDate.set(p.date, p.price);
  for (const p of gr) byDate.set(p.date, p.price);
  for (const p of g) byDate.set(p.date, p.price);
  const merged = [...byDate].map(([date, price]) => ({ date, price })).filter(p => p.price > 0).sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length < 100) throw new Error(`only ${merged.length} merged points — refusing to overwrite`);

  // Don't churn the file (→ no needless deploy) if nothing changed.
  let prev = null;
  try { prev = await readFile(OUT, "utf8"); } catch { /* first run */ }
  const next = JSON.stringify(merged);
  if (prev === next) { console.log(`No change (${merged.length} pts).`); return; }

  await writeFile(OUT, next);
  const y = yr => merged.filter(p => p.date.startsWith(yr)).length;
  console.log(`Wrote ${OUT}: ${merged.length} daily pts · ${merged[0].date} → ${merged.at(-1).date} · 2024:${y("2024")} 2025:${y("2025")} 2026:${y("2026")}`);
}

main().catch(e => { console.error("build-price-history failed:", e.message); process.exit(1); });
