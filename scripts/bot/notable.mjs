// ────────────────────────────────────────────────────────────────────────────
// THE BRIEF — a synthesizer across every data surface.
//
// The problem it solves: the project now has ~50 data surfaces, and the genuinely
// notable things (a whale splitting to 5 wallets, one wallet scooping 16 NFTs,
// exchange flow accelerating) are already IN the data — but only surface if a
// human happens to be looking at the exact right chart. Detection mostly already
// happens (self-moves, whale-campaigns, smart-money, exit-flow, the composite).
// What was missing is the layer that reads all of it and hands back a ranked,
// human-readable digest with a verify-link on every line.
//
// Each detector reads one surface, scores a candidate against its OWN history/
// baseline (so it is not the same handful every day), and emits a NotableItem.
// The engine ranks by severity, keeps the best per lane, returns the top N.
//
// HONESTY RAIL (the moat): every item carries the real number, a `framing` (the
// honest content angle) and a `verify` link so the owner — and the audience —
// can check it. Nothing is invented; a detector that can't stand a number up
// returns nothing.
// ────────────────────────────────────────────────────────────────────────────

import { buildModel, bandIndex, dayN, BAND_LABELS, buildRiskSeries } from "../../src/models.js";
import { DEFAULT_RAW } from "../../src/data.js";

const SITE = "https://spx6900rainbow.xyz";
const chartLink = (text, id) => ({ text, href: `${SITE}/?chart=${id}` });
const cityLink = (text) => ({ text, href: `${SITE}/city` });
const etherscan = (text, a) => ({ text, href: `https://etherscan.io/address/${a}` });

const fNum = n => Math.round(n).toLocaleString("en-US");
const fM = n => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + "k" : Math.round(n).toString());
const fUsd = n => "$" + fNum(n);
const fPx = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.01 ? 4 : 3));
const shortA = a => a.slice(0, 6) + "…" + a.slice(-4);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
// z-score of the last value vs a trailing baseline; 0 if not enough history.
const zLast = a => { if (a.length < 6) return 0; const base = a.slice(0, -1), s = std(base); return s ? (a.at(-1) - mean(base)) / s : 0; };
const pct = x => Math.round(x * 100);
const daysBetween = (a, b) => { const t1 = Date.parse(a), t2 = Date.parse(b); return (isNaN(t1) || isNaN(t2)) ? null : Math.round((t2 - t1) / 86400000); };

// ── STATE READS (always-on daily baseline) ───────────────────────────────────
// Unlike the event detectors below, these ALWAYS emit a reading when the surface
// is present — so the briefing has real substance even on a completely quiet day
// (a paid daily brief can't be blank). Low severity so real events rank above;
// tagged kind:"state" so the panel can group them as "Today's read". Each guards
// its own field, so absent data simply yields no reading (never a fabricated one).
// NOTE the value shapes: sip / top100 / age[] are already 0–100 percents; the
// composite is 0–1.
function stateReads(data) {
  const out = [];
  const oc = Array.isArray(data.onchain) ? data.onchain : null;
  const last = oc?.at(-1);
  const val = data.valuation;

  if (val?.cur?.composite != null && Array.isArray(val.zones)) {
    const c = val.cur.composite, zone = val.zones.find(z => c <= z.max) || val.zones.at(-1);
    out.push({
      kind: "state", lane: "state-valuation", severity: 2.9, emoji: "🧭",
      headline: `Valuation: ${pct(c)}th percentile — ${zone.label}`,
      detail: `The composite (six lenses on one 0–100 scale) reads ${pct(c)} of its own history — ${zone.label.toLowerCase()}.`,
      framing: `SPX reads ${zone.label.toLowerCase()} today — ${pct(c)}th percentile of its own history. The one-line state of play.`,
      checkable: "Weighted percentile of six independent valuation lenses; weights published on Methods.",
      verify: chartLink("Valuation Composite", "valuation"),
    });
  }
  if (last?.mvrv != null && last?.spot != null && last?.rp != null) {
    const under = last.mvrv < 1;
    out.push({
      kind: "state", lane: "state-mvrv", severity: 2.7, emoji: under ? "🟢" : "🔴",
      headline: `Price is ${last.mvrv.toFixed(2)}× the crowd's cost basis`,
      detail: `Spot ${fPx(last.spot)} vs realized price ${fPx(last.rp)} — the average holder is ${under ? "underwater" : "in profit"} (MVRV ${last.mvrv.toFixed(2)}).`,
      framing: `Holders sit ${under ? "below" : "above"} their aggregate cost basis (MVRV ${last.mvrv.toFixed(2)}). ${under ? "Historically an accumulation zone." : "Above what the crowd paid."}`,
      checkable: "Market cap ÷ realized cap, from the FIFO cost-basis reconstruction.",
      verify: chartLink("MVRV & Realized Price", "mvrv"),
    });
  }
  if (last?.sip != null) {
    out.push({
      kind: "state", lane: "state-sip", severity: 2.5, emoji: "💰",
      headline: `${Math.round(last.sip)}% of supply is in profit`,
      detail: `${Math.round(last.sip)}% of tracked supply is held above its on-chain cost basis today.`,
      framing: `${Math.round(last.sip)}% of supply is in profit. Low = capitulation zone, high = euphoria risk; a position read, not a signal.`,
      checkable: "Held coins with cost basis below spot, from the FIFO engine.",
      verify: chartLink("Supply in Profit", "supplyprofit"),
    });
  }
  if (oc && oc.length >= 31 && last?.holders != null && oc.at(-31)?.holders) {
    const prev = oc.at(-31).holders, dPct = (last.holders - prev) / prev * 100;
    const dir = dPct > 0.5 ? "grew" : dPct < -0.5 ? "shrank" : "held flat";
    out.push({
      kind: "state", lane: "state-holders", severity: 2.3, emoji: "👥",
      headline: `${fNum(last.holders)} ETH holders — ${dir} over 30 days`,
      detail: `The ETH holder base is ${fNum(last.holders)}, ${dir} ${dPct >= 0 ? "+" : ""}${dPct.toFixed(1)}% over the last 30 days.`,
      framing: `Holder base ${dir} (${dPct >= 0 ? "+" : ""}${dPct.toFixed(1)}% in 30d). Adoption trend, decoupled from price.`,
      checkable: "Distinct ETH addresses holding a balance, from the transfer history.",
      verify: chartLink("Holders vs Price", "holdersprice"),
    });
  }
  if (Array.isArray(last?.age) && last.age.length >= 5 && last.age[4] != null) {
    out.push({
      kind: "state", lane: "state-conviction", severity: 2.1, emoji: "💎",
      headline: `${Math.round(last.age[4])}% of supply held over a year`,
      detail: `${Math.round(last.age[4])}% of tracked supply hasn't moved in 12 months — the diamond base.`,
      framing: `${Math.round(last.age[4])}% of supply is 1y+ held. Deep conviction base; compare to Bitcoin at the same age.`,
      checkable: "Per-lot coin age from the FIFO reconstruction.",
      verify: chartLink("HODL Waves", "hodlwaves"),
    });
  }
  return out;
}

