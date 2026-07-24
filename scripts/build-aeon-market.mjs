// ============================================================================
// PROJECT AEON — market valuation (NFT MVRV / supply-in-profit / URPD / deals)
// ============================================================================
// The SPX on-chain playbook, applied to the NFT. From the sale log + current owners +
// rarity + floor → public/aeon-market.json:
//   • cost basis per held token = its current owner's last purchase price
//   • realized price / MVRV = floor·N ÷ Σ cost basis; supply-in-profit = share of held
//     tokens now worth more (floor) than their owner paid
//   • URPD = cost-basis histogram (in/out of profit vs floor)
//   • fair-value model: log(price) ~ a + b·log(rarity rank), from real sales
//   • deals = recent sales far below fair value (the realized deal detector, no live feed)
//   • biggest sales + trait premiums (which traits command a price)
//
//   node scripts/build-aeon-market.mjs --sales=dune/out/aeon_sales.csv --transfers=dune/out/aeon_transfers.csv
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const SALES = arg("sales") || "dune/out/aeon_sales.csv";
const TRANSFERS = arg("transfers") || "dune/out/aeon_transfers.csv";
const OUT = arg("out") || "public/aeon-market.json";
const ETHLIKE = new Set(["ETH", "WETH", "bpETH", "bETH", "wETH"]);
const ZERO = "0x" + "0".repeat(40), DEAD = "0x000000000000000000000000000000000000dead";
const DAY = 86400e3;

const parseTime = s => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function parseSales(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iT = h.indexOf("time"), iId = h.indexOf("token_id"), iP = h.indexOf("price"), iC = h.indexOf("currency_symbol"),
        iB = h.indexOf("buyer"), iS = h.indexOf("seller"), iM = h.indexOf("marketplace");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(","); const cur = (c[iC] || "").trim(); if (cur && !ETHLIKE.has(cur)) continue;
    const price = Number(c[iP]); if (!(price > 0)) continue;
    rows.push({ t: parseTime(c[iT]), id: Number(c[iId]), price, buyer: (c[iB] || "").toLowerCase(), seller: (c[iS] || "").toLowerCase(), mkt: (c[iM] || "").trim() });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}
function currentOwners(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iTo = h.indexOf("to_address"), iId = h.indexOf("token_id"), iT = h.indexOf("time");
  const owner = new Map();
  for (let i = 1; i < lines.length; i++) { const c = lines[i].split(","); const t = parseTime(c[iT]); const id = Number(c[iId]); const p = owner.get(id); if (!p || t >= p.t) owner.set(id, { to: (c[iTo] || "").toLowerCase(), t }); }
  return owner;
}

function fit(pairs) {  // log(price)=a+b·log(rank)
  const n = pairs.length; if (n < 8) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [rank, price] of pairs) { const x = Math.log(rank), y = Math.log(price); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
  return { a, b, expected: r => Math.exp(a + b * Math.log(r)) };
}

