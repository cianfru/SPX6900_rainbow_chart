// Daily snapshot of SPX6900 on-chain conviction data → public/history.json.
// Run by .github/workflows/snapshot.yml. Append-only, one record per day.
import { readFile, writeFile } from "node:fs/promises";
import { detectSignals } from "./bot/signals.mjs";
import { computeAngles, cardRecencyPenalty } from "./bot/quant.mjs";
import { computeStats, fetchMajors } from "./bot/stats.mjs";
import { DEFAULT_RAW } from "../src/data.js";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
const ETH_RPC = process.env.ETH_RPC || "https://eth.llamarpc.com"; // override if the public node rate-limits
const HS = `https://api.holderscan.com/v0/eth/tokens/${CONTRACT}`;
const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const KEY = process.env.HOLDERSCAN_KEY;
const FILE = "public/history.json";
const SIGNALS_FILE = "public/signals.json";

async function hs(path) {
  const r = await fetch(`${HS}${path}`, { headers: { "x-api-key": KEY, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Holderscan ${path} → ${r.status}`);
  return r.json();
}
async function softHs(path) {
  try { return await hs(path); } catch (e) { console.warn(e.message); return null; }
}

async function price() {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}`, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.data?.attributes?.base_token_price_usd); if (p > 0) return p; }
  } catch (e) { console.warn("gecko:", e.message); }
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/SPX-USD/ticker", { headers: { Accept: "application/json", "User-Agent": "spx6900-rainbow" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j.price); if (p > 0) return p; }
  } catch (e) { console.warn("coinbase:", e.message); }
  return null;
}

// Crypto Fear & Greed Index (alternative.me, free/no-key). Reachable from CI even
// though it's blocked in some sandboxes. limit=1 = today's value (0..100).
async function fng() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const v = parseInt(j?.data?.[0]?.value, 10);
    return Number.isFinite(v) ? v : null;
  } catch (e) { console.warn("fng:", e.message); return null; }
}

// MULTI-CHAIN HOLDER COUNT. SPX lives on ETH (native, tracked above via HolderScan) +
// Base + Solana (bridged, e.g. Wormhole). By supply Base+Solana are ~6%, but by HEADCOUNT
// they dwarf ETH (Base ~114k, Solana ~66k vs ETH ~49.5k) — so the "total holders" reach is
// ~4.6× what we post. We bank the COUNT only; supply/tiers/MVRV stay ETH-native. Wallets,
// not people. Override contracts via BASE_SPX / SOL_SPX; Solana is keyless (public RPC).
const BASE_SPX = process.env.BASE_SPX || "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C";
const SOL_SPX = process.env.SOL_SPX || "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr"; // base58 Solana mint (Wormhole SPX)
const SOL_RPC = process.env.SOL_RPC || "https://api.mainnet-beta.solana.com"; // override if the public node rate-limits getProgramAccounts
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// Base holders — FREE via Blockscout (the same number the Basescan token page shows;
// Basescan's own tokenholdercount API is pro-only). No key needed. We SUBTRACT contract
// addresses (the Wormhole bridge lock, LP pools, routers) — they're not people, and they
// are always the LARGEST holders, so scanning the top pages catches them. BASE_EXCLUDE
// (comma-separated addresses) pins any the is_contract flag misses.
async function baseHolders() {
  try {
    const r = await fetch(`https://base.blockscout.com/api/v2/tokens/${BASE_SPX}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    let n = parseInt(j?.holders ?? j?.holders_count, 10);
    if (!(Number.isFinite(n) && n > 0)) return null;

    const exclude = new Set((process.env.BASE_EXCLUDE || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean));
    let contracts = 0, query = "";
    for (let page = 0; page < 3; page++) { // top ~150 holders — where every contract sits
      const hr = await fetch(`https://base.blockscout.com/api/v2/tokens/${BASE_SPX}/holders${query}`, { headers: { Accept: "application/json" } });
      if (!hr.ok) break;
      const hj = await hr.json();
      for (const it of (hj?.items || [])) {
        const addr = it?.address?.hash?.toLowerCase();
        if (it?.address?.is_contract || (addr && exclude.has(addr))) contracts++;
      }
      if (!hj?.next_page_params) break;
      query = "?" + new URLSearchParams(hj.next_page_params).toString();
    }
    n -= contracts;
    if (contracts) console.log(`base holders: -${contracts} contract address(es) removed`);
    return n > 0 ? n : null;
  } catch (e) { console.warn("base holders:", e.message); return null; }
}

