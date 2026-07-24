// ============================================================================
// PROJECT AEON — daily NFT banker (Alchemy NFT API v3)
// ============================================================================
// Banks the collection's floor / owners / supply once a day into a forward daily
// series, mirroring the coin's snapshot cron.
//
// NOTE: this replaced Reservoir, whose NFT API was SUNSET on 2025-10-15 (its host
// api.reservoir.tools no longer resolves → "fetch failed"). Alchemy's NFT API is the
// free replacement. Three cheap GETs:
//   getFloorPrice        → floor (ETH, OpenSea)
//   getContractMetadata  → name · symbol · totalSupply (~3,333) · image
//   getOwnersForContract → distinct owner count (paginated)
// Alchemy does NOT expose rolling trade VOLUME cleanly, so volume is intentionally
// omitted here — it can come off the transfers CSV (Dune/BigQuery) later.
//
//   node scripts/build-aeon.mjs
//
// Requires ALCHEMY_KEY (a free alchemy.com app key). NO key → soft-skip (exit 0, no
// write) so CI / local runs never crash while it's being wired.
//
// Writes:
//   public/aeon.json          — latest snapshot { updated, name, floor, owners, … }
//   public/aeon-history.json  — append-only daily series [{ d, floor, owners, … }]
//
// Claude CANNOT reach Alchemy from the sandbox (network policy) — this runs in CI
// (.github/workflows/aeon.yml). VALIDATE the first run's log line (floor ≈ OpenSea,
// supply ≈ 3,333, owners plausible) before building any cards on top of it.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const CONTRACT = (process.env.AEON_CONTRACT || "0xc374a204334d4Edd4C6a62f0867C752d65E9579c").toLowerCase();
const KEY = (process.env.ALCHEMY_KEY || "").trim();
const NET = process.env.ALCHEMY_NETWORK || "eth-mainnet";
const BASE = `https://${NET}.g.alchemy.com/nft/v3/${KEY}`;
const HIST = "public/aeon-history.json";
const SNAP = "public/aeon.json";

const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const writeJson = (p, obj) => writeFileSync(p, JSON.stringify(obj) + "\n");
const today = () => new Date().toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// One resilient GET → parsed JSON. Retries transient failures with backoff; surfaces
// the underlying cause (undici hides the real reason behind a bare "fetch failed").
async function getJson(path) {
  const url = `${BASE}/${path}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 2000 * 2 ** (attempt - 1))); // 2s,4s,8s
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — check ALCHEMY_KEY`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const cause = e?.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : "";
      console.error(`aeon: ${path.split("?")[0]} attempt ${attempt + 1} — ${e.message}${cause}`);
    }
  }
  throw lastErr;
}

async function ownerCount() {
  let count = 0, pageKey, pages = 0;
  do {
    const q = `getOwnersForContract?contractAddress=${CONTRACT}&withTokenBalances=false${pageKey ? `&pageKey=${pageKey}` : ""}`;
    const j = await getJson(q);
    count += (j.owners || []).length;
    pageKey = j.pageKey;
  } while (pageKey && ++pages < 20);
  return count;
}

async function main() {
  if (!KEY) { console.log("aeon: no ALCHEMY_KEY — soft-skipping (no write)"); return; }

  const [floorJ, metaJ, owners] = await Promise.all([
    getJson(`getFloorPrice?contractAddress=${CONTRACT}`),
    getJson(`getContractMetadata?contractAddress=${CONTRACT}`),
    ownerCount(),
  ]);

  const os = metaJ.openSeaMetadata || {};
  const floor = num(floorJ.openSea?.floorPrice) ?? num(os.floorPrice);
  const row = {
    d: today(),
    floor,                                   // floor price in ETH (OpenSea via Alchemy)
    owners,                                  // distinct owner wallets
    tokens: num(metaJ.totalSupply),          // circulating supply (should be ~3,333)
  };

  const hist = readJson(HIST, []);
  const i = hist.findIndex(r => r.d === row.d);
  if (i >= 0) hist[i] = row; else hist.push(row);
  hist.sort((a, b) => a.d.localeCompare(b.d));
  writeJson(HIST, hist);

  writeJson(SNAP, {
    updated: today(),
    contract: CONTRACT,
    name: metaJ.name || os.collectionName || "Project AEON",
    symbol: metaJ.symbol || null,
    image: os.imageUrl || null,
    floorCurrency: floorJ.openSea?.priceCurrency || "ETH",
    ...row,
  });

  console.log(
    `aeon: ${row.d} · floor ${row.floor ?? "—"} ETH · owners ${row.owners ?? "—"} · ` +
    `supply ${row.tokens ?? "—"} · history ${hist.length} day(s)`
  );
}

main().catch(e => {
  const cause = e?.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : "";
  console.error("aeon: failed —", e.message + cause);
  process.exitCode = 1;
});
