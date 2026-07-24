// ============================================================================
// PROJECT AEON — trader intelligence (wallet P&L, diamond vs paper hands)
// ============================================================================
// Reconstructs every wallet's realized P&L from the marketplace sale log by walking
// each token's sale chain (buy price → sell price). Also hold-time, flip rate, and
// whether they still hold. → public/aeon-traders.json (leaderboard).
//
//   node scripts/build-aeon-traders.mjs --sales=dune/out/aeon_sales.csv [--transfers=... --floor=<eth>]
//
// Method (honest): realized P&L only counts round-trips we can PRICE — a wallet that
// bought a token via a sale and later sold it via a sale realizes (sell − buy). Mint
// cost and free transfers (gifts/moves) are unknown → excluded, not guessed. So the
// board is "profit from trading AEON," not total return.
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";

const arg = k => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const SALES = arg("sales") || "dune/out/aeon_sales.csv";
const TRANSFERS = arg("transfers") || "dune/out/aeon_transfers.csv";
const FLOOR = Number(arg("floor")) || null;
const OUT = arg("out") || "public/aeon-traders.json";
const ETHLIKE = new Set(["ETH", "WETH", "bpETH", "bETH", "wETH"]);
const DAY = 86400e3;
const ZERO = "0x" + "0".repeat(40), DEAD = "0x000000000000000000000000000000000000dead";

const parseTime = s => { const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T")); return Number.isFinite(t) ? t : Date.parse(s); };

function parseSales(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iT = h.indexOf("time"), iId = h.indexOf("token_id"), iP = h.indexOf("price"), iC = h.indexOf("currency_symbol"),
        iB = h.indexOf("buyer"), iS = h.indexOf("seller");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const cur = (c[iC] || "").trim(); if (cur && !ETHLIKE.has(cur)) continue;
    const price = Number(c[iP]); if (!(price > 0)) continue;
    rows.push({ t: parseTime(c[iT]), id: c[iId], price, buyer: (c[iB] || "").toLowerCase(), seller: (c[iS] || "").toLowerCase() });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

// current owner per token (last non-burn `to`) from the transfer log
function currentOwners(path) {
  let lines; try { lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean); } catch { return new Map(); }
  const h = lines[0].split(",").map(s => s.trim().toLowerCase());
  const iTo = h.indexOf("to_address"), iId = h.indexOf("token_id"), iT = h.indexOf("time");
  const owner = new Map();
  for (let i = 1; i < lines.length; i++) { const c = lines[i].split(","); const t = parseTime(c[iT]); const p = owner.get(c[iId]); if (!p || t >= p.t) owner.set(c[iId], { to: (c[iTo] || "").toLowerCase(), t }); }
  const m = new Map(); for (const [id, o] of owner) if (o.to !== ZERO && o.to !== DEAD) m.set(id, o.to); return m;
}

function main() {
  const sales = parseSales(SALES);
  const owners = currentOwners(TRANSFERS);
  const floor = FLOOR || (() => { try { return JSON.parse(readFileSync("public/aeon-sales.json", "utf8")).current?.floorEth; } catch { return null; } })();

  // per-token sale chain → realize each seller's round-trip; track buyers' cost basis
  const byToken = new Map();
  for (const s of sales) { (byToken.get(s.id) || byToken.set(s.id, []).get(s.id)).push(s); }
  const W = new Map(); // wallet → stats
  const w = a => { let x = W.get(a); if (!x) { x = { a, realized: 0, bought: 0, boughtVol: 0, sold: 0, soldVol: 0, hold: [], wins: 0, losses: 0 }; W.set(a, x); } return x; };
  const held = new Map(); // token → { owner, price, ts } current priced position (for unrealized)

  for (const [id, arr] of byToken) {
    let cur = null; // {owner, price, ts}
    for (const s of arr) {
      if (cur && cur.owner === s.seller) {                 // seller had a known buy price → realize
        const pnl = s.price - cur.price, ws = w(s.seller);
        ws.realized += pnl; ws.sold++; ws.soldVol += s.price; ws.hold.push((s.t - cur.ts) / DAY);
        if (pnl >= 0) ws.wins++; else ws.losses++;
      }
      const wb = w(s.buyer); wb.bought++; wb.boughtVol += s.price;
      cur = { owner: s.buyer, price: s.price, ts: s.t };
    }
    if (cur && owners.get(id) === cur.owner) held.set(id, cur);  // still holds what they bought
  }

  // unrealized for still-held priced positions
  if (floor > 0) for (const [, pos] of held) { const wx = W.get(pos.owner); if (wx) { wx.unrealized = (wx.unrealized || 0) + (floor - pos.price); wx.holding = (wx.holding || 0) + 1; } }

  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const traders = [...W.values()]
    .filter(t => t.sold + t.bought >= 2)
    .map(t => ({
      a: t.a, realized: +t.realized.toFixed(3), unrealized: t.unrealized ? +t.unrealized.toFixed(3) : 0,
      bought: t.bought, sold: t.sold, boughtVol: +t.boughtVol.toFixed(2), soldVol: +t.soldVol.toFixed(2),
      avgHold: t.hold.length ? Math.round(med(t.hold)) : null, trades: t.bought + t.sold,
      winRate: (t.wins + t.losses) ? +(t.wins / (t.wins + t.losses)).toFixed(2) : null, holding: t.holding || 0,
    }));

  const byRealized = [...traders].sort((a, b) => b.realized - a.realized);
  const totalRealized = traders.reduce((s, t) => s + t.realized, 0);
  writeFileSync(OUT, JSON.stringify({
    updated: new Date(sales.at(-1).t).toISOString().slice(0, 10),
    floor, totalSales: sales.length, traders: traders.length,
    top: byRealized.slice(0, 100),                 // biggest winners
    bottom: byRealized.slice(-40).reverse(),       // biggest losers (paper hands)
    byVolume: [...traders].sort((a, b) => (b.boughtVol + b.soldVol) - (a.boughtVol + a.soldVol)).slice(0, 60),
  }) + "\n");

  const top = byRealized[0], flippers = traders.filter(t => t.avgHold != null && t.avgHold < 7).length;
  console.log(
    `aeon-traders: ${traders.length} traders · ${sales.length} sales · floor ${floor} ETH\n` +
    `  top trader ${top.a.slice(0, 10)} realized +${top.realized} ETH (${top.trades} trades)\n` +
    `  net realized across all: ${totalRealized.toFixed(1)} ETH · ${flippers} fast flippers (<7d hold)`
  );
}

main();