// ── DETECTORS ───────────────────────────────────────────────────────────────
// Each returns an array of candidates (usually 0–1). severity is 0–10.

// 1) Exchange flow — is SPX accelerating ONTO exchanges (sell pressure) or OFF
//    (self-custody / accumulation)? The example that started this: the signal was
//    invisible until the composite put a number on it.
function cexFlow(cf) {
  const days = cf?.days; if (!Array.isArray(days) || days.length < 30) return [];
  const bal = days.map(d => d[1]);                       // index 1 = total CEX balance
  const win = 7;
  const deltas = [];                                     // rolling 7-day balance change, whole history
  for (let i = win; i < bal.length; i++) deltas.push(bal[i] - bal[i - win]);
  if (deltas.length < 10) return [];
  const now = deltas.at(-1), z = zLast(deltas);
  if (Math.abs(z) < 1.2 || Math.abs(now) < 5e5) return [];
  const onExch = now > 0;
  const sev = Math.min(9, 3 + Math.abs(z));
  return [{
    lane: "exchange-flow", severity: sev, emoji: onExch ? "📥" : "📤",
    headline: onExch
      ? `${fM(now)} SPX moved onto exchanges in 7 days`
      : `${fM(-now)} SPX pulled off exchanges in 7 days`,
    detail: `Net exchange balance change is ${Math.abs(z).toFixed(1)}σ from its trailing norm — ${onExch ? "an acceleration of deposits (sell-side supply building)" : "coins leaving to self-custody (supply tightening)"}.`,
    framing: onExch
      ? `Deposits to exchanges are accelerating — ${fM(now)} SPX in a week, well above the usual. Frame as sell-side supply building, a position read, not a top call.`
      : `SPX is leaving exchanges — ${fM(-now)} in a week, above the usual. Frame as coins moving to self-custody / supply tightening, not a guaranteed pump.`,
    checkable: "Net exchange balance from the tagged CEX wallets, over the public transfer history.",
    verify: chartLink("Exchange Flow", "cexflow"),
  }];
}

// 2) Whale self-moves — a big wallet SPLITTING into fresh wallets (hiding size /
//    leaving the city) or CONSOLIDATING. This is the 5.5M→5-wallets case, already
//    detected in self-moves.json, never surfaced.
function selfMoves(sm, refDate, eventDays = 7) {
  const evs = sm?.events; if (!Array.isArray(evs) || !evs.length) return [];
  // A "move" is only NEWS while it's fresh. Drop anything older than the event window (default 7d)
  // when datable, so a whale split from last month can't sit at the top of the brief forever — the
  // exact staleness the owner flagged (a 17-day-old split still ranking #1). Undated moves are kept
  // (rare) but faded. Within the window, bias to the biggest.
  const cand = evs.filter(e => e.supply >= 200_000)
    .map(e => ({ e, age: refDate ? daysBetween(e.date, refDate) : null }))
    .filter(x => x.age == null || x.age <= eventDays);
  const recent = cand.sort((a, b) => (b.e.supply || 0) - (a.e.supply || 0)).slice(0, 2);
  return recent.map(({ e, age }) => {
    const split = e.type === "split";
    let sev = Math.min(9, 4 + Math.log10((e.supply || 1) / 1e5) * 2);
    if (age != null && age > 3) sev *= 0.85;   // fade older moves within the window so today's leads
    const ago = age != null && age >= 1 ? ` (${age}d ago)` : " (today)";
    return {
      lane: "whale-moves", severity: sev, emoji: split ? "🪓" : "🧷",
      headline: split
        ? `A ${fM(e.supply)}-SPX wallet split into ${e.n} fresh wallets`
        : `${e.n} wallets consolidated ${fM(e.supply)} SPX into one`,
      detail: `${e.date}${ago}. ${split ? "The pieces inherit the source's coin age, so it's a move, not new buying — often a holder breaking up a position to sit below the radar." : "A holder pulling scattered balances together."}${e.unverified ? " Flagged unverified (same-block heuristic) — worth an eyeball." : ""}`,
      framing: split
        ? `A whale broke a ${fM(e.supply)} SPX position into ${e.n} wallets on ${e.date}. Interesting because it's the kind of move that normally goes unseen — our clustering caught it. Say "moved/split", never "sold".`
        : `${e.n} wallets folded ${fM(e.supply)} SPX into one on ${e.date} — accumulation consolidating.`,
      checkable: "Same-block fan-out/fan-in in the raw transfer history; the source wallet is linked below.",
      verify: e.source ? etherscan("The source wallet", e.source) : chartLink("Wallet Clusters", "entities"),
    };
  });
}

