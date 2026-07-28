// ============================================================================
// PROJECT AEON — sales / floor reconstruction from the marketplace trade log
// ============================================================================
//   node scripts/build-aeon-sales.mjs --sales=path/to/sales.csv [--out=public/aeon-sales.json]
//
// Input CSV columns: time,token_id,price,currency_symbol,price_usd,marketplace,buyer,seller,tx_hash
// (dune/aeon_sales.sql). Every price is ETH-denominated — ETH, WETH and bpETH (Blur
// Pool ETH) are all 1:1 ETH. Produces a DAILY series:
//   • floorEth  — the day's floor proxy = min sale price (ETH); floorUsd = floorEth × the
//                 day's ETH/USD rate (median price_usd/price), so ETH & USD floors agree
//   • volEth / volUsd / sales — daily volume + trade count
//   • avgEth    — mean sale price
// plus a downsampled per-sale scatter (ETH + USD) and per-marketplace volume split.
//
// Output: public/aeon-sales.json — read by the Aeon floor/sales chart.
// NOTE the live LISTING floor comes from the Alchemy banker (public/aeon.json); this is
// the historical SALE-based floor (a proxy — lowest actual trade, not lowest listing).
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { liveTail, impliedEthUsd, describeTail } from "./aeon-live-tail.mjs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const SALES = arg("sales");
const OUT = arg("out") || "public/aeon-sales.json";
const ETHLIKE = new Set(["ETH", "WETH", "bpETH", "bETH", "wETH"]);
const SCATTER_CAP = 1500;

