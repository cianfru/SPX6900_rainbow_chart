// Build age-indexed DAILY price history for the peer coins — the MAJORS (BTC/ETH/SOL,
// the same-age / what-came-next comparison peers) and the memecoins (DOGE/PEPE/SHIB) —
// from CryptoCompare's full daily history (reachable from CI; the memekings source).
// Writes public/alt-history.json:  { <coin>: { name, launch, points: [[ageDaysSinceLaunch, priceUSD], …] } }
// DAILY (no thinning) — the bundled src series were thinned to ~3-day, which ERASED sharp
// tops (e.g. SOL's real $295 Jan-18-2025 ATH sampled down to ~$220), so every peak/ATH read
// was wrong. Daily fixes that. CryptoCompare is allowlist-blocked from the dev sandbox → CI only.
import { writeFile } from "node:fs/promises";

const COINS = [
  { key: "btc", sym: "BTC", launch: "2010-07-17", name: "Bitcoin" },
  { key: "eth", sym: "ETH", launch: "2015-08-07", name: "Ethereum" },
  { key: "sol", sym: "SOL", launch: "2020-04-11", name: "Solana" },
  { key: "doge", sym: "DOGE", launch: "2013-12-06", name: "Dogecoin" },
  { key: "shib", sym: "SHIB", launch: "2020-08-01", name: "Shiba Inu" },
  { key: "pepe", sym: "PEPE", launch: "2023-04-14", name: "Pepe" },
];
const DAY = 86400000, THIN_DAYS = 1; // DAILY — no thinning, so peaks/ATHs are exact

// CryptoCompare now requires a (free) API key for histoday — keyless calls 401.
const CC_KEY = process.env.CRYPTOCOMPARE_KEY || process.env.CC_KEY || "";
const CC_HEADERS = { Accept: "application/json", ...(CC_KEY ? { authorization: `Apikey ${CC_KEY}` } : {}) };

// CryptoCompare histoday caps at ~2000 points/call; page backward with toTs until
// we've covered the coin's launch (or run out of data).
async function fullHistory(sym, launchTs) {
  const out = new Map(); // time(sec) -> close
  let toTs = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 6; page++) {
    const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}`;
    const res = await fetch(url, { headers: CC_HEADERS });
    if (!res.ok) throw new Error(`${sym} HTTP ${res.status}${res.status === 401 ? " (set CRYPTOCOMPARE_KEY)" : ""}`);
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
  if (!CC_KEY) console.warn("⚠ No CRYPTOCOMPARE_KEY set — CryptoCompare will 401. Add a free key as a repo secret.\n");
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