// 3) Watched-whale net moves this week — biggest accumulator / distributor among
//    the wallets the campaign-watcher tracks.
function whaleCampaigns(wc, exclude = new Set(), known = null) {
  const ws = (wc?.wallets || []).filter(w => w.a && !exclude.has(w.a.toLowerCase())
    && (!known || known.has(w.a.toLowerCase()))   // still a tracked holder — never an excluded MM/CEX
    && Math.abs(w.net || 0) >= 300_000);
  if (!ws.length) return [];
  const out = [];
  const buyers = ws.filter(w => w.net > 0).sort((a, b) => b.net - a.net);
  const sellers = ws.filter(w => w.net < 0).sort((a, b) => a.net - b.net);
  const days = wc.idleDays || 7;
  if (buyers[0]) out.push({
    lane: "whale-accum", severity: Math.min(8, 3 + Math.log10(buyers[0].net / 1e5) * 1.8), emoji: "🐋",
    headline: `A whale added ${fM(buyers[0].net)} SPX in ${days} days`,
    detail: `${shortA(buyers[0].a)} accumulated over the window${buyers.length > 1 ? `, one of ${buyers.length} whales net-buying` : ""}.`,
    framing: `A large wallet accumulated ${fM(buyers[0].net)} SPX in ${days} days. Real, checkable buying by a big holder.`,
    checkable: "Net balance change on a watched wallet over the last week of transfers.",
    verify: etherscan("The wallet", buyers[0].a),
  });
  if (sellers[0]) out.push({
    lane: "whale-distrib", severity: Math.min(8, 3 + Math.log10(-sellers[0].net / 1e5) * 1.8), emoji: "🩸",
    headline: `A whale shed ${fM(-sellers[0].net)} SPX in ${days} days`,
    detail: `${shortA(sellers[0].a)} distributed over the window${sellers.length > 1 ? `, one of ${sellers.length} whales net-selling` : ""}.`,
    framing: `A large wallet distributed ${fM(-sellers[0].net)} SPX in ${days} days. State it as a move off this wallet — it may be a split (see clustering), not a market sell.`,
    checkable: "Net balance change on a watched wallet over the last week of transfers.",
    verify: etherscan("The wallet", sellers[0].a),
  });
  return out;
}

// 4) Smart money — the proven top-timer cohort: net-flow direction + new members.
function smartMoney(sm) {
  const out = []; if (!sm || sm.flow == null) return out;
  const f = sm.flow, w12 = f.w12;
  if (w12 != null && Math.abs(w12) >= 1) {
    const buying = w12 > 0;
    out.push({
      lane: "smart-money", severity: buying ? 7.5 : 5, emoji: buying ? "🧠" : "💤",
      headline: buying
        ? `Smart money turned net buyer (+${w12.toFixed(1)}% over 12w)`
        : `Smart money still net-selling (${w12.toFixed(1)}% over 12w)`,
      detail: `The ${sm.cohortSize}-wallet cohort of proven top-timers (ROI ≥5×, still holding) holds ${fM(sm.heldNow)} SPX. 4w ${f.w4 > 0 ? "+" : ""}${f.w4}% · 12w ${w12 > 0 ? "+" : ""}${w12}% · 26w ${f.w26 > 0 ? "+" : ""}${f.w26}%.`,
      framing: buying
        ? `The proven-winner cohort flipped to accumulating (+${w12.toFixed(1)}% in 12w). This is the forward signal to watch — say it plainly.`
        : `Smart money hasn't started buying yet (${w12.toFixed(1)}% in 12w). Honest "not the bottom signal yet" read.`,
      checkable: "A recomputed cohort of wallets with realized ROI ≥5× that still hold ≥50k SPX; net flow of their combined balance.",
      verify: chartLink("Smart Money", "smartmoney"),
    });
  }
  if (sm.newQual90 > 0) out.push({
    lane: "smart-money-new", severity: 4 + Math.min(3, sm.newQual90), emoji: "🌟",
    headline: `${sm.newQual90} new proven top-timer${sm.newQual90 > 1 ? "s" : ""} in 90 days`,
    detail: `Wallet(s) that just crossed the ROI+capital bar by selling a top at profit — a burst means distribution is starting.`,
    framing: `${sm.newQual90} wallet(s) newly qualified as smart money in 90d (sold a top at ≥5× ROI). Low count = quiet market; a spike is the tell.`,
    checkable: "First crossing of the ROI+capital bar per wallet, from the sale history.",
    verify: chartLink("Smart Money", "smartmoney"),
  });
  return out;
}

// 5) AEON accumulation — top net buyer on the NFT market (the 16-in-a-day case).
function aeonAccum(sales, onchain, flowFn) {
  const trades = sales?.trades; if (!Array.isArray(trades) || trades.length < 6 || !flowFn) return [];
  const flow = flowFn(trades, onchain?.holders, { days: 30, topN: 3 });
  const a0 = flow.accum?.[0]; if (!a0 || a0.net < 3) return [];
  return [{
    lane: "aeon-accum", severity: Math.min(8, 3 + a0.net * 0.3), emoji: "🖼️",
    headline: `One wallet scooped ${a0.net} AEON${a0.days === 1 ? " in a single day" : ` over ${a0.days} days`}`,
    detail: `${shortA(a0.a)} is the biggest net buyer of Project AEON over 30 days — ${a0.ethIn.toFixed(1)} ETH${a0.usdIn ? ` (${fUsd(a0.usdIn)})` : ""}, well clear of the field.`,
    framing: `One wallet accumulated ${a0.net} AEON${a0.usdIn ? ` (~${fUsd(a0.usdIn)})` : ""} on the market. Show the tornado / the city arcs — anyone can verify it.`,
    checkable: "Net marketplace buys minus sells per wallet over 30 days, from the public sale log.",
    verify: chartLink("Buying vs Selling", "aeonflow"),
  }];
}

