// AUTOMATED REFRESH: pull the SPX6900 on-chain valuation & distribution WEEKLY series
// from Dune via the API and write public/onchain.json (the Supply-in-Profit / concentration
// / gini / HODL-wave feed the site chart + bot card read, with src/spx-onchain.js as the
// bundled fallback).
//
// The Stage-2 historical query (dune/spx6900_onchain_history.sql, default query id 7991307)
// is SELF-SUFFICIENT — one execution returns the whole launch→now weekly series — so we just
// re-execute it and take the full result. Dune's free tier has no native scheduler, so CI
// triggers the execution here (execute → poll → results). Only executions cost credits;
// this query is ~50 credits, so a WEEKLY cron is a small slice of the 2,500/mo budget.
//
// Needs DUNE_API_KEY (repo secret + Vercel env). Runs in CI (Dune is blocked from the dev
// sandbox). Override the query with DUNE_ONCHAIN_QUERY_ID.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "public/onchain.json";
const BASE = "https://api.dune.com/api/v1";
const QUERY_ID = process.env.DUNE_ONCHAIN_QUERY_ID || "7991307";

const r2 = v => Math.round(parseFloat(v) * 100) / 100;
const r4 = v => Math.round(parseFloat(v) * 10000) / 10000;
const sig = (v, n = 5) => { const x = parseFloat(v); return !Number.isFinite(x) || x === 0 ? 0 : parseFloat(x.toPrecision(n)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Execute the query fresh, poll to completion, return its result rows.
async function runQuery() {
  const key = process.env.DUNE_API_KEY;
  if (!key) throw new Error("no DUNE_API_KEY — skipping");
  const H = { "X-Dune-API-Key": key };

  const ex = await fetch(`${BASE}/query/${QUERY_ID}/execute`, { method: "POST", headers: H });
  if (!ex.ok) throw new Error(`execute ${ex.status}: ${await ex.text()}`);
  const execution_id = (await ex.json())?.execution_id;
  if (!execution_id) throw new Error("no execution_id");

  let state = "";
  for (let i = 0; i < 90; i++) {              // up to ~7.5 min
    await sleep(5000);
    const st = await fetch(`${BASE}/execution/${execution_id}/status`, { headers: H });
    if (!st.ok) throw new Error(`status ${st.status}`);
    state = (await st.json())?.state;
    if (state === "QUERY_STATE_COMPLETED") break;
    if (state === "QUERY_STATE_FAILED" || state === "QUERY_STATE_CANCELLED") throw new Error(`execution ${state}`);
  }
  if (state !== "QUERY_STATE_COMPLETED") throw new Error(`timed out (last state ${state})`);

  const res = await fetch(`${BASE}/execution/${execution_id}/results`, { headers: H });
  if (!res.ok) throw new Error(`results ${res.status}`);
  return (await res.json())?.result?.rows || [];
}

// Map Dune's column-keyed rows to the compact bundle shape (mirrors src/spx-onchain.js).
export function toBundle(rows) {
  return (rows || [])
    .filter(r => r && r.d != null && r.supply_in_profit_pct != null)
    .map(r => ({
      d: String(r.d).slice(0, 10),
      sip: r2(r.supply_in_profit_pct),
      top10: r2(r.top10_share_pct), top100: r2(r.top100_share_pct),
      gini: r4(r.gini),
      age: [r2(r.age_lt1m_pct), r2(r.age_1_3m_pct), r2(r.age_3_6m_pct), r2(r.age_6_12m_pct), r2(r.age_gt12m_pct)],
      holders: Math.round(parseFloat(r.holder_count_eth)),
      rp: sig(r.realized_price), mvrv: r4(r.mvrv), spot: sig(r.spot_price),
    }))
    .filter(o => o.d && Number.isFinite(o.sip))
    .sort((a, b) => a.d.localeCompare(b.d));
}

async function main() {
  const rows = await runQuery();
  const series = toBundle(rows);
  if (series.length < 50) throw new Error(`only ${series.length} rows — refusing to overwrite`);

  const next = JSON.stringify(series);
  let prev = null;
  try { prev = await readFile(OUT, "utf8"); } catch { /* first run */ }
  if (prev === next) { console.log(`No change (${series.length} weeks).`); return; }

  await writeFile(OUT, next);
  console.log(`Wrote ${OUT}: ${series.length} weeks · ${series[0].d} → ${series.at(-1).d} · latest sip ${series.at(-1).sip}%`);
}

// Only run when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-onchain failed:", e.message); process.exit(1); });
}
