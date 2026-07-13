// Build age-indexed price history for the memecoin peers (DOGE, PEPE, SHIB) from
// CryptoCompare's free daily history (full history, reachable from CI — the same
// source the memekings race uses). Writes public/alt-history.json:
//   { <coin>: { name, launch, points: [[ageDaysSinceLaunch, priceUSD], ...] } }
// thinned to ~every 3 days, matching the bundled BTC/ETH/SOL age series format.
// Feeds the memecoin "same age" + "what came next" cards. CryptoCompare is
// geo/allowlist-blocked from the dev sandbox, so this only runs in CI (dispatch/cron).
import { writeFile } from "node:fs/promises";

const COINS = [
  { key: "doge", sym: "DOGE", launch: "2013-12-06", name: "Dogecoin" },
  { key: "shib", sym: "SHIB", launch: "2020-08-01", name: "Shiba Inu" },
  { key: "pepe", sym: "PEPE", launch: "2023-04-14", name: "Pepe" },
];
const DAY = 86400000, THIN_DAYS = 3;

// CryptoCompare histoday caps at ~2000 points/call; page backward with toTs until
// we've covered the coin's launch (or run out of data).
async function fullHistory(sym, launchTs) {
  const out = new Map(); // time(sec) -> close
  let toTs = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 6; page++) {
    const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${sym} HTTP ${res.status}`);
    const json = await res.json();
    const list = json?.Data?.Data;
    if (!Array.isArray(list) || !list.length) break;
    let minTime = Infinity;
    for (const d of list) { if (d.close > 0) out.set(d.time, d.close); if (d.time) minTime = Math.min(minTime, d.time); }
    if (!Number.isFinite(minTime) || minTime * 1000 <= launchTs) break;
    toTs = minTime - 86400;
  }
  return out;
}

async function build() {
  const result = {};
  for (const c of COINS) {
    const launchTs = Date.parse(c.launch + "T00:00:00Z");
    try {
      const hist = await fullHistory(c.sym, launchTs);
      const rows = [...hist.entries()]
        .map(([t, p]) => [t * 1000, p])
        .filter(([ts]) => ts >= launchTs)
        .sort((a, b) => a[0] - b[0]);
      if (!rows.length) { console.warn(`${c.sym}: no rows after launch`); continue; }
      // thin to ~every THIN_DAYS days, keeping the final point
      const pts = []; let lastTs = -Infinity;
      for (const [ts, p] of rows) {
        if (ts - lastTs >= THIN_DAYS * DAY - 43200000) { pts.push([Math.round((ts - launchTs) / DAY), p]); lastTs = ts; }
      }
      const last = rows.at(-1);
      if (last[0] - lastTs > 0) pts.push([Math.round((last[0] - launchTs) / DAY), last[1]]);
      result[c.key] = { name: c.name, launch: c.launch, points: pts };
      console.log(`${c.sym}: ${pts.length} pts (${pts[0][0]}d → ${pts.at(-1)[0]}d, first $${pts[0][1]}, last $${pts.at(-1)[1]})`);
    } catch (e) { console.warn(`${c.sym}:`, e.message); }
  }
  if (!Object.keys(result).length) throw new Error("no coins fetched");
  await writeFile("public/alt-history.json", JSON.stringify(result));
  console.log(`wrote public/alt-history.json (${Object.keys(result).join(", ")})`);
}

build().catch(e => { console.error(e); process.exit(1); });
