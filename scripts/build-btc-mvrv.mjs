// FOUNDATION builder: bank Bitcoin's full MVRV history into public/btc-mvrv.json so
// the SPX6900 MVRV page can overlay SPX's (very short) MVRV on BTC's ~decade of MVRV
// context — "are we down/heated similarly to some BTC moment?". MVRV is UNITLESS
// (market-cap ÷ realized-cap), so it's directly comparable across assets — that's what
// makes the overlay honest even though the two histories are wildly different lengths.
//
// Source: Coin Metrics COMMUNITY API (free, no key) — metric CapMVRVCur (current-supply
// MVRV). Runs in CI (the API is blocked from the dev sandbox, like the other builders).
// BTC's MVRV history is essentially static + append-only, so a monthly run keeps it
// fresh; the day-to-day movement that matters is SPX's own MVRV, which comes from the
// daily on-chain snapshots (history.json), not this file.
//
// Output: public/btc-mvrv.json = { asset, metric, sampledDays, updated, points: [["YYYY-MM-DD", mvrv], …] }
// sampled to ~weekly to keep the runtime fetch light (~decade → ~800 points).
import { writeFile } from "node:fs/promises";
import { mergeReconstruction } from "./build-btc-realized-cap.mjs";

const OUT = "public/btc-mvrv.json";
const CM = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const METRIC = "CapMVRVCur";
const SAMPLE_DAYS = 7; // keep ~one point per week

// The pre-2011 months Coin Metrics can't reach, from our BigQuery UTXO realized-cap reconstruction
// (bigquery/btc_realized_cap.sql). 2010 is immutable BTC history, so these are fixed — bundled here and
// prepended each run (seam-rebased to CM's first point) so the full-history extension to BTC age ~1.5y
// survives the monthly Coin Metrics rebuild. Coin Metrics stays the trusted series for 2011 → now.
const EARLY_RECON = [
  { date: "2010-07-01", mvrv: 4.7361 },
  { date: "2010-08-01", mvrv: 3.2493 },
  { date: "2010-09-01", mvrv: 2.6842 },
  { date: "2010-10-01", mvrv: 3.4671 },
  { date: "2010-11-01", mvrv: 2.9219 },
  { date: "2010-12-01", mvrv: 2.975 },
];

// Pull the full daily series, following Coin Metrics' cursor pagination.
async function fetchAll() {
  const rows = [];
  let url = `${CM}?assets=btc&metrics=${METRIC}&frequency=1d&page_size=10000&start_time=2011-01-01`;
  for (let page = 0; page < 30 && url; page++) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Coin Metrics ${r.status}`);
    const j = await r.json();
    for (const d of j?.data || []) {
      const v = parseFloat(d[METRIC]);
      if (d.time && Number.isFinite(v) && v > 0) rows.push([d.time.slice(0, 10), v]);
    }
    url = j?.next_page_url || null;
  }
  return rows;
}

// Pure core (unit-tested): dedupe by day, sort, sample to ~every SAMPLE_DAYS, always
// keeping the most recent point. Rounds MVRV to 3 dp (plenty for a context chart).
export function sampleMvrv(rows, sampleDays = SAMPLE_DAYS) {
  const byDay = new Map();
  for (const [d, v] of rows) if (d && Number.isFinite(v) && v > 0) byDay.set(d, v); // last write wins
  const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!sorted.length) return [];
  const out = [];
  let lastTs = -Infinity;
  const stepMs = sampleDays * 86400000;
  for (const [d, v] of sorted) {
    const ts = new Date(d + "T00:00:00Z").getTime();
    if (ts - lastTs >= stepMs) { out.push([d, Math.round(v * 1000) / 1000]); lastTs = ts; }
  }
  const last = sorted.at(-1);
  if (out.at(-1)?.[0] !== last[0]) out.push([last[0], Math.round(last[1] * 1000) / 1000]);
  return out;
}

async function main() {
  const raw = await fetchAll();
  const points = sampleMvrv(raw);
  if (!points.length) throw new Error("no BTC MVRV points fetched");
  // Prepend the bundled pre-2011 reconstruction (seam-rebased to CM's first point) for full history.
  const { points: merged, added, seamRatio } = mergeReconstruction(EARLY_RECON, points, "merge");
  const payload = {
    asset: "btc", metric: METRIC, sampledDays: SAMPLE_DAYS,
    source: "coinmetrics+utxo-early",
    updated: merged.at(-1)[0], points: merged,
  };
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`btc-mvrv: ${raw.length} daily → ${points.length} weekly + ${added} early (seam ×${seamRatio}) = ${merged.length} · ${merged[0][0]} → ${merged.at(-1)[0]} · latest MVRV ${merged.at(-1)[1]}×`);
}

// Only run when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
