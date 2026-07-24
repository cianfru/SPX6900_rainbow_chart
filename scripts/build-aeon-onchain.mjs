// ============================================================================
// PROJECT AEON — on-chain reconstruction from the ERC-721 transfer log
// ============================================================================
// NFTs are CLEAN vs the coin: each tokenId has ONE owner + ONE last-transfer time,
// so holder-age / concentration / ownership need NO FIFO — just the transfer log.
//
//   node scripts/build-aeon-onchain.mjs --transfers=path/to/transfers.csv [--out=public/aeon-onchain.json]
//
// Input CSV columns: from_address,to_address,token_id,time  (Dune aeon_transfers.sql
// or bigquery/aeon_transfers.sql). Reconstructs, as-of every weekly Monday from the
// first mint to now:
//   • owners           — distinct current owners (tokens held > 0)
//   • held             — tokens in non-burn wallets
//   • age[5]           — HODL waves: share of held supply by time-since-last-transfer
//                        (0-1m, 1-3m, 3-6m, 6-12m, 1y+) — the maturation story
//   • top10 / top50    — concentration: top-N owners' share of held supply
// plus a CURRENT snapshot with the holders-by-count distribution (1 / 2-5 / 6-10 / 11+).
//
// Output: public/aeon-onchain.json — read by the Aeon cards + site charts.
// Refresh: re-run the Dune/BigQuery transfers query, re-run this. $0 compute.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const TRANSFERS = arg("transfers");
const OUT = arg("out") || "public/aeon-onchain.json";
const ZERO = "0x" + "0".repeat(40);
const DEAD = "0x000000000000000000000000000000000000dead";
const isBurn = a => a === ZERO || a === DEAD;

const DAY = 86400e3;
const AGE_EDGES = [30, 90, 180, 365].map(d => d * DAY); // → 5 bands: <1m,1-3m,3-6m,6-12m,1y+

// Parse "YYYY-MM-DD HH:MM:SS.mmm UTC" (or ISO) → epoch ms.
const parseTime = s => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };

function parseCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",").map(h => h.trim().toLowerCase());
  const iF = head.indexOf("from_address"), iT = head.indexOf("to_address"),
        iId = head.indexOf("token_id"), iTime = head.indexOf("time");
  if (Math.min(iF, iT, iId, iTime) < 0) throw new Error(`unexpected header: ${head.join(",")}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    rows.push({ from: c[iF].toLowerCase(), to: c[iT].toLowerCase(), id: c[iId], t: parseTime(c[iTime]) });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

// Monday grid (UTC) covering [first, now].
function mondayGrid(firstMs, lastMs) {
  const d = new Date(firstMs);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const out = [];
  for (; m <= lastMs + 6 * DAY; m += 7 * DAY) out.push(m);
  return out;
}

function bandOf(ageMs) { let b = 0; while (b < AGE_EDGES.length && ageMs >= AGE_EDGES[b]) b++; return b; }

function snapshot(ownerOf, lastMove, asOf) {
  const byOwner = new Map();      // owner → token count
  const age = [0, 0, 0, 0, 0];
  let held = 0;
  for (const id in ownerOf) {
    const o = ownerOf[id];
    if (isBurn(o)) continue;
    held++;
    byOwner.set(o, (byOwner.get(o) || 0) + 1);
    age[bandOf(asOf - lastMove[id])]++;
  }
  const counts = [...byOwner.values()].sort((a, b) => b - a);
  const owners = counts.length;
  const share = n => held ? +(counts.slice(0, n).reduce((s, v) => s + v, 0) / held * 100).toFixed(2) : 0;
  const ageShare = age.map(v => held ? +(v / held * 100).toFixed(2) : 0);
  return { owners, held, age: ageShare, top10: share(10), top50: share(50), counts, dist: distribution(counts) };
}

function distribution(counts) {
  const bins = { one: 0, small: 0, mid: 0, whale: 0 }; // 1 · 2-5 · 6-10 · 11+
  for (const c of counts) {
    if (c === 1) bins.one++; else if (c <= 5) bins.small++; else if (c <= 10) bins.mid++; else bins.whale++;
  }
  return bins;
}

function main() {
  if (!TRANSFERS) { console.error("usage: --transfers=transfers.csv [--out=public/aeon-onchain.json]"); process.exit(1); }
  const rows = parseCsv(TRANSFERS);
  const now = rows.at(-1).t;
  const grid = mondayGrid(rows[0].t, now);

  const ownerOf = Object.create(null), lastMove = Object.create(null);
  const bal = new Map();  // wallet → live token count (0-crossings = enter/exit the holder base)
  const series = [];
  let p = 0;
  for (const wk of grid) {
    // Behaviour flow: wallets crossing into (entered) / out of (exited) holding this week.
    // Mints (from 0x0) still count the recipient as a new holder; burns don't count as an exit target.
    let entered = 0, exited = 0;
    for (; p < rows.length && rows[p].t <= wk; p++) {
      const r = rows[p];
      ownerOf[r.id] = r.to; lastMove[r.id] = r.t;
      if (!isBurn(r.to)) { const b = bal.get(r.to) || 0; if (b === 0) entered++; bal.set(r.to, b + 1); }
      if (!isBurn(r.from) && r.from !== ZERO) { const b = (bal.get(r.from) || 0) - 1; bal.set(r.from, b); if (b <= 0) exited++; }
    }
    const s = snapshot(ownerOf, lastMove, wk);
    series.push({ d: new Date(wk).toISOString().slice(0, 10), owners: s.owners, held: s.held, age: s.age, top10: s.top10, top50: s.top50, dist: s.dist, entered, exited });
  }

  // Current state = replay everything, snapshot at `now`.
  for (; p < rows.length; p++) { ownerOf[rows[p].id] = rows[p].to; lastMove[rows[p].id] = rows[p].t; }
  const cur = snapshot(ownerOf, lastMove, now);
  const minted = new Set(rows.map(r => r.id)).size;
  const burned = minted - cur.held;

  // Per-wallet holdings for the holder skyline (3D): tokens held + how long the wallet
  // has held (age of its OLDEST still-held token = when it first became a holder).
  const wallet = new Map();  // owner → { n, oldest }
  for (const id in ownerOf) {
    const o = ownerOf[id]; if (isBurn(o)) continue;
    const w = wallet.get(o) || { n: 0, oldest: Infinity };
    w.n++; w.oldest = Math.min(w.oldest, lastMove[id]); wallet.set(o, w);
  }
  // Optional: join per-wallet SPX6900 coin balances (dune/aeon_spx_balances.sql →
  // --spx=balances.csv, columns address,spx) so the skyline can rank on AEON + SPX.
  const spxArg = arg("spx");
  const spxBal = new Map();
  if (spxArg) {
    const ls = readFileSync(spxArg, "utf8").split(/\r?\n/).filter(Boolean);
    const h = ls[0].split(",").map(s => s.trim().toLowerCase());
    const iA = h.indexOf("address"), iS = h.indexOf("spx");
    for (let i = 1; i < ls.length; i++) { const c = ls[i].split(","); const v = Number(c[iS]); if (c[iA] && v > 0) spxBal.set(c[iA].toLowerCase(), v); }
  }
  // Build ALL current holders, merge SPX, then rank. When SPX is present, rank by the
  // COMBINED conviction score (AEON + SPX rescaled to the same axis, × holding duration)
  // across every holder — so a low-NFT / high-SPX wallet can still make the skyline — and
  // only then take the top 120 for display. Without SPX, rank by AEON count (as before).
  const all = [...wallet.entries()].map(([a, w]) => {
    const r = { a, n: w.n, days: Math.round((now - w.oldest) / DAY), since: new Date(w.oldest).toISOString().slice(0, 10) };
    if (spxBal.has(a)) r.spx = Math.round(spxBal.get(a));
    return r;
  });
  const maxN = Math.max(...all.map(h => h.n), 1);
  const maxSpx = Math.max(...all.map(h => h.spx || 0), 0);
  const maxDays = Math.max(...all.map(h => h.days), 1);
  const combined = h => (h.n + (maxSpx > 0 ? (h.spx || 0) / maxSpx * maxN : 0)) * (0.45 + 0.55 * (h.days / maxDays));
  const holders = all
    .sort((x, y) => maxSpx > 0 ? combined(y) - combined(x) : (y.n - x.n || y.days - x.days))
    .slice(0, 120);
  if (spxArg) console.log(`  spx: joined coin balances for ${holders.filter(h => h.spx).length}/${holders.length} skyline wallets · biggest ${Math.max(...holders.map(h => h.spx || 0)).toLocaleString()} SPX`);

  const out = {
    updated: new Date(now).toISOString().slice(0, 10),
    contract: "0xc374a204334d4edd4c6a62f0867c752d65e9579c",
    supply: minted, held: cur.held, burned,
    current: {
      owners: cur.owners, age: cur.age, top10: cur.top10, top50: cur.top50,
      top1: cur.counts[0] || 0, distribution: distribution(cur.counts),
    },
    holders,
    series,
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");

  const d = out.current.distribution;
  console.log(
    `aeon-onchain: ${out.updated} · supply ${minted} · held ${cur.held} · burned ${burned} · owners ${cur.owners}\n` +
    `  age bands (%): 0-1m ${cur.age[0]} · 1-3m ${cur.age[1]} · 3-6m ${cur.age[2]} · 6-12m ${cur.age[3]} · 1y+ ${cur.age[4]}\n` +
    `  concentration: top-1 ${cur.counts[0]} tokens · top-10 ${cur.top10}% · top-50 ${cur.top50}%\n` +
    `  distribution: 1-token ${d.one} · 2-5 ${d.small} · 6-10 ${d.mid} · 11+ ${d.whale} owners\n` +
    `  series: ${series.length} weekly points ${series[0].d} → ${series.at(-1).d}`
  );
}

main();
