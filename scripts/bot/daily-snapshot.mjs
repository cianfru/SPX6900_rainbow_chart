// DAILY SNAPSHOT — the control-panel "terminal one-pager": a granular day-over-day read across the
// metrics that matter, computed from the committed daily feeds ($0, keyless). Complements the Brief
// (event detector) with a STATE table: valuation & buy-zone distance, holders & conviction, exchange
// flow, whale-cohort net buy/sell over 1d/7d/30d, and smart-money. Everything is a delta off the daily
// series we already bank — no new data. Writes public/daily-snapshot.json, rendered by /control.
//
// HONESTY: several conviction reads are SUPPLY shares, not wallet counts (that is all the feeds carry);
// labelled as such. Rows also carry the source date so the panel can flag a stale feed.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { scanAnomalies } from "./anomaly-scan.mjs";

const read = f => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; } };
// delta of a numeric accessor over the last N rows of a daily array (null if not enough history)
const backDelta = (arr, acc, n) => {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const last = arr[arr.length - 1], prev = arr[arr.length - 1 - n];
  if (!last || !prev) return null;
  const a = acc(last), b = acc(prev);
  return (Number.isFinite(a) && Number.isFinite(b)) ? a - b : null;
};
const dateOf = x => (x && (x.updated || (Array.isArray(x) ? x[x.length - 1]?.d : null))) || null;

// row: label, value, deltas over [1,7,30] rows, a fmt hint, goodUp (is an increase bullish?), note
const row = (label, value, arr, acc, fmt, goodUp, note) => ({
  label, value, fmt, goodUp: !!goodUp, note: note || "",
  d: [1, 7, 30].map(n => backDelta(arr, acc, n)),
});