const parseTime = s => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function parseCsv(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",").map(h => h.trim().toLowerCase());
  const ix = n => head.indexOf(n);
  const iT = ix("time"), iP = ix("price"), iC = ix("currency_symbol"), iU = ix("price_usd"), iM = ix("marketplace");
  // Both ends of the trade. NFT sales are wallet to wallet with no exchange in the middle, so
  // unlike a token transfer the counterparty is a real, nameable holder — which is what lets the
  // city draw the trade as an arc between two buildings rather than a glow on one.
  const iB = ix("buyer"), iS = ix("seller"), iK = ix("token_id");
  if (Math.min(iT, iP, iU) < 0) throw new Error(`unexpected header: ${head.join(",")}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const cur = (c[iC] || "").trim();
    if (cur && !ETHLIKE.has(cur)) continue;              // keep ETH-denominated sales only
    const eth = Number(c[iP]), usd = Number(c[iU]);
    if (!(eth > 0) || !(usd > 0)) continue;
    rows.push({
      t: parseTime(c[iT]), eth, usd, mkt: (c[iM] || "other").trim(),
      buyer: iB >= 0 ? (c[iB] || "").trim().toLowerCase() : "",
      seller: iS >= 0 ? (c[iS] || "").trim().toLowerCase() : "",
      token: iK >= 0 ? Number(c[iK]) : null,
    });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

function main() {
  if (!SALES) { console.error("usage: --sales=sales.csv [--out=public/aeon-sales.json]"); process.exit(1); }
  const duneRows = parseCsv(SALES);
  // Splice the free Alchemy bank onto the weekly Dune baseline, so daily volume and sale
  // counts stay current between pulls. USD for the tail uses the ETH/USD implied by the
  // most recent Dune row — at most days old, which is fine for a volume series.
  const seam = duneRows.length ? duneRows[duneRows.length - 1].t : 0;
  const tail = liveTail(seam);
  const rate = impliedEthUsd(duneRows);
  console.log(describeTail(tail, "aeon-sales"));
  const rows = [...duneRows, ...tail.map(r => ({ t: r.t, eth: r.price, usd: rate ? r.price * rate : 0, mkt: r.mkt }))]
    .sort((a, b) => a.t - b.t);
  if (!rows.length) throw new Error("no ETH-denominated sales parsed");

  // Daily aggregation.
  const byDay = new Map();
  for (const r of rows) {
    const d = new Date(r.t).toISOString().slice(0, 10);
    let g = byDay.get(d);
    if (!g) { g = { d, eth: [], usd: [], rate: [], vE: 0, vU: 0, n: 0 }; byDay.set(d, g); }
    g.eth.push(r.eth); g.usd.push(r.usd); g.rate.push(r.usd / r.eth); g.vE += r.eth; g.vU += r.usd; g.n++;
  }
  const daily = [...byDay.values()].sort((a, b) => a.d.localeCompare(b.d)).map(g => {
    const floorEth = Math.min(...g.eth);
    const rate = median(g.rate);
    return {
      d: g.d,
      floorEth: +floorEth.toFixed(4),
      floorUsd: Math.round(floorEth * rate),
      avgEth: +(g.vE / g.n).toFixed(4),
      volEth: +g.vE.toFixed(2),
      volUsd: Math.round(g.vU),
      sales: g.n,
    };
  });

  // Per-marketplace lifetime volume (ETH).
  const mkt = {};
  for (const r of rows) mkt[r.mkt] = (mkt[r.mkt] || 0) + r.eth;
  const marketplaces = Object.fromEntries(Object.entries(mkt).map(([k, v]) => [k, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]));

  // Downsampled per-sale scatter (every Nth sale to stay under the cap).
  const stepS = Math.max(1, Math.ceil(rows.length / SCATTER_CAP));
  const scatter = rows.filter((_, i) => i % stepS === 0).map(r => ({ d: new Date(r.t).toISOString().slice(0, 10), eth: +r.eth.toFixed(4), usd: Math.round(r.usd) }));

  // ── TRADE ARCS ────────────────────────────────────────────────────────────────────────────
  // Every sale, seller and buyer both named. The city draws these as arcs between the two
  // buildings, which is only possible on the NFT side: a token transfer usually ends at an
  // exchange address and the counterparty is unknowable, whereas an NFT sale is one wallet to
  // another with the price attached.
  //
  // ⚠ A WINDOW IS REQUIRED, AND THE REASON IS CHURN, NOT VOLUME. A building only exists for a
  // wallet that still holds, so an arc can only land if both parties are still holders. Measured
  // over the real data that is 34% of trades at 30 days, 22% at 90 and 3% over all time — so an
  // unbounded set would be mostly arcs with nowhere to go. The window is emitted alongside the
  // trades and the page states how many are shown, rather than quietly drawing the ones that fit.
  const lastT = rows.length ? rows.at(-1).t : Date.now();
  const arcDays = Number(arg("arc-days") || 30);
  const since = lastT - arcDays * 864e5;
  const trades = rows
    .filter(r => r.t >= since && r.buyer && r.seller && r.buyer !== r.seller)
    .map(r => ({
      f: r.seller, to: r.buyer, eth: +r.eth.toFixed(4), usd: Math.round(r.usd),
      token: r.token, d: new Date(r.t).toISOString().slice(0, 10),
    }));

  const cur = daily.at(-1);
  const out = {
    updated: cur.d,
    contract: "0xc374a204334d4edd4c6a62f0867c752d65e9579c",
    currency: "ETH",
    totalSales: rows.length,
    totalVolEth: +rows.reduce((s, r) => s + r.eth, 0).toFixed(1),
    totalVolUsd: Math.round(rows.reduce((s, r) => s + r.usd, 0)),
    marketplaces,
    current: { floorEth: cur.floorEth, floorUsd: cur.floorUsd, avgEth: cur.avgEth, sales: cur.sales },
    daily,
    scatter,
    arcDays,
    trades,
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");

  console.log(
    `aeon-sales: ${out.updated} · ${rows.length} sales · ${out.totalVolEth} ETH ($${(out.totalVolUsd / 1e6).toFixed(1)}M) total\n` +
    `  floor today ${cur.floorEth} ETH ($${cur.floorUsd}) · avg ${cur.avgEth} ETH · ${cur.sales} sales that day\n` +
    `  venues: ${Object.entries(marketplaces).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(" · ")} ETH\n` +
    `  daily ${daily.length} days ${daily[0].d} → ${cur.d} · scatter ${scatter.length} pts\n` +
    `  trades ${trades.length} over the last ${arcDays}d (for the city arcs)`
  );
}

main();
