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
function selfMoves(sm, refDate) {
  const evs = sm?.events; if (!Array.isArray(evs) || !evs.length) return [];
  // Prefer RECENT moves and drop ones older than ~45 days (when datable), so the brief
  // stays fresh instead of re-surfacing the same month-old split every day.
  const cand = evs.filter(e => e.supply >= 200_000)
    .map(e => ({ e, age: refDate ? daysBetween(e.date, refDate) : null }))
    .filter(x => x.age == null || x.age <= 45);
  const recent = cand.sort((a, b) => (b.e.supply || 0) - (a.e.supply || 0)).slice(0, 2);
  return recent.map(({ e, age }) => {
    const split = e.type === "split";
    let sev = Math.min(9, 4 + Math.log10((e.supply || 1) / 1e5) * 2);
    if (age != null && age > 14) sev *= 0.85;   // fade older moves so fresh ones lead
    const ago = age != null && age > 3 ? ` (${age}d ago)` : "";
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
function whaleCampaigns(wc, exclude = new Set()) {
  const ws = (wc?.wallets || []).filter(w => w.a && !exclude.has(w.a.toLowerCase()) && Math.abs(w.net || 0) >= 300_000);
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

// 8) Departure spike — an unusually heavy day of holders leaving (≥5k → below).
function exitSpike(ef) {
  const days = ef?.days; if (!Array.isArray(days) || days.length < 30) return [];
  const totals = days.map(d => (d[1] || 0) + (d[2] || 0));   // profit-exits + loss-exits
  const z = zLast(totals);
  if (z < 1.5) return [];
  const last = days.at(-1), n = (last[1] || 0) + (last[2] || 0), lossShare = n ? (last[2] || 0) / n : 0;
  return [{
    lane: "exits", severity: Math.min(6, 2.5 + z), emoji: "🚪",
    headline: `A heavier day of holders leaving (${n} wallets)`,
    detail: `${last[0]}: ${z.toFixed(1)}σ above the usual daily churn. ${Math.round((1 - lossShare) * 100)}% left in profit${lossShare > 0.5 ? " — but loss-exits led, unusual" : ""}.`,
    framing: `An above-average day of departures (${n} wallets, ${Math.round((1 - lossShare) * 100)}% in profit). Churn is normal; a spike with loss-exits leading would be the worrying version.`,
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

// ── ENGINE ────────────────────────────────────────────────────────────────
// data: { history, legacy, onchain, cexFlow, selfMoves, smartMoney, exitFlow,
//         whaleCampaigns, aeonSales, aeonOnchain, valuation }
// aeonFlowFn: the shared aeonFlow(trades, holders, opts) (passed in to avoid a
//             hard import cycle; the CLI wires it). Output items carry kind:
//             "state" (always-on daily read) or "event" (a threshold-crossed move).
export function detectNotable(data = {}, aeonFlowFn = null, opts = {}) {
  const topN = opts.topN ?? 12;
  const refDate = data.onchain?.at?.(-1)?.d || data.history?.at?.(-1)?.d || null;
  // wallets already named by self-moves shouldn't double-count in whale-campaigns
  const splitSrcs = new Set((data.selfMoves?.events || []).map(e => (e.source || "").toLowerCase()).filter(Boolean));

  const events = [
    ...cexFlow(data.cexFlow),
    ...selfMoves(data.selfMoves, refDate),
    ...whaleCampaigns(data.whaleCampaigns, splitSrcs),
    ...smartMoney(data.smartMoney),
    ...aeonAccum(data.aeonSales, data.aeonOnchain, aeonFlowFn),
    ...onchainShift(data.onchain),
    ...concentrationShift(data.onchain),
    ...valuationDriver(data.valuation),
    ...exitSpike(data.exitFlow),
    ...fromLegacy(data.legacy),
  ].filter(Boolean).map(it => ({ ...it, kind: it.kind || "event" }));

  // always-on state block + the events, one item per lane (the strongest), ranked.
  const items = [...events, ...stateReads(data)];
  const byLane = new Map();
  for (const it of items) { const cur = byLane.get(it.lane); if (!cur || it.severity > cur.severity) byLane.set(it.lane, it); }
  const ranked = [...byLane.values()].sort((a, b) => b.severity - a.severity).slice(0, topN)
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
  const data = {
    history,
    legacy: detectSignals(history),
    onchain: read("public/onchain.json"),
    cexFlow: read("public/cex-flow.json"),
    selfMoves: read("public/self-moves.json"),
    smartMoney: read("public/smart-money.json"),
    exitFlow: read("public/exit-flow.json"),
    whaleCampaigns: read("public/whale-campaigns.json"),
    aeonSales: read("public/aeon-sales.json"),
    aeonOnchain: read("public/aeon-onchain.json"),
    valuation: read("public/valuation.json"),
  };
  const brief = detectNotable(data, aeonFlow);
  writeFileSync(out, JSON.stringify(brief));
  console.error(`notable: ${brief.count} items → ${out} (${brief.date})`);
  for (const it of brief.items) console.error(`  ${it.rank}. [${it.severity}] ${it.emoji} ${it.headline}`);
}