// 6) On-chain behaviour shifts — liveliness (old coins waking = distribution),
//    NRPL swing, supply-in-profit move, concentration change. vs a trailing baseline.
function onchainShift(oc) {
  if (!Array.isArray(oc) || oc.length < 30) return [];
  const out = [], tail = oc.slice(-30);
  const liv = tail.map(r => r.liveliness).filter(x => x != null);
  const zL = zLast(liv);
  if (Math.abs(zL) >= 1.3 && liv.length > 10) {
    const rising = zL > 0;
    out.push({
      lane: "liveliness", severity: Math.min(7, 3 + Math.abs(zL)), emoji: rising ? "⏰" : "🪨",
      headline: rising ? "Long-dormant coins are waking up" : "The base is sitting tighter than usual",
      detail: `Liveliness ${oc.at(-1).liveliness.toFixed(3)} is ${Math.abs(zL).toFixed(1)}σ ${rising ? "up" : "down"} vs its month. Rising = old coins moving (distribution/rotation); falling = holders sitting still (accumulation).`,
      framing: rising
        ? `Older coins are starting to move — liveliness ticked up. Interesting "the patient money is stirring" angle; not a direction call.`
        : `Coins are sitting tighter — liveliness fell. The base is holding, dormancy deepening.`,
      checkable: "Coin-days-destroyed vs coin-days-stored from the FIFO reconstruction.",
      verify: chartLink("Liveliness", "liveliness"),
    });
  }
  const nrpl = tail.map(r => r.nrpl).filter(x => x != null);
  const zN = zLast(nrpl);
  if (Math.abs(zN) >= 1.5 && nrpl.length > 10) {
    const profit = oc.at(-1).nrpl > 0;
    out.push({
      lane: "nrpl", severity: Math.min(6.5, 2.5 + Math.abs(zN)), emoji: profit ? "💵" : "🔻",
      headline: profit ? "A spike in realized profit-taking" : "Losses being locked in",
      detail: `Net realized ${profit ? "profit" : "loss"} today is ${Math.abs(zN).toFixed(1)}σ from normal — coins are moving at a ${profit ? "gain" : "loss"} more than usual.`,
      framing: `${profit ? "Profit-taking" : "Loss-realisation"} spiked on-chain today (${Math.abs(zN).toFixed(1)}σ). A behaviour read from what coins realised when they moved.`,
      checkable: "Realized P&L from the FIFO engine per moved coin.",
      verify: chartLink("Net Realized P/L", "nrpl"),
    });
  }
  return out;
}

// 7) The valuation composite's DRIVER — which single axis is out of line with the
//    rest. This is exactly how the exchange-flow story first surfaced.
function valuationDriver(val) {
  const ax = val?.cur?.byAxis; if (!ax) return [];
  const entries = Object.entries(ax);
  if (entries.length < 3) return [];
  const vals = entries.map(([, v]) => v), m = mean(vals);
  const [name, v] = entries.sort((a, b) => Math.abs(b[1] - m) - Math.abs(a[1] - m))[0];
  if (Math.abs(v - m) < 0.18) return [];               // nothing stands out → stay quiet
  const hot = v > m;
  const NAMES = { valuation: "price vs value", relative: "vs the alt market", flow: "exchange flow", conviction: "holder conviction", sentiment: "sentiment", trend: "trend", picycle: "trend" };
  return [{
    lane: "composite-driver", severity: 3 + Math.min(4, Math.abs(v - m) * 8), emoji: "🧭",
    headline: `The valuation read is being pulled by ${NAMES[name] || name}`,
    detail: `The composite sits at the ${Math.round((val.cur.composite) * 100)}th percentile, but the ${NAMES[name] || name} axis is at ${Math.round(v * 100)} while the rest average ${Math.round(m * 100)} — ${hot ? "the one dimension running hot" : "the one dimension standing out cheap"}.`,
    framing: `Everything is cheap except ${NAMES[name] || name}, which reads ${Math.round(v * 100)}/100. That divergence is the story — it's how the exchange-flow build-up first became visible.`,
    checkable: "Each axis is a percentile of its own history; published weights on the Methods page.",
    verify: chartLink("Valuation Composite", "valuation"),
  }];
}

