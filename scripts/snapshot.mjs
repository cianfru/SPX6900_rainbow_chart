// Daily snapshot of SPX6900 on-chain conviction data → public/history.json.
// Run by .github/workflows/snapshot.yml. Append-only, one record per day.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { detectSignals } from "./bot/signals.mjs";
import { computeAngles, cardRecencyPenalty } from "./bot/quant.mjs";
import { computeStats, fetchMajors } from "./bot/stats.mjs";
import { DEFAULT_RAW } from "../src/data.js";
import { EXCLUDE_LABELS } from "./build-onchain-local.mjs";

const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
// Public ETH RPCs, tried in order. eth.llamarpc.com was the sole default and answered
// 521 for the whole life of this field — 0 of 52 days banked a balance — so the
// exchange-flow forward-fill silently never ran. One host is a single point of failure
// for a keyless endpoint; ETH_RPC still overrides and is tried first when set.
// All of these were measured (2026-08) serving a BATCHED eth_call balanceOf keyless; publicnode +
// drpc alone (the old pair that worked) once left cexBal null for a week when both blipped, so the
// pool is widened to five proven batch hosts. flashbots is last — it answered the batch but not the
// read, so it only ever helps if every real host is down.
const ETH_RPCS = [
  process.env.ETH_RPC,
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
  "https://eth.meowrpc.com",
  "https://1rpc.io/eth",
  "https://rpc.mevblocker.io",
  "https://rpc.flashbots.net",
].filter(Boolean);
// Keyless public endpoints answer 429 or a transient 5xx often enough that a single
// attempt loses roughly a third of days — t3es banked 10 of the last 14, the Base and
// Solana counts 14 of 30. Every one of those gaps was a soft-fail to null that nothing
// reported. Retry with a widening pause, and say out loud what came back, so a feed
// degrading shows up in the run log instead of only in the audit weeks later.
export async function getJson(url, { tries = 3, label = url, ...init } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000), ...init });
      if (r.ok) return await r.json();
      // 4xx that is not rate limiting will not fix itself on a retry.
      if (r.status !== 429 && r.status < 500) { console.warn(`${label}: HTTP ${r.status}, not retrying`); return null; }
      console.warn(`${label}: HTTP ${r.status} (attempt ${i + 1}/${tries})`);
    } catch (e) {
      console.warn(`${label}: ${e.message} (attempt ${i + 1}/${tries})`);
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  console.warn(`${label}: gave up after ${tries} attempts — this field banks null today`);
  return null;
}

const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";
const FILE = "public/history.json";
const SIGNALS_FILE = "public/signals.json";

// HolderScan is GONE (subscription retired 2026-08). Realized price, the ETH holder count, gini and
// the conviction tiers now come from OUR OWN FIFO reconstruction — public/onchain.json, rebuilt daily
// by onchain-dune.yml — which already reproduced all of them (and reconciles to what HolderScan gave).
// We read its latest row here and copy those fields into history.json, so its shape is unchanged and
// every downstream card + chart keeps working; only the SOURCE moved from a paid API to our own data.
export async function latestOnchain(path = "public/onchain.json") {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const arr = Array.isArray(parsed) ? parsed : parsed?.rows;
    return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
  } catch (e) { console.warn("onchain.json read failed:", e.message); return null; }
}
// The HolderScan `sup` tiers {wood…diamond} were by HOLDING TIME — the SAME thing as our FIFO HODL
// age bands `age` = [0-1m, 1-3m, 3-6m, 6-12m, 1y+] (NOT onchain `tiers`, which are wallet-SIZE bands).
// Map them 1:1 into token counts so stats.mjs / SupplyConviction read the object unchanged. The
// "held 90 days+" headline those surfaces show = silver+gold+diamond (3-6m + 6-12m + 1y+), which
// reproduces the ~61%-of-supply figure exactly from our own reconstruction.
export function tiersToSup(oc) {
  if (!Array.isArray(oc?.age) || oc.age.length !== 5 || !(oc.heldTokens > 0)) return null;
  const [wood, bronze, silver, gold, diamond] = oc.age.map(p => (p / 100) * oc.heldTokens);
  return { diamond, gold, silver, bronze, wood };
}

