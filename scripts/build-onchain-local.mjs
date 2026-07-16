// LOCAL FIFO on-chain reconstruction — the heavy per-wallet lot math runs HERE in Node,
// NOT on Dune. Dune does only the cheap part (dump raw transfers + a tiny daily price
// series); this replays them into the full on-chain suite for $0 / zero credits.
//
// Inputs (CSV, exported from a CHEAP Dune query — no joins/windows):
//   • transfers: from/"sender", to/"receiver", time/"evt_block_time", value/"amount"
//   • prices:    day/"date", price   (SPX daily USD, ~1000 rows, near-free to pull)
// Output: the SPX_ONCHAIN bundle shape + new LTH/STH profit-loss fields, WEEKLY by default.
//
// Method: true FIFO lots (each wallet a queue of {ts, price, qty}); a send consumes the
// EARLIEST lots first, so every held coin keeps its real acquisition age + cost. This is
// strictly more precise than the old avg-cost bundle AND unlocks the LTH/STH split that
// average-cost can't express. Excluded addresses (pools/bridge/CEX) are never queued as
// holders, but a real wallet's receive is still priced at the day's USD price regardless
// of counterparty (a buy from the pool = cost basis at market — correct).
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const EPS = 1e-9;
const DAY = 86400000;

// 16-address exclude list — kept in sync with dune/spx6900_onchain_snapshot.sql.
export const EXCLUDE = new Set([
  "0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead",
  "0x52c77b0cb827afbad022e6d6caf2c44452edbc39", "0x3ee18b2214aff97000d974cf647e7c347e8fa585",
  "0x7dafba1d69f6c01ae7567ffd7b046ca03b706f83", "0xd2dd7b597fd2435b6db61ddf48544fd931e6869f",
  "0xdf5e3a1ed0c14a53eee240022301ecb9d267671b", "0x651641299c7ec0aa44ad7ed9b7e12702fed2022f",
  "0x0529ea5885702715e83923c59746ae8734c553b7", "0xf35a6bd6e0459a4b53a27862c51a2a7292b383d1",
  "0x9b0c45d46d386cedd98873168c36efd0dcba8d46", "0x3cc936b795a188f0e246cbb2d74c5bd190aecf18",
  "0x6d6cc65e2060d0a280fcd47b6c22ec5636797fec", "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
  "0x73d8bd54f7cf5fab43fe4ef40a62d390644946db", "0xdc154fcee1babb560e8528c3a7791527f01423df",
]);

// age (days) → band index: [<1m, 1-3m, 3-6m, 6-12m, 1y+]
export function ageBand(days) {
  if (days < 30) return 0;
  if (days < 90) return 1;
  if (days < 180) return 2;
  if (days < 365) return 3;
  return 4;
}

// Gini over an array of positive balances (0 = equal, →1 = concentrated).
export function gini(bals) {
  const n = bals.length;
  if (n === 0) return 0;
  const s = [...bals].sort((a, b) => a - b);
  let cum = 0, tot = 0;
  for (let i = 0; i < n; i++) { cum += (i + 1) * s[i]; tot += s[i]; }
  if (tot <= 0) return 0;
  return (2 * cum) / (n * tot) - (n + 1) / n;
}

// Forward-filled daily price lookup. `priced` = sorted [dayTs, price][].
export function makePriceAt(priced) {
  const days = priced.map(p => p[0]);
  return ts => {
    // greatest day <= ts (binary search); clamp to first if before.
    let lo = 0, hi = days.length - 1, ans = 0;
    if (!days.length) return null;
    if (ts < days[0]) return priced[0][1];
    while (lo <= hi) { const m = (lo + hi) >> 1; if (days[m] <= ts) { ans = m; lo = m + 1; } else hi = m - 1; }
    return priced[ans][1];
  };
}

const dayFloor = ts => Math.floor(ts / DAY) * DAY;
const iso = ts => new Date(ts).toISOString().slice(0, 10);

// Monday sample grid from first→last, inclusive of the last transfer's week.
export function mondays(startTs, endTs) {
  // JS getUTCDay: 0=Sun..6=Sat; Monday=1. Walk back to the Monday on/before start.
  let d = dayFloor(startTs);
  while (new Date(d).getUTCDay() !== 1) d -= DAY;
  const out = [];
  for (; d <= endTs + 7 * DAY; d += 7 * DAY) out.push(d);
  return out;
}