function main() {
  const sales = parseSales(SALES);
  const owners = currentOwners(TRANSFERS);
  const rar = JSON.parse(readFileSync("public/aeon-rarity.json", "utf8"));
  const R = new Map(rar.tokens.map(t => [t.id, t]));
  // live floor from the daily Alchemy banker (aeon.json), fall back to the sales floor
  const floor = (() => {
    try { const f = JSON.parse(readFileSync("public/aeon.json", "utf8")).floor; if (f > 0) return f; } catch { /* next */ }
    try { return JSON.parse(readFileSync("public/aeon-sales.json", "utf8")).current?.floorEth; } catch { return null; }
  })();
  const now = sales.at(-1).t;

  // per-token sale chain → current owner's cost basis (last sale where they were buyer)
  const byToken = new Map();
  for (const s of sales) (byToken.get(s.id) || byToken.set(s.id, []).get(s.id)).push(s);
  const costBasis = new Map(); // token id → price current owner paid
  for (const [id, arr] of byToken) {
    const last = arr[arr.length - 1];
    const own = owners.get(id)?.to;
    if (own && own === last.buyer && own !== ZERO && own !== DEAD) costBasis.set(id, last.price);
  }

  // ── VALUATION: MVRV, supply in profit, URPD (over priced, still-held tokens) ──
  const bases = [...costBasis.values()];
  const realizedPrice = median(bases);
  const heldPriced = bases.length;
  const inProfit = floor > 0 ? bases.filter(c => floor >= c).length : 0;
  const mvrv = floor > 0 && bases.length ? (floor * bases.length) / bases.reduce((s, c) => s + c, 0) : null;
  // URPD buckets (log-spaced cost basis)
  const lo = Math.min(...bases), hi = Math.max(...bases), nb = 28;
  const ll = Math.log(lo), span = (Math.log(hi) - ll) || 1;
  const urpd = Array.from({ length: nb }, (_, i) => ({ lo: Math.exp(ll + span * i / nb), hi: Math.exp(ll + span * (i + 1) / nb), n: 0, prof: 0 }));
  for (const c of bases) { let bi = Math.min(nb - 1, Math.floor((Math.log(c) - ll) / span * nb)); if (bi < 0) bi = 0; urpd[bi].n++; if (floor >= c) urpd[bi].prof++; }

  // ── FAIR VALUE (fit on RECENT sales = current market) + rarity-vs-price scatter + deals ──
  const cutoff = now - 180 * DAY;
  const recentSales = sales.filter(s => s.t >= cutoff && R.has(s.id));
  const fair = fit(recentSales.map(s => [R.get(s.id).rank, s.price]));
  const scored = recentSales.map(s => {
    const rank = R.get(s.id).rank, exp = fair ? fair.expected(rank) : s.price, disc = (exp - s.price) / exp;
    return { id: s.id, price: +s.price.toFixed(3), rank, exp: +exp.toFixed(3), disc: +disc.toFixed(3), img: R.get(s.id).img, d: new Date(s.t).toISOString().slice(0, 10) };
  });
  // downsampled scatter for the chart (keep every sale up to ~500)
  const sstep = Math.max(1, Math.ceil(scored.length / 500));
  const salesScatter = scored.filter((_, i) => i % sstep === 0).map(({ img, exp, ...r }) => r);
  const deals = scored.filter(d => d.disc > 0.2).sort((a, b) => b.disc - a.disc).slice(0, 24);

  // ── BIGGEST SALES ──
  const biggest = [...sales].sort((a, b) => b.price - a.price).slice(0, 24).map(s => ({
    id: s.id, price: +s.price.toFixed(3), rank: R.get(s.id)?.rank ?? null, img: R.get(s.id)?.img ?? null,
    buyer: s.buyer, seller: s.seller, mkt: s.mkt, d: new Date(s.t).toISOString().slice(0, 10),
  }));

  // ── TRAIT PREMIUMS: median recent sale price per trait value ──
  const recent = sales.filter(s => s.t >= now - 180 * DAY && R.has(s.id));
  const tv = new Map(); // "Type=Value" → prices
  for (const s of recent) for (const a of R.get(s.id).traits) { const k = a.t + " · " + a.v; (tv.get(k) || tv.set(k, []).get(k)).push(s.price); }
  const traitPremiums = [...tv.entries()].filter(([, p]) => p.length >= 4)
    .map(([k, p]) => ({ trait: k, floor: +Math.min(...p).toFixed(3), median: +median(p).toFixed(3), sales: p.length }))
    .sort((a, b) => b.median - a.median).slice(0, 30);

  const out = {
    updated: new Date(now).toISOString().slice(0, 10), floor, supply: rar.total,
    valuation: {
      floor, realizedPrice: +realizedPrice.toFixed(4), mvrv: mvrv != null ? +mvrv.toFixed(3) : null,
      heldPriced, supplyInProfitPct: heldPriced ? +(inProfit / heldPriced * 100).toFixed(1) : null,
    },
    urpd: urpd.map(b => ({ lo: +b.lo.toFixed(4), hi: +b.hi.toFixed(4), n: b.n, prof: b.prof })),
    fairModel: fair ? { a: fair.a, b: fair.b } : null,
    salesScatter, deals, biggest, traitPremiums,
  };
  writeFileSync(OUT, JSON.stringify(out) + "\n");

  console.log(
    `aeon-market: floor ${floor} ETH · realized price ${out.valuation.realizedPrice} ETH · MVRV ${out.valuation.mvrv}\n` +
    `  supply in profit ${out.valuation.supplyInProfitPct}% (of ${heldPriced} priced-held) · ${deals.length} recent deals\n` +
    `  biggest sale #${biggest[0].id} ${biggest[0].price} ETH · priciest trait ${traitPremiums[0]?.trait} (${traitPremiums[0]?.median} ETH median)`
  );
}

main();