export async function price() {
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
export async function fng() {
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
export async function baseHolders() {
  try {
    const j = await getJson(`https://base.blockscout.com/api/v2/tokens/${BASE_SPX}`,
      { label: "base holders", headers: { Accept: "application/json" } });
    if (!j) return null;
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
export async function baseSupply() {
  try {
    const j = await getJson(`https://base.blockscout.com/api/v2/tokens/${BASE_SPX}`,
      { label: "base supply", headers: { Accept: "application/json" } });
    if (!j) return null;
    const raw = j?.total_supply, dec = parseInt(j?.decimals, 10);
    if (raw == null || !Number.isFinite(dec)) return null;
    const v = Number(raw) / 10 ** dec;
    return v > 0 ? v : null;
  } catch (e) { console.warn("base supply:", e.message); return null; }
}

// Solana SPX supply (tokens bridged to Solana) — one lightweight RPC call getTokenSupply
// on the mint; uiAmount is the decimal-adjusted total. × price = the VALUE on Solana.
export async function solSupply() {
  try {
    const j = await getJson(SOL_RPC, {
      label: "sol supply", method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [SOL_SPX] }),
    });
    if (!j) return null;
    const v = j?.result?.value?.uiAmount;
    return (typeof v === "number" && v > 0) ? v : null;
  } catch (e) { console.warn("sol supply:", e.message); return null; }
}

// Solana holders — direct from a public Solana RPC, NO key. getProgramAccounts scans every
// SPL token account for the SPX mint; `dataSlice` downloads ONLY the 8-byte balance (a u64
// at offset 64) so the payload stays tiny, and we count accounts with balance > 0 (= active
// holders). It's a heavy call: the public node may rate-limit/refuse it — set SOL_RPC to a
// dedicated endpoint (Helius/QuickNode) if so. Soft-skips (null) on any failure.
export async function solHolders() {
  try {
    const payload = {
      jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
      params: [SPL_TOKEN_PROGRAM, {
        encoding: "base64",
        dataSlice: { offset: 64, length: 8 },       // just the u64 balance
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: SOL_SPX } }],
      }],
    };
    const j = await getJson(SOL_RPC, {
      label: "sol holders", method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    if (!j) return null;
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
export async function sp500() {
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
export async function total3es() {
  try {
    const gd = (await getJson("https://api.coingecko.com/api/v3/global",
      { label: "total3es/coingecko", headers: { Accept: "application/json" } }))?.data;
    if (!gd) return null;
    const total = gd?.total_market_cap?.usd, btc = gd?.market_cap_percentage?.btc, eth = gd?.market_cap_percentage?.eth;
    if (!(total > 0) || !(btc >= 0) || !(eth >= 0)) return null;
    // Require stables too, so the series keeps one definition day to day.
    const sj = await getJson("https://stablecoins.llama.fi/stablecoins?includePrices=false",
      { label: "total3es/llama", headers: { Accept: "application/json" } });
    if (!sj) return null;
    const stables = (sj?.peggedAssets || []).reduce((sum, a) => sum + (Number(a?.circulating?.peggedUSD) || 0), 0);
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
export async function cexLpBalances() {
  const addrs = Object.entries(EXCLUDE_LABELS).filter(([, v]) => v.kind === "cex" || v.kind === "lp" || v.kind === "custody");
  const batch = addrs.map(([a], i) => ({
    jsonrpc: "2.0", id: i, method: "eth_call",
    params: [{ to: CONTRACT, data: "0x70a08231" + a.replace(/^0x/, "").padStart(64, "0") }, "latest"],
  }));
  const tried = [];
  // Two passes over the whole pool with a pause between: a keyless host that 429s or times out on
  // the first sweep has usually recovered by the second, which is cheaper insurance than losing the
  // day. One good host anywhere in either pass returns immediately.
  for (let pass = 0; pass < 2; pass++) {
    for (const url of ETH_RPCS) {
      try {
        const r = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(batch), signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) { tried.push(`${url} → ${r.status}`); continue; }
        const res = await r.json();
        // Not every public node honours a BATCHED eth_call: some answer a single object,
        // some return an array of errors. Validate the tally here rather than after the
        // loop, so a host that answers uselessly falls through to the next one.
        if (!Array.isArray(res)) { tried.push(`${url} → non-array (no batch support)`); continue; }
        const by = { cex: 0, lp: 0, custody: 0 };
        let reads = 0;
        for (const row of res) {
          if (row?.error || !row?.result || row.result === "0x") continue;
          by[EXCLUDE_LABELS[addrs[row.id][0]].kind] += Number(BigInt(row.result)) / 1e8;
          reads++;
        }
        // The LP pool always holds SPX, so a zero there means the reads did not land.
        if (!(by.lp > 0) || reads < addrs.length / 2) { tried.push(`${url} → ${reads}/${addrs.length} reads`); continue; }
        return { cexBal: Math.round(by.cex), lpBal: Math.round(by.lp), custBal: Math.round(by.custody) };
      } catch (e) { tried.push(`${url} → ${e.message}`); }
    }
    if (pass === 0) await new Promise(r => setTimeout(r, 2000));
  }
  // A silent null here is what let this go unnoticed for 52 days. Say so loudly.
  console.error("⚠ cex/lp balances FAILED — exchange-flow cards will not advance today:", tried.join(" · "));
  return null;
}

async function main() {
  // Holder count, realized price, gini + conviction tiers come from our FIFO reconstruction now.
  const oc = await latestOnchain();
  if (!oc) console.error("⚠ public/onchain.json missing/empty — holders, realized price, gini and tiers are null today (they forward-fill; onchain-dune.yml rebuilds it daily).");
  const sup = tiersToSup(oc);

  const [p, fearGreed, spx500, baseH, solH, baseSup, solSup, t3es, cexLp] = await Promise.all([
    price(), fng(), sp500(), baseHolders(), solHolders(), baseSupply(), solSupply(), total3es(), cexLpBalances(),
  ]);

  const rec = {
    d: new Date().toISOString().slice(0, 10),
    p,
    holders: oc?.holders ?? null, // ETH-native, FIFO reconstruction (was HolderScan) — supply/tier/MVRV base
    holdersBase: baseH, // Base (bridged) headcount, Blockscout
    holdersSol: solH,   // Solana (Wormhole) headcount, public Solana RPC
    supplyBase: baseSup, // SPX tokens bridged to Base (× price = value on Base)
    supplySol: solSup,   // SPX tokens bridged to Solana (× price = value on Solana)
    be: oc?.rp ?? null,   // realized price / avg cost basis — FIFO (was HolderScan break_even)
    gini: oc?.gini ?? null, // FIFO gini (was HolderScan)
    fng: fearGreed,
    sp: spx500, // latest S&P 500 close, for the SPX-vs-S&P cards
    t3es, // TOTAL3ES (alt market ex-BTC/ETH/stables), keyless reconstruction — feeds the alt-market chart forward
    cexBal: cexLp?.cexBal ?? null, // SPX on tagged exchange addresses (keyless RPC) — exchange-flow cards, forward
    lpBal: cexLp?.lpBal ?? null,   // SPX in the Uniswap LP
    custBal: cexLp?.custBal ?? null, // SPX in custody (BitGo)
    sup, // conviction tiers as token counts {wood…diamond}, from onchain `tiers` × heldTokens
  };

  let arr = [];
  try { const txt = await readFile(FILE, "utf8"); const parsed = JSON.parse(txt); if (Array.isArray(parsed)) arr = parsed; } catch { /* first run */ }
  arr = arr.filter(x => x.d !== rec.d); // one record per day (replace today's if rerun)
  arr.push(rec);
  arr.sort((a, b) => a.d.localeCompare(b.d));

  await writeFile(FILE, JSON.stringify(arr));
  const totalH = [rec.holders, rec.holdersBase, rec.holdersSol].reduce((s, n) => s + (n || 0), 0) || null;
  console.log(`snapshot ${rec.d} · price ${p} · holders eth ${rec.holders} · base ${rec.holdersBase} · sol ${rec.holdersSol} · total ${totalH} · realized ${rec.be} · gini ${rec.gini} · diamond ${sup ? Math.round(sup.diamond / 1e6) + "M" : "—"} · ${arr.length} records total`);

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

  // THE BRIEF → public/notable.json. The cross-surface synthesizer: reads every
  // committed data file (onchain, cex-flow, self-moves, whale-campaigns, smart-money,
  // exit-flow, aeon, valuation) and ranks the genuinely notable events into a
  // human-readable digest for the control panel. Never throws the snapshot.
  try {
    const { detectNotable } = await import("./bot/notable.mjs");
    const { aeonFlow } = await import("../src/aeon-flow.js");
    const rd = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
    const brief = detectNotable({
      history: arr, legacy: detectSignals(arr),
      onchain: await rd("public/onchain.json"), cexFlow: await rd("public/cex-flow.json"),
      selfMoves: await rd("public/self-moves.json"), smartMoney: await rd("public/smart-money.json"),
      exitFlow: await rd("public/exit-flow.json"), whaleCampaigns: await rd("public/whale-campaigns.json"),
      aeonSales: await rd("public/aeon-sales.json"), aeonOnchain: await rd("public/aeon-onchain.json"),
      valuation: await rd("public/valuation.json"),
    }, aeonFlow);
    await writeFile("public/notable.json", JSON.stringify(brief));
    console.log(`notable ${brief.date}: ${brief.count} items — ${brief.items.map(i => i.lane).join(", ")}`);
  } catch (e) { console.warn("notable:", e.message); }

  // DAILY SNAPSHOT → public/daily-snapshot.json. The control-panel terminal one-pager: day-over-day
  // deltas (1d/7d/30d) across valuation/buy-zone, holders & conviction, exchange flow, whale-cohort
  // net buy/sell, smart money. Pure transform of the already-banked feeds. Never throws the snapshot.
  try {
    const { buildDailySnapshot } = await import("./bot/daily-snapshot.mjs");
    const rd = async f => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return null; } };
    const snap = buildDailySnapshot({
      history: arr, onchain: await rd("public/onchain.json") || [], whales: await rd("public/whales.json"),
      smartMoney: await rd("public/smart-money.json"), valuation: await rd("public/valuation.json"),
      cexFlow: await rd("public/cex-flow.json"), exitFlow: await rd("public/exit-flow.json"),
      longshort: await rd("public/longshort.json"),
    });
    await writeFile("public/daily-snapshot.json", JSON.stringify(snap));
    console.log(`daily-snapshot ${snap.date}: ${snap.sections.length} sections, ${snap.alerts.length} alerts`);
  } catch (e) { console.warn("daily-snapshot:", e.message); }
}

// Guarded so the fetchers above can be imported by the read-only feed check without
// this module appending a day to history.json as a side effect of the import.
// (argv[1] is undefined under `node -e`, which is an import, not a direct run.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