// 8) Departure spike — an unusually heavy day of holders leaving (≥5k → below). Scored on BOTH wallet
//    COUNT and SUPPLY over the last few days, because the sharpest waves are a FEW whales taking a LOT
//    of supply off the table (the count-only version missed the 2025 ATH profit-taking entirely).
function exitSpike(ef) {
  const days = ef?.days; if (!Array.isArray(days) || days.length < 30) return [];
  const cnt = d => (d[1] || 0) + (d[2] || 0), sup = d => (d[3] || 0) + (d[4] || 0);
  const stat = f => { const t = days.slice(-63, -3).map(f); const m = t.reduce((a, b) => a + b, 0) / t.length; const sd = Math.sqrt(t.reduce((a, b) => a + (b - m) ** 2, 0) / t.length) || 1; return { m, sd }; };
  const cS = stat(cnt), sS = stat(sup);
  let best = null, bestZ = 1.5;
  for (const d of days.slice(-3)) { const z = Math.max((cnt(d) - cS.m) / cS.sd, (sup(d) - sS.m) / sS.sd); if (z > bestZ) { bestZ = z; best = d; } }
  if (!best) return [];
  const n = cnt(best), s = sup(best), sP = best[3] || 0, sL = best[4] || 0, lossLed = sL > sP;
  return [{
    lane: "exits", severity: Math.min(6.5, 2.5 + bestZ * 0.4), emoji: "🚪",
    headline: `${(s / 1e6).toFixed(2)}M SPX left in a day${lossLed ? " at a loss" : ""}`,
    detail: `${best[0]}: ${n} wallet${n === 1 ? "" : "s"} dropped below the 5k bar with ${(s / 1e6).toFixed(2)}M SPX, ${bestZ.toFixed(1)}σ above the usual churn — ${lossLed ? "loss-led (capitulation)" : Math.round((sP / (s || 1)) * 100) + "% in profit (profit-taking)"}.`,
    framing: lossLed
      ? `A loss-led exit wave — the worrying kind: ${n} wallets left ${(s / 1e6).toFixed(2)}M SPX underwater. Say "left/dropped below the bar", not "dumped".`
      : `A profit-taking exit wave — ${n} wallets banked ${(s / 1e6).toFixed(2)}M SPX and stepped down. Holders selling strength, not fear; the honest hook is WHO takes profit and when.`,
    checkable: "Wallets whose balance fell below the 5k residency bar that day, split by exit vs entry price.",
    verify: chartLink("How Holders Left", "exitflow"),
  }];
}

// 9) Fold in the legacy history-based detectors (break-even cross, holder surge,
//    diamond jump, F&G extreme) so nothing they caught is lost.
function fromLegacy(legacy) {
  const sig = legacy?.signals; if (!Array.isArray(sig)) return [];
  return sig.map(s => ({
    lane: "crowd", severity: s.severity ?? 4, emoji: s.emoji || "•",
    headline: s.title, detail: s.detail, framing: s.framing, checkable: "From the daily holder/valuation snapshot.",
    verify: s.card ? chartLink("The card", s.card) : null, note: s.note,
  }));
}

// 10) Concentration shift — the top-100 wallets' share of holder supply moving vs
//     its trailing norm (whales tightening their grip, or supply broadening out).
function concentrationShift(oc) {
  if (!Array.isArray(oc) || oc.length < 30) return [];
  const tail = oc.slice(-30).map(r => r.top100).filter(x => x != null);
  const z = zLast(tail);
  if (Math.abs(z) < 1.3 || tail.length < 10) return [];
  const last = oc.at(-1).top100, rising = z > 0;
  return [{
    lane: "concentration", severity: Math.min(6, 2.5 + Math.abs(z)), emoji: rising ? "🐳" : "🕸️",
    headline: rising ? "The top 100 wallets are tightening their grip" : "Supply is spreading out of the top 100",
    detail: `Top-100 share is ${last.toFixed(1)}% of holder supply, ${Math.abs(z).toFixed(1)}σ ${rising ? "up" : "down"} vs its month.`,
    framing: `The largest 100 wallets ${rising ? "gained" : "gave up"} share this month (${last.toFixed(1)}%, ${Math.abs(z).toFixed(1)}σ). ${rising ? "Concentration rising." : "Broadening holder base — decentralising."}`,
    checkable: "Top-100 addresses' share of tracked supply, from the transfer history.",
    verify: chartLink("Holder Concentration", "concentration"),
  }];
}

// SPX City — current citizens + on-chain TVL (+ WoW). Reads public/city-history.json (not in `stats`).
// Row layout: [date, price, ...tier COUNTS..., ...tier TVLs...] — counts then equal-length TVLs.
function cityGrowth(ch) {
  const rows = ch?.rows; if (!Array.isArray(rows) || rows.length < 8) return [];
  const last = rows.at(-1), prev = rows[Math.max(0, rows.length - 8)];
  const half = (last.length - 2) / 2;
  if (!(half >= 1)) return [];
  const cit = r => r.slice(2, 2 + half).reduce((s, x) => s + (+x || 0), 0);
  const tvl = r => r.slice(2 + half).reduce((s, x) => s + (+x || 0), 0);
  const c = cit(last), t = tvl(last), c0 = cit(prev), dPct = c0 ? (c - c0) / c0 * 100 : 0;
  if (!(c > 0)) return [];
  return [{
    kind: "state", lane: "city", severity: 2.6, emoji: "🏙️", card: "citygrowth",
    headline: `SPX City: ${fNum(c)} citizens · ${fUsd(t)} on-chain`,
    detail: `${fNum(c)} wallets hold ≥5k SPX for 90+ days (the city's residents), together worth ${fUsd(t)} at today's price${Math.abs(dPct) >= 0.3 ? `, ${dPct >= 0 ? "+" : ""}${dPct.toFixed(1)}% residents WoW` : ""}.`,
    framing: `The city grew to ${fNum(c)} residents holding ${fUsd(t)} — the flagship visual and a real adoption number.`,
    checkable: "Wallets ≥5k SPX held 90+ days × live price, from the FIFO reconstruction.",
    verify: chartLink("City Growth", "citygrowth"),
  }];
}