// Core replay. transfers = [{from,to,ts,amt}] (any order), priceAt(ts)->usd,
// sampleTs = ascending sample timestamps. Returns the on-chain rows.
export function replayFifo(transfers, priceAt, sampleTs, opts = {}) {
  const exclude = opts.exclude || EXCLUDE;
  const thr = (opts.thresholdDays ?? 90) * DAY;   // LTH cutoff
  const tx = [...transfers].filter(t => t.amt > EPS)
    .map((t, i) => ({ ...t, from: t.from?.toLowerCase(), to: t.to?.toLowerCase(), i }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i);

  const wallets = new Map(); // addr -> {q:[{ts,price,qty}], head, bal}
  const get = a => { let e = wallets.get(a); if (!e) { e = { q: [], head: 0, bal: 0 }; wallets.set(a, e); } return e; };
  const consume = (e, amount) => {
    let need = amount;
    while (need > EPS && e.head < e.q.length) {
      const lot = e.q[e.head], take = Math.min(lot.qty, need);
      lot.qty -= take; e.bal -= take; need -= take;
      if (lot.qty <= EPS) { e.q[e.head] = null; e.head++; }
    }
  };

  const rows = [];
  let p = 0;
  for (const sTs of sampleTs) {
    // replay all transfers up to and including this sample day
    while (p < tx.length && tx[p].ts <= sTs) {
      const t = tx[p++];
      if (t.from && !exclude.has(t.from)) { const e = wallets.get(t.from); if (e) consume(e, t.amt); }
      if (t.to && !exclude.has(t.to)) { const price = priceAt(t.ts); if (price != null) { const e = get(t.to); e.q.push({ ts: t.ts, price, qty: t.amt }); e.bal += t.amt; } }
    }
    rows.push(snapshot(wallets, sTs, priceAt(sTs), thr));
  }
  return rows;
}

function snapshot(wallets, sTs, spot, thr) {
  const bals = [];
  let held = 0, rcap = 0, profitQty = 0;
  const age = [0, 0, 0, 0, 0];
  let lthP = 0, lthL = 0, sthP = 0, sthL = 0;
  for (const e of wallets.values()) {
    if (e.bal <= EPS) continue;
    bals.push(e.bal); held += e.bal;
    for (let i = e.head; i < e.q.length; i++) {
      const lot = e.q[i]; if (!lot || lot.qty <= EPS) continue;
      rcap += lot.qty * lot.price;
      age[ageBand((sTs - lot.ts) / DAY)] += lot.qty;
      const lth = (sTs - lot.ts) >= thr, inProfit = spot != null && spot >= lot.price;
      if (inProfit) { profitQty += lot.qty; if (lth) lthP += lot.qty; else sthP += lot.qty; }
      else { if (lth) lthL += lot.qty; else sthL += lot.qty; }
    }
  }
  bals.sort((a, b) => b - a);
  const topN = n => held > 0 ? +(100 * bals.slice(0, n).reduce((s, x) => s + x, 0) / held).toFixed(2) : 0;
  const pct = q => held > 0 ? +(100 * q / held).toFixed(2) : 0;
  const rp = held > 0 ? rcap / held : 0;
  return {
    d: iso(sTs),
    sip: pct(profitQty),
    top10: topN(10), top100: topN(100),
    gini: +gini(bals).toFixed(4),
    age: age.map(pct),
    holders: bals.length,
    rp: +rp.toFixed(7), mvrv: rp > 0 && spot != null ? +(spot / rp).toFixed(4) : 0,
    spot: spot != null ? +spot.toFixed(7) : 0,
    lthProfit: pct(lthP), lthLoss: pct(lthL), sthProfit: pct(sthP), sthLoss: pct(sthL),
  };
}

// ── CSV ingestion (streaming, column-flexible) ───────────────────────────────
function splitCsv(line) { return line.split(",").map(s => s.trim().replace(/^"|"$/g, "")); }
const idx = (hdr, ...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };

async function loadTransfers(path, decimals) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let hdr = null, cf, ct, ctime, cval, raw = false, scale = 10 ** decimals, out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!hdr) {
      hdr = splitCsv(line).map(s => s.toLowerCase());
      cf = idx(hdr, "from", "sender"); ct = idx(hdr, "to", "receiver");
      ctime = idx(hdr, "time", "evt_block_time", "block_time", "day");
      cval = idx(hdr, "amount", "value"); raw = hdr[cval] === "value";
      if (cf < 0 || ct < 0 || ctime < 0 || cval < 0) throw new Error(`transfers header missing columns: ${hdr}`);
      continue;
    }
    const c = splitCsv(line);
    const ts = Date.parse(c[ctime]); const v = Number(c[cval]);
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    out.push({ from: c[cf], to: c[ct], ts, amt: raw ? v / scale : v });
  }
  return out;
}

async function loadPrices(path) {
  const txt = await readFile(path, "utf8");
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const hdr = splitCsv(lines[0]).map(s => s.toLowerCase());
  const cd = idx(hdr, "day", "date", "time"), cp = idx(hdr, "price", "usd", "close");
  if (cd < 0 || cp < 0) throw new Error(`prices header missing day/price: ${hdr}`);
  return lines.slice(1).map(l => splitCsv(l)).map(c => [dayFloor(Date.parse(c[cd])), Number(c[cp])])
    .filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const tPath = args.transfers, pPath = args.prices;
  if (!tPath || !pPath) { console.error("usage: node scripts/build-onchain-local.mjs --transfers=raw.csv --prices=price.csv [--out=public/onchain.json] [--decimals=8] [--daily] [--threshold=90]"); process.exit(1); }
  const decimals = Number(args.decimals ?? 8);
  const transfers = await loadTransfers(tPath, decimals);
  const priced = await loadPrices(pPath);
  console.log(`loaded ${transfers.length} transfers, ${priced.length} price days`);
  const priceAt = makePriceAt(priced);
  const t0 = Math.min(...transfers.map(t => t.ts)), t1 = Math.max(...transfers.map(t => t.ts));
  const grid = args.daily
    ? Array.from({ length: Math.floor((t1 - t0) / DAY) + 2 }, (_, i) => dayFloor(t0) + i * DAY)
    : mondays(t0, t1);
  const rows = replayFifo(transfers, priceAt, grid, { thresholdDays: Number(args.threshold ?? 90) });
  const clean = rows.filter(r => r.holders > 0);
  const out = args.out || "public/onchain.json";
  await writeFile(out, JSON.stringify(clean));
  const c = clean.at(-1);
  console.log(`Wrote ${out}: ${clean.length} rows. Latest ${c.d}: rp $${c.rp} · mvrv ${c.mvrv}× · sip ${c.sip}% · holders ${c.holders} · top100 ${c.top100}% · age ${c.age.join("/")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-onchain-local failed:", e.message); process.exit(1); });
}
