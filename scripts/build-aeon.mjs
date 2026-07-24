// ============================================================================
// PROJECT AEON — daily NFT banker (Reservoir)
// ============================================================================
// Fetches the collection's floor / owners / supply / volume from Reservoir once
// a day and banks them into a forward daily series, mirroring the coin's snapshot
// cron. ONE cheap Reservoir call (collections/v7) gives floor + owners + tokenCount
// + on-sale + rolling volume — everything the first cards need.
//
//   node scripts/build-aeon.mjs
//
// Requires the RESERVOIR_KEY env (a free reservoir.tools key). NO key → soft-skip
// (exit 0, no write) so CI / local runs never crash while it's being wired.
//
// Writes:
//   public/aeon.json          — latest snapshot { updated, name, floor, owners, … }
//   public/aeon-history.json  — append-only daily series [{ d, floor, owners, … }]
//
// Claude CANNOT reach Reservoir from the sandbox (network policy) — this runs in CI
// (.github/workflows/aeon.yml). VALIDATE the first run's log line (floor ≈ OpenSea,
// owners plausible for a 3,333 supply) before building any cards on top of it.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const KEY = process.env.RESERVOIR_KEY || "";
const HIST = "public/aeon-history.json";
const SNAP = "public/aeon.json";

const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function fetchCollection() {
  const url = `https://api.reservoir.tools/collections/v7?contract=${CONTRACT}&includeSalesCount=true`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 2000 * 2 ** (attempt - 1))); // 2s,4s,8s
    try {
      const res = await fetch(url, { headers: { accept: "*/*", "x-api-key": KEY } });
      if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — check RESERVOIR_KEY`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const c = j?.collections?.[0];
      if (!c) throw new Error("no collection in response");
      return c;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function main() {
  if (!KEY) { console.log("aeon: no RESERVOIR_KEY — soft-skipping (no write)"); return; }

  const c = await fetchCollection();
  const amt = c.floorAsk?.price?.amount || {};
  const row = {
    d: today(),
    floor: num(amt.native),          // floor price in ETH
    floorUsd: num(amt.usd),          // floor price in USD (Reservoir-provided)
    owners: num(c.ownerCount),
    tokens: num(c.tokenCount),       // circulating supply (should be ~3333)
    onSale: num(c.onSaleCount),
    vol1d: num(c.volume?.["1day"]),
    vol7d: num(c.volume?.["7day"]),
    vol30d: num(c.volume?.["30day"]),
    volAll: num(c.volume?.allTime),
    sales1d: num(c.salesCount?.["1day"]),
  };

  // Upsert today's row into the forward daily series.
  const hist = readJson(HIST, []);
  const i = hist.findIndex(r => r.d === row.d);
  if (i >= 0) hist[i] = row; else hist.push(row);
  hist.sort((a, b) => a.d.localeCompare(b.d));
  writeJson(HIST, hist);

  // Latest snapshot (+ metadata) for cards / freshness tag.
  writeJson(SNAP, {
    updated: today(),
    contract: CONTRACT,
    name: c.name || "Project AEON",
    image: c.image || null,
    ...row,
  });

  console.log(
    `aeon: ${row.d} · floor ${row.floor ?? "—"} ETH ($${row.floorUsd ?? "—"}) · ` +
    `owners ${row.owners ?? "—"} · supply ${row.tokens ?? "—"} · onSale ${row.onSale ?? "—"} · ` +
    `vol 1d ${row.vol1d ?? "—"} / 30d ${row.vol30d ?? "—"} / all ${row.volAll ?? "—"} ETH · ` +
    `history ${hist.length} day(s)`
  );
}

function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj) + "\n"); }

main().catch(e => { console.error("aeon: failed —", e.message); process.exitCode = 1; });