// ── MARKET SCANS — the "flexible" always-on reads the owner asked for ─────────
// The rainbow band we're in (and when we JUST entered one), 20-week heat, the 0–1 risk level (and a
// round-threshold crossing), YTD vs the S&P 500, and whether the calendar month is green. Each maps
// to the CARD that posts it, so the brief goes from "what's notable" straight to "fire this card" —
// exactly the scan the owner wants so they don't have to eyeball every card. A crossing/transition
// is kind:"change" (ranks above a steady read); a steady value is kind:"state". All reproducible
// from the frozen rainbow model + daily price history + S&P closes — no new data pipeline.
function marketScans(data) {
  const ph = (data.priceHistory || []).filter(p => p && p.price > 0)
    .map(p => ({ date: p.date, price: p.price })).sort((a, b) => a.date.localeCompare(b.date));
  if (ph.length < 30) return [];
  const out = [];
  const m = buildModel(DEFAULT_RAW);
  const last = ph.at(-1), price = last.price, day = dayN(last.date);
  const prev7 = ph[Math.max(0, ph.length - 8)];   // ~7 rows back

  // 1) Rainbow band (+ transition this week)
  const bi = bandIndex(m, price, day), bandNow = BAND_LABELS[bi]?.l || `band ${bi}`;
  const bi7 = bandIndex(m, prev7.price, dayN(prev7.date));
  if (bi !== bi7) {
    out.push({ kind: "change", lane: "band", severity: 5.6, emoji: bi > bi7 ? "🔺" : "🔻", card: "rainbow",
      headline: `SPX just moved into the ${bandNow} band`,
      detail: `Price ${fPx(price)} crossed from ${BAND_LABELS[bi7]?.l || "the prior band"} into ${bandNow} within the week — a band change the daily rotation won't announce on its own.`,
      framing: `SPX moved into the ${bandNow} band this week. A clean "where are we on the rainbow" post even though no per-band fire triggered.`,
      checkable: "Current price vs the frozen power-law band edges (published model).", verify: chartLink("Rainbow", "rainbow") });
  } else {
    out.push({ kind: "state", lane: "band", severity: 3.0, emoji: "🌈", card: "rainbow",
      headline: `SPX is in the ${bandNow} band`,
      detail: `At ${fPx(price)} the price sits in the ${bandNow} band of the power-law rainbow.`,
      framing: `We're in the ${bandNow} band — ${fPx(price)}. The standing "where on the rainbow" read.`,
      checkable: "Current price vs the frozen power-law band edges.", verify: chartLink("Rainbow", "rainbow") });
  }

  // 2) 20-week (140-day) heat — price vs its trailing average
  const win = Math.min(140, ph.length), ma = ph.slice(-win).reduce((s, p) => s + p.price, 0) / win;
  if (ma > 0) {
    const heat = price / ma, above = (heat - 1) * 100, hot = heat >= 1.25, cold = heat <= 0.8;
    out.push({ kind: (hot || cold) ? "change" : "state", lane: "heat20w", severity: (hot || cold) ? 4.8 : 2.6, emoji: cold ? "🧊" : "🌡️", card: "riskheat",
      headline: `${heat.toFixed(2)}× the 20-week average (${above >= 0 ? "+" : ""}${Math.round(above)}%)`,
      detail: `Spot ${fPx(price)} vs its ${win}-day moving average ${fPx(ma)} — ${hot ? "running hot above trend" : cold ? "stretched below trend" : "near its trend"}.`,
      framing: `SPX is ${heat.toFixed(2)}× its 20-week average (${above >= 0 ? "+" : ""}${Math.round(above)}%). ${hot ? "The heat card shows how extended it is." : cold ? "Deep-value stretch below trend." : "Riding its own mean."}`,
      checkable: "Price ÷ trailing 140-day mean of daily closes.", verify: chartLink("Risk Heat", "riskheat") });
  }

  // 3) Risk level 0–1 (+ round-threshold crossing)
  const rs = buildRiskSeries(m, ph), risk = rs.at(-1).risk, risk7 = rs[Math.max(0, rs.length - 8)]?.risk ?? risk;
  const cr = Math.floor(risk / 0.1) * 0.1, cr7 = Math.floor(risk7 / 0.1) * 0.1, crossed = cr !== cr7, rising = risk > risk7;
  out.push({ kind: crossed ? "change" : "state", lane: "risklevel", severity: crossed ? 5.0 : 2.7, emoji: rising ? "📈" : "📉", card: "risklevels",
    headline: crossed ? `Risk crossed ${cr > cr7 ? "above" : "below"} ${(cr > cr7 ? cr : cr7).toFixed(1)} — now ${risk.toFixed(2)}` : `Risk level ${risk.toFixed(2)} (${rising ? "rising" : "easing"})`,
    detail: `The rainbow risk (0 = fire-sale floor, 1 = euphoria) is ${risk.toFixed(2)}, ${rising ? "up" : "down"} from ${risk7.toFixed(2)} a week ago.`,
    framing: `Model risk is ${risk.toFixed(2)}${crossed ? ` — it just crossed ${(cr > cr7 ? cr : cr7).toFixed(1)}` : ""}. Low = the accumulation end; the levels card shows exactly where.`,
    checkable: "Log-residual of price vs the frozen model, min-max normalised over full history.", verify: chartLink("Risk Levels", "risklevels") });

  // 4) YTD vs the S&P 500 (+ flip this week)
  const sp = (data.spSeries || []).filter(r => Array.isArray(r) && r[1] > 0).sort((a, b) => a[0].localeCompare(b[0]));
  const yr = last.date.slice(0, 4), spx0 = ph.find(p => p.date >= `${yr}-01-01`), sp0 = sp.find(r => r[0] >= `${yr}-01-01`), spNow = sp.at(-1);
  if (spx0 && sp0 && spNow) {
    const spxR = price / spx0.price - 1, spR = spNow[1] / sp0[1] - 1, lead = spxR - spR, ahead = spxR >= spR;
    const spx7 = prev7.price / spx0.price - 1, sp7row = sp[Math.max(0, sp.length - 6)], sp7 = sp7row ? sp7row[1] / sp0[1] - 1 : spR;
    const flip = Math.sign(spxR - spR) !== Math.sign(spx7 - sp7);
    out.push({ kind: flip ? "change" : "state", lane: "ytd-vs-sp", severity: flip ? 5.2 : 2.4, emoji: ahead ? "🏆" : "🐌", card: "sp500ytd",
      headline: `YTD: SPX ${spxR >= 0 ? "+" : ""}${Math.round(spxR * 100)}% vs S&P ${spR >= 0 ? "+" : ""}${Math.round(spR * 100)}% — ${ahead ? "outperforming" : "trailing"}`,
      detail: `Year-to-date SPX6900 is ${spxR >= 0 ? "+" : ""}${(spxR * 100).toFixed(0)}% against the S&P 500's ${spR >= 0 ? "+" : ""}${(spR * 100).toFixed(0)}% — ${ahead ? `ahead by ${Math.round(lead * 100)}pp` : `behind by ${Math.round(-lead * 100)}pp`}${flip ? " (flipped this week)" : ""}.`,
      framing: `SPX6900 is ${ahead ? "beating" : "lagging"} the S&P 500 year-to-date (${Math.round(spxR * 100)}% vs ${Math.round(spR * 100)}%). ${flip ? "It just flipped this week — timely." : "The meme vs the index, same clock."}`,
      checkable: "Both indexed to their first close of the year; S&P from bundled + banked closes.", verify: chartLink("SPX vs S&P (YTD)", "sp500ytd") });
  }

  // 5) Calendar month green? (+ flip green this week)
  const mk = last.date.slice(0, 7), beforeMonth = ph.filter(p => p.date < `${mk}-01`).at(-1);
  if (beforeMonth && ph.filter(p => p.date.slice(0, 7) === mk).length >= 2) {
    const base = beforeMonth.price, mtd = price / base - 1, green = mtd >= 0;
    const flipped = green && ((prev7.price / base - 1) < 0);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mk.slice(5, 7) - 1];
    out.push({ kind: flipped ? "change" : "state", lane: "month-green", severity: flipped ? 5.0 : (green ? 2.5 : 2.2), emoji: green ? "🟢" : "🔴", card: "monthlyreturns",
      headline: `${MON} is ${mtd >= 0 ? "+" : ""}${Math.round(mtd * 100)}% so far — ${green ? "green" : "red"}`,
      detail: `Month-to-date SPX is ${mtd >= 0 ? "+" : ""}${(mtd * 100).toFixed(1)}% from ${fPx(base)}${flipped ? " — it flipped green this week" : ""}.`,
      framing: `${MON} is ${green ? "green" : "red"} at ${mtd >= 0 ? "+" : ""}${Math.round(mtd * 100)}%${flipped ? " — it just turned green, a good moment for" : " —"} the monthly-returns card.`,
      checkable: "Current price vs the last close of the prior month.", verify: chartLink("Monthly Returns", "monthlyreturns") });
  }

  return out;
}

