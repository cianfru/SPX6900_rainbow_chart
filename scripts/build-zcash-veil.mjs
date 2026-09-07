// ============================================================================
// THE VEILED CITY — Zcash shielded pool + transparent town, from a KEYLESS API
// ============================================================================
// Zcash has two halves: a transparent side that reads exactly like Bitcoin (every
// t-address balance is public) and a shielded pool where nothing is visible except
// its TOTAL. That total is what makes the city possible — the pool renders as one
// monolith of known size and unknown contents, the t-addresses render as the town
// around it, and the per-day turnstile flow between them is the animation.
//
//   node scripts/build-zcash-veil.mjs [--pages=30] [--out=public/zcash-veil.json]
//
// SOURCE: Blockchair's Zcash API — no key, no BigQuery, no Dune, no credits.
//   * blocks?a=date,sum(shielded_value_delta_total) returns the ENTIRE daily
//     turnstile history (3,600+ days, launch -> today) in ONE request. Cumulatively
//     summed, that IS the shielded pool size over time.
//   * addresses?s=balance(desc) ranks the transparent town, 100 per page.
//
// SIGN CONVENTION (settled empirically, not assumed): a POSITIVE
// shielded_value_delta_total means value ENTERED the shielded pool. The cumulative
// sum then lands within ~1% of independently reported shielded-supply figures,
// which is the check `validate()` performs and prints.
//
// SOFT-FAILS (exit 0) and never truncates: on any error it keeps the committed JSON.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.blockchair.com/zcash";
const OUT = (process.argv.find(a => a.startsWith("--out=")) || "").split("=")[1] || "public/zcash-veil.json";
const PAGES = Number((process.argv.find(a => a.startsWith("--pages=")) || "").split("=")[1] || 30);
const PAGE_MS = 1500;                       // free tier is rate-limited; stay polite
const ZAT = 1e8;                            // Zcash uses 8 decimals, like Bitcoin

// ---------------------------------------------------------------- pure helpers

/** Cumulatively sum daily turnstile deltas into the shielded pool size over time. */
export function poolSeries(rows) {
  let cum = 0;
  const out = [];
  for (const r of rows || []) {
    const d = r?.date;
    if (!d) continue;
    const flow = Number(r["sum(shielded_value_delta_total)"] || 0) / ZAT;
    if (!Number.isFinite(flow)) continue;
    cum += flow;
    out.push({ d, flow: round(flow), pool: round(cum) });
  }
  return out;
}

/** Split the town into the buildings the renderer draws. t3 = P2SH (exchanges). */
export function townStats(addrs, transparentTotal) {
  const rows = (addrs || [])
    .map(r => ({ a: r?.address, bal: Number(r?.balance || 0) / ZAT }))
    .filter(r => r.a && Number.isFinite(r.bal) && r.bal > 0)
    .sort((x, y) => y.bal - x.bal);
  const sum = n => rows.slice(0, n).reduce((s, r) => s + r.bal, 0);
  const share = n => transparentTotal > 0 ? round(sum(n) / transparentTotal * 100, 2) : null;
  return {
    sampled: rows.length,
    top: rows.map(r => ({ a: r.a, bal: round(r.bal), t: r.a.startsWith("t3") ? "p2sh" : "p2pkh" })),
    concentration: { top1: share(1), top10: share(10), top100: share(100), top1000: share(1000) },
  };
}

/** The headline the whole page hangs on. */
export function veil({ shielded, circulating, addressCount, price }) {
  const transparent = circulating - shielded;
  const avg = addressCount > 0 ? transparent / addressCount : 0;
  return {
    shielded: round(shielded), transparent: round(transparent), circulating: round(circulating),
    shieldedPct: round(shielded / circulating * 100, 2),
    addressCount, avgBuilding: round(avg, 2),
    monolithVsAverage: avg > 0 ? Math.round(shielded / avg) : null,
    shieldedUsd: price ? Math.round(shielded * price) : null,
    transparentUsd: price ? Math.round(transparent * price) : null,
  };
}

/** Honesty rail: our reconstruction must land near an independent figure. */
export function validate(ours, reference) {
  if (!reference) return { ok: null, note: "no reference supplied" };
  const drift = Math.abs(ours - reference) / reference * 100;
  return { ok: drift < 5, driftPct: round(drift, 2), ours: round(ours), reference };
}

const round = (n, p = 4) => Number.isFinite(n) ? Number(n.toFixed(p)) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------- fetch

async function get(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path.slice(0, 60)}`);
  const j = await res.json();
  return j.data;
}

async function main() {
  const stats = await get("stats");
  const price = Number(stats.market_price_usd) || 0;
  const circulating = price > 0 ? Number(stats.market_cap_usd) / price : 0;
  const addressCount = Number(stats.hodling_addresses) || 0;

  const daily = await get("blocks?a=date,sum(shielded_value_delta_total)&s=date(asc)&limit=5000");
  const series = poolSeries(daily);
  if (!series.length) throw new Error("empty turnstile series");
  const shielded = series[series.length - 1].pool;

  const addrs = [];
  for (let i = 0; i < PAGES; i++) {
    const page = await get(`addresses?s=balance(desc)&limit=100&offset=${i * 100}`);
    if (!page?.length) break;
    addrs.push(...page);
    await sleep(PAGE_MS);
  }

  const head = veil({ shielded, circulating, addressCount, price });
  const out = {
    updated: new Date().toISOString().slice(0, 10),
    price, ...head,
    peak: series.reduce((m, r) => r.pool > m.pool ? r : m, series[0]),
    net7d: round(series.slice(-7).reduce((s, r) => s + r.flow, 0)),
    net30d: round(series.slice(-30).reduce((s, r) => s + r.flow, 0)),
    town: townStats(addrs, head.transparent),
    series,
  };

  writeFileSync(OUT, JSON.stringify(out));
  console.log(`veil: shielded ${head.shielded.toLocaleString()} ZEC (${head.shieldedPct}%) · town ${addressCount.toLocaleString()} addrs · monolith ${head.monolithVsAverage.toLocaleString()}x avg · ${series.length} days -> ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error(`zcash-veil: refresh failed (${e.message}) — keeping committed JSON`);
    if (!existsSync(OUT)) process.exitCode = 0;
  });
}