export function buildDailySnapshot(feeds) {
  const { history = [], onchain = [], whales, smartMoney, valuation, cexFlow, exitFlow } = feeds;
  const oc = onchain.length ? onchain[onchain.length - 1] : null;
  const h = history.length ? history[history.length - 1] : null;
  const spot = oc?.spot ?? h?.p ?? whales?.spot ?? 0;
  const sections = [], alerts = [];

  // ---- VALUATION ----------------------------------------------------------
  const val = [];
  if (oc) {
    val.push(row("MVRV (price ÷ realized)", oc.mvrv, onchain, r => r.mvrv, "x", false,
      oc.mvrv < 1 ? `under cost basis · buyers' zone ≈ 0.5` : "over cost basis"));
    val.push(row("Supply in profit", oc.sip, onchain, r => r.sip, "pct", true, "share of supply above its cost"));
  }
  if (valuation?.cur) {
    const c = valuation.cur.composite, zone = (valuation.zones || []).find(z => c <= z.max);
    val.push({ label: "Valuation composite", value: c, fmt: "pctile", goodUp: false, note: zone?.label || "",
      d: [1, 7, 30].map(n => backDelta(valuation.series || [], r => (Array.isArray(r) ? r[1] : r.v), n)) });
  }
  if (oc && oc.mvrv != null) {
    // Accumulation-zone proximity (MVRV 0.5 = historically where SPX bottoms). An ALERT is only for
    // genuine proximity — IN the zone, or NEAR it (within ~10%). Being merely "undervalued" a quarter
    // above the zone is NOT an alert (the MVRV row shows it) — that "Approaching" banner at +24% was a
    // false positive: it fired all the way up to MVRV 0.75 (+50% above), so it was permanently stuck on.
    const buy = 0.5, pctAbove = ((oc.mvrv - buy) / buy) * 100;
    if (oc.mvrv <= buy) alerts.push(`🟢 IN the accumulation zone — MVRV ${oc.mvrv.toFixed(2)} (≤ 0.5, historically where SPX has bottomed).`);
    else if (oc.mvrv <= buy * 1.1) alerts.push(`🟢 Near accumulation — MVRV ${oc.mvrv.toFixed(2)}, just +${pctAbove.toFixed(0)}% above the 0.5 zone.`);
    if (valuation?.cur?.composite <= 0.2) alerts.push(`🟢 Composite ${(valuation.cur.composite * 100).toFixed(0)}/100 — deep-value zone.`);
  }
  if (val.length) sections.push({ title: "Valuation", rows: val });

  // ---- HOLDERS & CONVICTION ----------------------------------------------
  const hold = [];
  if (h) {
    hold.push(row("Holders (Ethereum)", h.holders, history, r => r.holders, "int", true, "wallet count"));
    if (h.holdersBase != null) hold.push(row("Holders (Base)", h.holdersBase, history, r => r.holdersBase, "int", true, ""));
    if (h.holdersSol != null) hold.push(row("Holders (Solana)", h.holdersSol, history, r => r.holdersSol, "int", true, ""));
    if (h.sup?.diamond != null) hold.push(row("Diamond supply (held >90d)", h.sup.diamond, history, r => r.sup?.diamond, "m", true, "SUPPLY, not wallet count"));
  }
  if (oc) {
    const lth = r => (r.lthProfit || 0) + (r.lthLoss || 0);
    hold.push(row("Long-term holders (>155d)", lth(oc), onchain, lth, "pct", true, "share of supply held >155 days"));
    hold.push(row("Supply held 1y+", oc.age?.[4], onchain, r => r.age?.[4], "pct", true, "oldest HODL band"));
  }
  if (hold.length) sections.push({ title: "Holders & conviction", rows: hold });

  // ---- EXCHANGE FLOW ------------------------------------------------------
  const flow = [];
  if (oc?.cexBal != null) {
    // Δ in exchange balance = net onto (‑ off) exchanges. Rising = sell-side supply building (bad).
    flow.push(row("On exchanges (balance)", oc.cexBal, onchain, r => r.cexBal, "m", false, "rising = supply onto venues"));
  } else if (h?.cexBal != null) {
    flow.push(row("On exchanges (balance)", h.cexBal, history, r => r.cexBal, "m", false, "rising = supply onto venues"));
  }
  if (oc?.lpBal != null) flow.push(row("In liquidity pools", oc.lpBal, onchain, r => r.lpBal, "m", true, "DEX depth"));
  if (flow.length) sections.push({ title: "Exchange flow", rows: flow });

  // ---- WHALE COHORTS (net buy/sell over 1d/7d/30d) ------------------------
  let whaleFlow = null;
  if (whales?.wallets?.length) {
    const big = whales.wallets.filter(w => (w.bal || 0) >= 1e5);
    const dust = w => Math.max(1000, (w.bal || 0) * 0.005);
    whaleFlow = ["d1", "d7", "d30"].map((k, i) => {
      let buyers = 0, sellers = 0, net = 0;
      for (const w of big) { const f = w[k] || 0; net += f; const d = dust(w); if (f > d) buyers++; else if (f < -d) sellers++; }
      return { win: ["1d", "7d", "30d"][i], buyers, sellers, net };
    });
  }

  // ---- HOW HOLDERS LEFT (exit-flow) ---------------------------------------
  // Daily departures (a wallet's last day above the 5k bar), split profit vs loss, in wallets AND SPX.
  // exit-flow.json days = [date, cProfit, cLoss, supProfit, supLoss]. We surface the trailing 1/7/30-day
  // sums + the % leaving in profit, and RAISE AN ALERT when the last few days' supply-departed spikes
  // above its own trailing norm — a real "holders leaving" signal, framed by whether it's profit-taking
  // (top selling) or loss (capitulation). This is the lane the terminal was missing.
  let exits = null;
  const efDays = exitFlow?.days;
  if (Array.isArray(efDays) && efDays.length >= 8) {
    const supTot = r => (r[3] || 0) + (r[4] || 0);
    const sum = (n, i) => efDays.slice(-n).reduce((s, r) => s + (r[i] || 0), 0);
    const win = n => {
      const cP = sum(n, 1), cL = sum(n, 2), sP = sum(n, 3), sL = sum(n, 4), s = sP + sL;
      return { wallets: cP + cL, supply: s, profitPct: s > 0 ? Math.round((sP / s) * 100) : null };
    };
    exits = { d1: win(1), d7: win(7), d30: win(30) };
    // spike: last up-to-3 days' supply vs the trailing-60d daily norm
    const daily = efDays.map(supTot);
    const trail = daily.slice(-63, -3);
    if (trail.length >= 20) {
      const mean = trail.reduce((a, b) => a + b, 0) / trail.length;
      const sd = Math.sqrt(trail.reduce((a, b) => a + (b - mean) ** 2, 0) / trail.length) || 1;
      const recent = efDays.slice(-3);
      const peak = recent.reduce((best, r) => (supTot(r) > supTot(best) ? r : best), recent[0]);
      const z = (supTot(peak) - mean) / sd;
      if (z >= 2 && supTot(peak) > 0) {
        const sP = peak[3] || 0, sL = peak[4] || 0, mostly = sP >= sL ? "profit-taking" : "at a loss (capitulation)";
        alerts.push(`⚠️ Exit wave: ${((sP + sL) / 1e6).toFixed(2)}M SPX left on ${peak[0]} (${((peak[1] || 0) + (peak[2] || 0))} wallets), ${z.toFixed(1)}σ above normal — mostly ${mostly}.`);
      }
    }
  }

  // ---- SMART MONEY --------------------------------------------------------
  const sm = [];
  if (smartMoney) {
    const wk = smartMoney.weeks || [];
    const f = smartMoney.flow || {};
    const trend = (f.w4 != null) ? ` · trend 4w ${f.w4 >= 0 ? "+" : ""}${f.w4}% / 12w ${f.w12 >= 0 ? "+" : ""}${f.w12}% / 26w ${f.w26 >= 0 ? "+" : ""}${f.w26}%` : "";
    sm.push(row("Smart-money held", smartMoney.heldNow, wk, r => r[1], "m", true, `${smartMoney.cohortSize || 0} proven wallets · median ${smartMoney.medianRoi}×${trend}`));
    sm.push({ label: "New qualifiers (90d)", value: smartMoney.newQual90 ?? 0, fmt: "int", goodUp: false,
      note: "wallets newly proven by selling tops — a spike = distribution", d: [null, null, null] });
  }
  if (sm.length) sections.push({ title: "Smart money", rows: sm });

  // ---- TECHNICALS (optional lane) ----------------------------------------
  const tech = [];
  if (oc) {
    if (oc.sopr != null) tech.push(row("SOPR", oc.sopr, onchain, r => r.sopr, "x", true, ">1 = coins moving in profit"));
    if (oc.nrpl != null) tech.push(row("Net realized P/L ($)", oc.nrpl, onchain, r => r.nrpl, "usdm", true, "profit − loss realized on-chain"));
    if (oc.liveliness != null) tech.push(row("Liveliness", oc.liveliness, onchain, r => r.liveliness, "num3", false, "rising = old coins waking / distributing"));
  }
  if (h?.fng != null) tech.push(row("Fear & Greed", h.fng, history, r => r.fng, "int", true, "crypto-wide, context only"));
  if (tech.length) sections.push({ title: "Technicals", rows: tech });

  // ANOMALY RADAR — the across-the-board scan: every numeric series flagged if it jumped abnormally today.
  const radar = scanAnomalies({ onchain, history, exitFlow, cexFlow, valuation });

  const date = dateOf(history) || dateOf(onchain) || null;
  return {
    updated: date, date,
    anomalies: radar.items, scanned: radar.scanned,
    spot: +(+spot).toFixed(6),
    sections, whaleFlow, exits, alerts,
    freshness: {
      history: dateOf(history), onchain: dateOf(onchain), whales: dateOf(whales),
      smartMoney: smartMoney?.updated || null, valuation: valuation?.updated || null,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=public/daily-snapshot.json").slice(6);
  const snap = buildDailySnapshot({
    history: read("public/history.json") || [],
    onchain: read("public/onchain.json") || [],
    whales: read("public/whales.json"),
    smartMoney: read("public/smart-money.json"),
    valuation: read("public/valuation.json"),
    cexFlow: read("public/cex-flow.json"),
    exitFlow: read("public/exit-flow.json"),
  });
  writeFileSync(out, JSON.stringify(snap));
  console.error(`daily-snapshot: ${snap.sections.length} sections · ${snap.alerts.length} alerts · ${snap.date} → ${out}`);
  for (const a of snap.alerts) console.error("  " + a);
}