// ── THE COMPREHENSIVE SCAN — quant.mjs angles folded in ───────────────────────
// The owner shouldn't have to enumerate signals. `computeAngles(stats)` (scripts/bot/quant.mjs)
// ALREADY scans the WHOLE dataset — valuation, MVRV, diamond, drawdown, funding/positioning,
// momentum, targets, vs-BTC, vs-S&P, fire-sale, heat, golden/death cross, cycle, F&G — and returns
// scored, card-mapped, framed reads. It was only ever fed to the "Ask the agent" LLM; here we fold
// it straight into the brief so the daily read is automatically comprehensive. The CLI computes the
// angles (it needs `stats`) and passes them in as data.angles; detectNotable just shapes them.
// A brand-new golden/death cross is a "change"; everything else is a standing "state" read. Scores
// (~0.3–3, already de-ranked for recently-fired cards) map onto the 0–10 severity scale.
function anglesToItems(angles) {
  if (!Array.isArray(angles)) return [];
  const CHANGE_KEYS = new Set(["cross-fresh", "firesale-rally"]);
  return angles.filter(a => a && a.headline).map(a => ({
    kind: CHANGE_KEYS.has(a.key) ? "change" : "state",
    lane: "angle-" + (a.key || a.card || a.headline),
    severity: Math.min(9, 2.5 + (a.score || 0) * 2),
    emoji: a.emoji || "•",
    card: a.card || null,
    headline: a.headline, detail: a.detail, framing: a.framing, note: a.note,
    // The card may be a tweet-only card (no site chart), so the actionable link is the Queue button
    // (data-sigq=card) in the panel, not a chart link that might 404. Verify is left to the Queue.
    verify: null,
    firedRecently: !!a.firedRecently,
  }));
}

