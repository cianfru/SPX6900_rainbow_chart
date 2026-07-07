// Daily snapshot of SPX6900 on-chain conviction data → public/history.json.
// Run by .github/workflows/snapshot.yml. Append-only, one record per day.
import { readFile, writeFile } from "node:fs/promises";
import { detectSignals } from "./bot/signals.mjs";
import { computeAngles, cardRecencyPenalty } from "./bot/quant.mjs";
import { computeStats, fetchMajors } from "./bot/stats.mjs";
import { DEFAULT_RAW } from "../src/data.js";
import { draftCopy } from "./bot/llm-copy.mjs";

const CONTRACT = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
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

async function main() {
  if (!KEY) throw new Error("Missing HOLDERSCAN_KEY env (set it as a repo secret)");

  const sup = await hs("/stats/supply-breakdown"); // required
  const [p, stats, pnl, breakdowns, fearGreed, spx500] = await Promise.all([
    price(), softHs("/stats"), softHs("/stats/pnl"), softHs("/holders/breakdowns"), fng(), sp500(),
  ]);

  const rec = {
    d: new Date().toISOString().slice(0, 10),
    p,
    holders: breakdowns?.total_holders ?? null,
    be: pnl?.break_even_price ?? null,
    upnl: pnl?.unrealized_pnl_total ?? null, // aggregate unrealized $ PnL of all holders
    rpnl: pnl?.realized_pnl_total ?? null,   // aggregate realized $ PnL (booked)
    gini: stats?.gini ?? null,
    fng: fearGreed,
    sp: spx500, // latest S&P 500 close, for the SPX-vs-S&P cards
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
  console.log(`snapshot ${rec.d} · price ${p} · holders ${rec.holders} · upnl ${rec.upnl} · rpnl ${rec.rpnl} · ${arr.length} records total`);

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

    // Shadow-mode LLM copywriter: attach an engaging draft per signal (from the
    // detector's real numbers only). With no OPENROUTER_API_KEY it returns a
    // labelled mock so the control-panel UX renders; nothing ever auto-posts.
    for (const s of sig.signals) {
      try { s.llmDraft = await draftCopy(s); }
      catch (e) { s.llmDraft = { text: "", model: "none", mock: false, ok: false, reason: e.message }; }
    }
    await writeFile(SIGNALS_FILE, JSON.stringify(sig, null, 2) + "\n");
    const drafted = sig.signals.filter(s => s.llmDraft?.ok && !s.llmDraft.mock).length;
    console.log(`signals ${sig.date}: ${sig.signals.length} notable${sig.signals.length ? " — " + sig.signals.map(s => s.type).join(", ") : ""}${sig.signals.length ? ` · ${drafted} LLM draft(s)` : ""}`);
  } catch (e) { console.warn("signals:", e.message); }
}

main().catch(e => { console.error(e); process.exit(1); });
