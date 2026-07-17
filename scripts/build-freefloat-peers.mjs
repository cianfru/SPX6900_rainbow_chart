// FOUNDATION builder: bank BTC + ETH FREE FLOAT (liquid supply %) so the Free Float chart
// can compare SPX6900 against them on the SAME, consistent definition — instead of us
// reconstructing BTC/ETH ourselves (which would be error-prone) or copying an influencer's
// black-box composite. Free float = supply that MOVED in the last ~6 months ÷ current
// supply — for BTC/ETH straight from the free/open Coin Metrics community API.
//
//   free float = SplyActive180d / SplyCur   (supply active in the trailing 180d ÷ current)
//
// Same concept as our SPX free float (share of supply younger than 6 months, from the
// on-chain HODL age bands) — so the 3-asset comparison is methodologically consistent AND
// fully citeable, which is exactly what the viral version isn't.
//
// Source: Coin Metrics COMMUNITY API (free, no key) — same one we use for BTC MVRV. Blocked
// from the dev sandbox, reachable from CI. Active supply moves slowly → monthly is plenty.
// Output: public/freefloat-peers.json = { btc: [[daysSinceInception, ff%], …], eth: [...], updated }
//
// Coin Metrics ID for "supply active in the trailing 180d" is `SplyAct180d` (first run
// confirmed `SplyActive180d` is rejected). We try candidates in order so a spelling change
// resolves in one re-run; the first that returns data wins.
import { writeFile } from "node:fs/promises";

const OUT = "public/freefloat-peers.json";
// `SplyAct180d` (active supply, trailing 180d) is the RIGHT metric ID but it's GATED — the
// free anonymous community tier 403s it (only MVRV etc. are free there). It needs a Coin
// Metrics API key with active-supply access (set COINMETRICS_KEY). With a key we hit the
// authenticated endpoint; without one this run fails cleanly and the chart stays SPX-only.
const KEY = process.env.COINMETRICS_KEY || "";
const CM = (KEY ? "https://api.coinmetrics.io" : "https://community-api.coinmetrics.io") + "/v4/timeseries/asset-metrics";
const ACTIVE_CANDIDATES = ["SplyAct180d", "SplyActive180d"], CUR = "SplyCur";
const SAMPLE_DAYS = 7;
const DAY = 86400000;
const GENESIS = { btc: "2009-01-03", eth: "2015-07-30" }; // day 0 = inception, like SPX

async function fetchAsset(asset) {
  let lastErr = "";
  for (const active of ACTIVE_CANDIDATES) {
    const rows = [];
    let url = `${CM}?assets=${asset}&metrics=${active},${CUR}&frequency=1d&page_size=10000&start_time=${GENESIS[asset]}${KEY ? `&api_key=${KEY}` : ""}`;
    let bad = false;
    for (let page = 0; page < 30 && url; page++) {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 400 || r.status === 403) { lastErr = `${active} → ${r.status}: ${t.slice(0, 130)}`; bad = true; break; } // bad name (400) or gated (403) → try next / give up
        throw new Error(`Coin Metrics ${asset} ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      for (const d of j?.data || []) {
        const act = parseFloat(d[active]), cur = parseFloat(d[CUR]);
        if (d.time && act > 0 && cur > 0) rows.push([d.time.slice(0, 10), act, cur]);
      }
      url = j?.next_page_url || null;
    }
    if (!bad && rows.length) { console.log(`${asset}: metric ${active}`); return rows; }
  }
  throw new Error(`no active-supply metric for ${asset} (${lastErr}). SplyAct180d is gated behind a paid/keyed Coin Metrics tier — set COINMETRICS_KEY with active-supply access to enable BTC/ETH.`);
}

// Pure core (unit-tested): rows [[date, active, cur]] → [[daysSinceInception, ff%]], deduped
// by day, sorted, sampled to ~every SAMPLE_DAYS (always keeping the latest). ff = 100·act/cur.
export function toFreeFloat(rows, genesis, sampleDays = SAMPLE_DAYS) {
  const g = new Date(genesis + "T00:00:00Z").getTime();
  const byDay = new Map();
  for (const [d, act, cur] of rows) if (d && act > 0 && cur > 0) byDay.set(d, (100 * act) / cur);
  const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!sorted.length) return [];
  const out = [];
  let lastTs = -Infinity;
  const stepMs = sampleDays * DAY;
  for (const [d, ff] of sorted) {
    const ts = new Date(d + "T00:00:00Z").getTime();
    if (ts - lastTs >= stepMs) { out.push([Math.round((ts - g) / DAY), Math.round(ff * 10) / 10]); lastTs = ts; }
  }
  const last = sorted.at(-1), lastTs2 = new Date(last[0] + "T00:00:00Z").getTime();
  const lastDay = Math.round((lastTs2 - g) / DAY);
  if (out.at(-1)?.[0] !== lastDay) out.push([lastDay, Math.round(last[1] * 10) / 10]);
  return out;
}

async function main() {
  const payload = { updated: new Date().toISOString().slice(0, 10) };
  for (const asset of ["btc", "eth"]) {
    const raw = await fetchAsset(asset);
    const points = toFreeFloat(raw, GENESIS[asset]);
    if (!points.length) throw new Error(`no ${asset} free-float points`);
    payload[asset] = points;
    console.log(`${asset}: ${raw.length} daily → ${points.length} pts · latest free float ${points.at(-1)[1]}% (day ${points.at(-1)[0]})`);
  }
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`Wrote ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