// ── ENGINE ────────────────────────────────────────────────────────────────
// data: { history, legacy, onchain, cexFlow, selfMoves, smartMoney, exitFlow,
//         whaleCampaigns, aeonSales, aeonOnchain, valuation }
// aeonFlowFn: the shared aeonFlow(trades, holders, opts) (passed in to avoid a
//             hard import cycle; the CLI wires it). Output items carry kind:
//             "state" (always-on daily read) or "event" (a threshold-crossed move).
export function detectNotable(data = {}, aeonFlowFn = null, opts = {}) {
  // Show more, not fewer — the brief is a SCANNER the owner reads to pick content, so it should
  // surface every lane that has something to say (dedup is per-lane, so this can't spam). The old
  // cap of 12 buried the flexible market reads under events; 20 lets the band/heat/risk/YTD/month
  // scans + state reads all appear alongside any fresh moves.
  const topN = opts.topN ?? 40;
  const eventDays = opts.eventDays ?? 7;
  const refDate = data.onchain?.at?.(-1)?.d || data.history?.at?.(-1)?.d || null;
  // wallets already named by self-moves shouldn't double-count in whale-campaigns
  const splitSrcs = new Set((data.selfMoves?.events || []).map(e => (e.source || "").toLowerCase()).filter(Boolean));
  // Only wallets still in whales.json count as whales — the FIFO engine strips excluded infrastructure
  // (market makers / CEX) from it, so this can never surface an MM's trading inventory as a conviction
  // whale even if a stale whale-campaigns.json still lists it. null → no allowlist (unchanged behaviour).
  const knownWhales = data.whales?.wallets?.length
    ? new Set(data.whales.wallets.map(w => w.a?.toLowerCase()).filter(Boolean)) : null;

  const events = [
    ...cexFlow(data.cexFlow),
    ...selfMoves(data.selfMoves, refDate, eventDays),
    ...whaleCampaigns(data.whaleCampaigns, splitSrcs, knownWhales),
    ...smartMoney(data.smartMoney),
    ...aeonAccum(data.aeonSales, data.aeonOnchain, aeonFlowFn),
    ...onchainShift(data.onchain),
    ...concentrationShift(data.onchain),
    ...valuationDriver(data.valuation),
    ...exitSpike(data.exitFlow),
    ...fromLegacy(data.legacy),
  ].filter(Boolean).map(it => ({ ...it, kind: it.kind || "event" }));

  // READS = the comprehensive scan. quant's full angle set (data.angles) is the automatic
  // "everything worth noting" layer; the band/heat/risk/YTD/month market scans add the few reads
  // quant lacks. stateReads is only a FALLBACK for a data-less run (no angles) so the brief is
  // never blank. Deduped by CARD (fall back to lane) so the same card can't appear twice — the
  // repetition that made the old brief feel sterile.
  const base = [...marketScans(data), ...cityGrowth(data.cityHistory)];
  const reads = (data.angles && data.angles.length)
    ? [...base, ...anglesToItems(data.angles)]
    : [...base, ...stateReads(data)];

  // Events dedup by lane (one per on-chain lane); reads dedup by card||lane (one read per card).
  const evByLane = new Map();
  for (const it of events) { const c = evByLane.get(it.lane); if (!c || it.severity > c.severity) evByLane.set(it.lane, it); }
  const rdByKey = new Map();
  for (const it of reads) { const k = it.card || it.lane; const c = rdByKey.get(k); if (!c || it.severity > c.severity) rdByKey.set(k, it); }
  const ranked = [...evByLane.values(), ...rdByKey.values()].sort((a, b) => b.severity - a.severity).slice(0, topN)
    .map((it, i) => ({ rank: i + 1, ...it, severity: Math.round(it.severity * 10) / 10 }));

  const eventCount = ranked.filter(it => it.kind === "event").length;
  return { date: refDate, generated: refDate, count: ranked.length, eventCount, items: ranked };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// node scripts/bot/notable.mjs [--out public/notable.json]
// Reads the committed public/*.json surfaces, runs the detectors, writes the brief.
// Runs in the daily cron after every surface has refreshed. Missing files are fine
// (a detector just returns nothing).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const { detectSignals } = await import("./signals.mjs");
  const { aeonFlow } = await import("../../src/aeon-flow.js");
  const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=public/notable.json").slice(6);
  const read = f => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; } catch { return null; } };

  const history = read("public/history.json") || [];
  // Dense daily SPX closes for the band/heat/risk/YTD/month scans (1000+ rows since launch).
  const phRaw = read("public/price-history.json");
  const priceHistory = Array.isArray(phRaw?.prices) ? phRaw.prices : (Array.isArray(phRaw) ? phRaw : []);
  // S&P closes: bundled history extended (and made current) by the daily-banked `sp` in history.json.
  const { SP500_HISTORY } = await import("../../src/sp500-history.js");
  const spMap = new Map(SP500_HISTORY.map(([d, c]) => [d, c]));
  for (const r of history) if (r.sp > 0) spMap.set(r.d, r.sp);
  const spSeries = [...spMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // THE COMPREHENSIVE SCAN: build the same `stats` the site + agent use, then run the full quant
  // angle set over it (valuation/on-chain/positioning/momentum/cross-asset/technicals/cycle). This
  // is what makes the brief automatically cover the whole dataset instead of a hand-picked list.
  // Soft — if stats/angles can't be built, the brief falls back to its own detectors + state reads.
  let angles = null;
  try {
    const { computeStats } = await import("./stats.mjs");
    const { computeAngles } = await import("./quant.mjs");
    const price = priceHistory.at(-1)?.price || history.at(-1)?.p || 0;
    if (price > 0) {
      const recent = (read("public/post-state.json")?.recent || []).map(r => r.id || r).filter(Boolean);
      // computeStats wants history as [{date,price}] — price-history.json is exactly that (dense daily
      // closes). Passing the raw history.json ({d,p}) would leave firstPrice/allTimeReturn NaN.
      const stats = computeStats(price, priceHistory.at(-1)?.date, { history: priceHistory });
      angles = computeAngles(stats, { recent });
    }
  } catch (e) { console.error("notable: quant angles unavailable —", e.message); }

  const data = {
    history, priceHistory, spSeries, angles,
    legacy: detectSignals(history),
    onchain: read("public/onchain.json"),
    cexFlow: read("public/cex-flow.json"),
    selfMoves: read("public/self-moves.json"),
    smartMoney: read("public/smart-money.json"),
    exitFlow: read("public/exit-flow.json"),
    whaleCampaigns: read("public/whale-campaigns.json"),
    whales: read("public/whales.json"),
    aeonSales: read("public/aeon-sales.json"),
    aeonOnchain: read("public/aeon-onchain.json"),
    valuation: read("public/valuation.json"),
    cityHistory: read("public/city-history.json"),
  };
  const brief = detectNotable(data, aeonFlow);
  writeFileSync(out, JSON.stringify(brief));
  console.error(`notable: ${brief.count} items → ${out} (${brief.date})`);
  for (const it of brief.items) console.error(`  ${it.rank}. [${it.severity}] ${it.emoji} ${it.headline}`);
}