// Base SPX supply (tokens bridged to Base) — from the SAME Blockscout token endpoint
// (total_supply + decimals). × price = the VALUE on Base, for the value-by-chain donut.
async function baseSupply() {
  try {
    const r = await fetch(`https://base.blockscout.com/api/v2/tokens/${BASE_SPX}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    const raw = j?.total_supply, dec = parseInt(j?.decimals, 10);
    if (raw == null || !Number.isFinite(dec)) return null;
    const v = Number(raw) / 10 ** dec;
    return v > 0 ? v : null;
  } catch (e) { console.warn("base supply:", e.message); return null; }
}

// Solana SPX supply (tokens bridged to Solana) — one lightweight RPC call getTokenSupply
// on the mint; uiAmount is the decimal-adjusted total. × price = the VALUE on Solana.
async function solSupply() {
  try {
    const r = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [SOL_SPX] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    const v = j?.result?.value?.uiAmount;
    return (typeof v === "number" && v > 0) ? v : null;
  } catch (e) { console.warn("sol supply:", e.message); return null; }
}

// Solana holders — direct from a public Solana RPC, NO key. getProgramAccounts scans every
// SPL token account for the SPX mint; `dataSlice` downloads ONLY the 8-byte balance (a u64
// at offset 64) so the payload stays tiny, and we count accounts with balance > 0 (= active
// holders). It's a heavy call: the public node may rate-limit/refuse it — set SOL_RPC to a
// dedicated endpoint (Helius/QuickNode) if so. Soft-skips (null) on any failure.
async function solHolders() {
  try {
    const payload = {
      jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
      params: [SPL_TOKEN_PROGRAM, {
        encoding: "base64",
        dataSlice: { offset: 64, length: 8 },       // just the u64 balance
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: SOL_SPX } }],
      }],
    };
    const r = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    if (j?.error) throw new Error(j.error.message || "rpc error");
    if (!Array.isArray(j?.result)) throw new Error("no result");
    let active = 0;
    for (const acc of j.result) {
      const b64 = acc?.account?.data?.[0];
      if (!b64) continue;
      const buf = Buffer.from(b64, "base64");
      if (buf.length >= 8 && buf.readBigUInt64LE(0) > 0n) active++;
    }
    return active > 0 ? active : null;
  } catch (e) { console.warn("sol holders:", e.message); return null; }
}

// S&P 500 latest close (Yahoo, no key). Reachable from CI even where it's blocked
// in sandboxes. Keeps the SPX-vs-S&P cards current without bundling a fresh CSV.
async function sp500() {
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d", { headers: { Accept: "application/json", "User-Agent": "spx6900-rainbow" } });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return (typeof v === "number" && v > 0) ? v : null;
  } catch (e) { console.warn("sp500:", e.message); return null; }
}

// TOTAL3ES (alt market ex-BTC/ETH/stables) reconstructed keyless: CoinGecko /global gives
// total mcap + BTC/ETH dominance; DeFiLlama gives total stablecoin mcap. TOTAL3ES =
// total×(1 − (btc%+eth%)/100) − stables. Reachable from CI (blocked in the dev sandbox).
// The alt-market chart REBASES this to the TradingView bundle's level at the seam, so the
// definitional offset vs TV washes out — only the daily deltas carry. Soft-fails to null.
async function total3es() {
  try {
    const g = await fetch("https://api.coingecko.com/api/v3/global", { headers: { Accept: "application/json" } });
    if (!g.ok) return null;
    const gd = (await g.json())?.data;
    const total = gd?.total_market_cap?.usd, btc = gd?.market_cap_percentage?.btc, eth = gd?.market_cap_percentage?.eth;
    if (!(total > 0) || !(btc >= 0) || !(eth >= 0)) return null;
    const s = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=false", { headers: { Accept: "application/json" } });
    if (!s.ok) return null; // require stables too, so the series stays consistent day to day
    const stables = ((await s.json())?.peggedAssets || []).reduce((sum, a) => sum + (Number(a?.circulating?.peggedUSD) || 0), 0);
    if (!(stables > 0)) return null;
    const v = total * (1 - (btc + eth) / 100) - stables;
    return (v > 20e9 && v < 5000e9) ? Math.round(v) : null; // sanity: a few hundred B, not absurd
  } catch (e) { console.warn("total3es:", e.message); return null; }
}

// CEX / LP / custody balances — the SPX held on the tagged exchange/LP/custody addresses
// (EXCLUDE_LABELS), read keyless via a public ETH RPC (eth_call balanceOf, one JSON-RPC batch).
// This keeps the exchange-flow cards' pulse fresh DAILY without touching Dune: build-cex-flow
// splices these forward onto the Dune reconstruction (past). Sums per kind; decimals(SPX)=8.
// Soft-fails to null (never breaks the snapshot). Set ETH_RPC if the public node rate-limits.
async function cexLpBalances() {
  try {
    const addrs = Object.entries(EXCLUDE_LABELS).filter(([, v]) => v.kind === "cex" || v.kind === "lp" || v.kind === "custody");
    const batch = addrs.map(([a], i) => ({
      jsonrpc: "2.0", id: i, method: "eth_call",
      params: [{ to: CONTRACT, data: "0x70a08231" + a.replace(/^0x/, "").padStart(64, "0") }, "latest"],
    }));
    const r = await fetch(ETH_RPC, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch), signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const res = await r.json();
    if (!Array.isArray(res)) throw new Error("non-array");
    const by = { cex: 0, lp: 0, custody: 0 };
    for (const row of res) {
      if (row?.error || !row?.result || row.result === "0x") continue;
      const kind = EXCLUDE_LABELS[addrs[row.id][0]].kind;
      by[kind] += Number(BigInt(row.result)) / 1e8;
    }
    // require the LP + at least one CEX read to have landed, else treat as a failed pull
    if (!(by.lp > 0) || !(by.cex >= 0)) throw new Error("empty");
    return { cexBal: Math.round(by.cex), lpBal: Math.round(by.lp), custBal: Math.round(by.custody) };
  } catch (e) { console.warn("cex/lp balances:", e.message); return null; }
}

async function main() {
  if (!KEY) throw new Error("Missing HOLDERSCAN_KEY env (set it as a repo secret)");

  const sup = await hs("/stats/supply-breakdown"); // required
  const [p, stats, pnl, breakdowns, fearGreed, spx500, baseH, solH, baseSup, solSup, t3es, cexLp] = await Promise.all([
    price(), softHs("/stats"), softHs("/stats/pnl"), softHs("/holders/breakdowns"), fng(), sp500(),
    baseHolders(), solHolders(), baseSupply(), solSupply(), total3es(), cexLpBalances(),
  ]);

  const rec = {
    d: new Date().toISOString().slice(0, 10),
    p,
    holders: breakdowns?.total_holders ?? null, // ETH-native (HolderScan) — the supply/tier/MVRV base
    holdersBase: baseH, // Base (bridged) headcount, Blockscout
    holdersSol: solH,   // Solana (Wormhole) headcount, public Solana RPC
    supplyBase: baseSup, // SPX tokens bridged to Base (× price = value on Base)
    supplySol: solSup,   // SPX tokens bridged to Solana (× price = value on Solana)
    be: pnl?.break_even_price ?? null,
    upnl: pnl?.unrealized_pnl_total ?? null, // aggregate unrealized $ PnL of all holders
    rpnl: pnl?.realized_pnl_total ?? null,   // aggregate realized $ PnL (booked)
    gini: stats?.gini ?? null,
    fng: fearGreed,
    sp: spx500, // latest S&P 500 close, for the SPX-vs-S&P cards
    t3es, // TOTAL3ES (alt market ex-BTC/ETH/stables), keyless reconstruction — feeds the alt-market chart forward
    cexBal: cexLp?.cexBal ?? null, // SPX on tagged exchange addresses (keyless RPC) — exchange-flow cards, forward
    lpBal: cexLp?.lpBal ?? null,   // SPX in the Uniswap LP
    custBal: cexLp?.custBal ?? null, // SPX in custody (BitGo)
    sup,
  };

  // Note: /stats/pnl returns exactly {break_even_price, realized_pnl_total,
  // unrealized_pnl_total} (verified from the CI logs 2026-07-02) — no percent-in-
  // profit or cost-basis distribution, so all of it is already banked above.
  let arr = [];
  try { const txt = await readFile(FILE, "utf8"); const parsed = JSON.parse(txt); if (Array.isArray(parsed)) arr = parsed; } catch { /* first run */ }
  arr = arr.filter(x => x.d !== rec.d); // one record per day (replace today's if rerun)
  arr.push(rec);
  arr.sort((a, b) => a.d.localeCompare(b.d));

  await writeFile(FILE, JSON.stringify(arr));
  const totalH = [rec.holders, rec.holdersBase, rec.holdersSol].reduce((s, n) => s + (n || 0), 0) || null;
  console.log(`snapshot ${rec.d} · price ${p} · holders eth ${rec.holders} · base ${rec.holdersBase} · sol ${rec.holdersSol} · total ${totalH} · supply base ${rec.supplyBase} · sol ${rec.supplySol} · upnl ${rec.upnl} · rpnl ${rec.rpnl} · ${arr.length} records total`);

  // Anomaly detector → public/signals.json for the control panel's "Notable
  // today" strip. Human-in-the-loop: it only surfaces candidates + honest framing;
  // the owner approves and queues. Never throws the snapshot.
  try {
    // Two sources, merged: the day-over-day detector (something CHANGED today) + the
    // Quant's state reads (interesting divergences right now). computeStats reads the
    // fresh on-chain data we just wrote plus the bundled+snapshot price history.
    const lastBundled = DEFAULT_RAW.at(-1).date;
    const newer = arr.filter(x => x.d > lastBundled && x.p > 0).map(x => ({ date: x.d, price: x.p }));
    const history = newer.length ? [...DEFAULT_RAW, ...newer] : DEFAULT_RAW;
    let coins; try { coins = await fetchMajors(); } catch { /* vs-BTC/peer angles just skip */ }
    const stats = computeStats(p ?? DEFAULT_RAW.at(-1).price, rec.d, { history, coins });

    // Recent-post look-back so we don't surface a card fired too recently.
    let recent = [];
    try { recent = JSON.parse(await readFile("public/post-state.json", "utf8")).recent || []; } catch { /* none yet */ }

    const detector = detectSignals(arr).signals.map(x => ({ ...x, score: x.severity - cardRecencyPenalty(x.card, recent, rec.d) }));
    const angles = computeAngles(stats, { recent, onchain: arr }).map(a => ({
      type: a.key, emoji: a.emoji, title: a.headline, detail: a.detail, framing: a.framing, note: a.note, card: a.card, score: a.score,
    }));
    // Merge, keep the strongest per card, take the top 3.
    const byCard = new Map();
    for (const x of [...detector, ...angles].sort((a, b) => b.score - a.score)) if (!byCard.has(x.card)) byCard.set(x.card, x);
    const sig = { date: rec.d, signals: [...byCard.values()].sort((a, b) => b.score - a.score).slice(0, 3) };

    // NO daily LLM draft (owner, 2026-07-13): the cron no longer calls OpenRouter — it
    // just banks the detector's signals + their honest template framing. The owner
    // generates an LLM draft ON DEMAND from the control panel (per-signal ✨ Draft button
    // → api/agent draft mode), so credits are only spent when he asks for one.
    await writeFile(SIGNALS_FILE, JSON.stringify(sig, null, 2) + "\n");
    console.log(`signals ${sig.date}: ${sig.signals.length} notable${sig.signals.length ? " — " + sig.signals.map(s => s.type).join(", ") : ""}`);
  } catch (e) { console.warn("signals:", e.message); }
}

main().catch(e => { console.error(e); process.exit(1); });
