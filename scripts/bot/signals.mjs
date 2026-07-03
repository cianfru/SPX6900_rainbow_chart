// Daily anomaly detector for the control panel's "⚡ Notable today" strip.
// Scans the banked daily snapshots (public/history.json) for on-chain / crowd
// changes worth a one-off post OVER the normal rotation — complementary to
// band-watch (price/band crossings) and milestone-watch (meme prices), which
// already own those dimensions, so this focuses on the holder/valuation side.
//
// It only NOTICES. A human approves + frames the post. The goal is to surface
// genuinely INTERESTING true angles worth posting — NOT to debunk events into a
// dry logbook. So every signal LEADS with the honest hook (`framing`) and uses
// `note` only as a narrow fence around the one thing you can't claim. Example: a
// diamond-share jump is a real "held through → matured into the strongest tier =
// conviction" story worth telling; the note just keeps it "held," not "bought."
// Honest AND interesting — both are required; honesty is the moat, interest is
// the point.
const SUPPLY = 939_000_000;
const fPx = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(p < 0.01 ? 4 : 3));
const fNum = n => Math.round(n).toLocaleString("en-US");
const diamondPct = r => (r?.sup?.diamond != null ? (r.sup.diamond / SUPPLY) * 100 : null);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

// history: the full array from public/history.json (each {d,p,holders,be,fng,sup,…}).
// Returns { date, signals: [{ type, severity, emoji, title, detail, framing, note, card }] }.
export function detectSignals(history) {
  const h = (history || []).filter(r => r && r.d);
  if (h.length < 2) return { date: h.at(-1)?.d ?? null, signals: [] };
  const today = h.at(-1), prev = h.at(-2);
  const sig = [];

  // 1) Average holder flips profit / underwater — price crosses the crowd's cost
  //    basis (break-even). Factual and resonant; no interpretation risk.
  if (today.be > 0 && prev.be > 0 && today.p > 0 && prev.p > 0) {
    const nowAbove = today.p >= today.be, prevAbove = prev.p >= prev.be;
    if (nowAbove !== prevAbove) {
      sig.push(nowAbove ? {
        type: "breakeven-cross", severity: 5, emoji: "🟢",
        title: "Average holder back in profit",
        detail: `Price ${fPx(today.p)} reclaimed the crowd's cost basis ${fPx(today.be)}.`,
        framing: `The average SPX6900 holder is green again — price crossed back above the on-chain average cost basis (${fPx(today.be)}). Factual, resonant.`,
        note: "", card: "breakeven",
      } : {
        type: "breakeven-cross", severity: 5, emoji: "🔴",
        title: "Average holder went underwater",
        detail: `Price ${fPx(today.p)} slipped below the crowd's cost basis ${fPx(today.be)}.`,
        framing: `The average holder is now underwater — price dipped below the on-chain average cost basis (${fPx(today.be)}). Honest dip context; pairs with the Fire Sale narrative.`,
        note: "", card: "breakeven",
      });
    }
  }

  // 2) Holder-count surge — REAL new wallets (distinct from tier reclassification).
  //    Baseline = the daily deltas over the trailing ~30 days, today excluded.
  if (today.holders != null && prev.holders != null) {
    const deltas = [];
    for (let i = Math.max(1, h.length - 30); i < h.length; i++)
      if (h[i].holders != null && h[i - 1].holders != null) deltas.push(h[i].holders - h[i - 1].holders);
    const d = today.holders - prev.holders;
    const base = deltas.slice(0, -1); // exclude today's delta from the baseline
    if (base.length >= 5) {
      const mu = mean(base), sd = std(base) || 1;
      if (d > 150 && d > mu + 2.2 * sd) {
        sig.push({
          type: "holder-surge", severity: 4, emoji: "📈",
          title: `Holder count jumped +${fNum(d)} in a day`,
          detail: `${fNum(today.holders)} on-chain wallets (~${fNum(Math.max(0, mu))}/day is normal).`,
          framing: `+${fNum(d)} new wallets in a day vs ~${fNum(Math.max(0, mu))} typical — real accumulation (more unique holders). Lands hardest on a RED day: conviction while price falls.`,
          note: "Holder COUNT growth = genuinely new wallets (unlike a diamond-tier reclassification), so this one IS safe to frame as accumulation.",
          card: "diamondtrend",
        });
      }
    }
  }

  // 3) Diamond-tier SHARE jump — usually AGING (gold→diamond crossing the holding
  //    -age threshold), NOT accumulation. Guardrailed: compare the diamond gain to
  //    the gold loss and tell the owner which it is.
  const dNow = diamondPct(today), dPrev = diamondPct(prev);
  if (dNow != null && dPrev != null) {
    const dpp = dNow - dPrev;
    if (Math.abs(dpp) >= 0.5) {
      const dDia = today.sup.diamond - prev.sup.diamond;
      const dGold = (today.sup.gold ?? 0) - (prev.sup.gold ?? 0);
      const aging = dDia > 0 && dGold < 0 && Math.abs(dDia + dGold) < Math.abs(dDia) * 0.5;
      const up = fNum(Math.abs(dDia));
      sig.push({
        type: "diamond-jump", severity: 3, emoji: "💎",
        title: `Diamond share ${dpp >= 0 ? "up" : "down"} ${(dpp >= 0 ? "+" : "") + dpp.toFixed(1)}pp → ${dNow.toFixed(1)}%`,
        detail: `${fNum(today.sup.diamond)} SPX now in the longest-held tier.`,
        framing: aging
          ? `Post it — ~${up} SPX just aged into DIAMOND hands (the longest-held, rarely-sold tier). Coins reach it only by being HELD through everything, not by trading — supply maturing into strong hands, conviction deepening. Diamond hands earning the name.`
          : `Diamond share moved ${(dpp >= 0 ? "+" : "") + dpp.toFixed(1)}pp — a conviction/holding read. Glance at the tier deltas so you word it right (aged-in vs genuinely new long-term supply).`,
        note: aging
          ? `Word it as HELD, not BOUGHT: the +${up} came from a cohort aging in from gold (≈ gold ${fNum(dGold)}), not fresh demand. "Held into diamond" ✓ · "diamonds bought ${up}" ✗.`
          : "Compare diamond vs gold delta so the wording is accurate (aged-in vs new long-term supply).",
        card: "diamondtrend",
      });
    }
  }

  // 4) Fear & Greed hits an extreme (0–100; fires only on the day it crosses in).
  if (typeof today.fng === "number") {
    const wasCalm = typeof prev.fng !== "number" || (prev.fng > 20 && prev.fng < 80);
    if (today.fng <= 20 && wasCalm) {
      sig.push({ type: "fng-extreme", severity: 2, emoji: "🧊", title: `Fear & Greed at ${today.fng} — extreme fear`, detail: "The market mood just hit extreme fear.", framing: `Crypto Fear & Greed at ${today.fng} (extreme fear) — historically the zone the patient get rewarded. Pairs with the Fire Sale / valuation cards.`, note: "", card: "fngdial" });
    } else if (today.fng >= 80 && wasCalm) {
      sig.push({ type: "fng-extreme", severity: 2, emoji: "🔥", title: `Fear & Greed at ${today.fng} — extreme greed`, detail: "The market mood just hit extreme greed.", framing: `Crypto Fear & Greed at ${today.fng} (extreme greed) — a "mind the heat" note. Honest counter-signal, distinct from hype.`, note: "", card: "fngdial" });
    }
  }

  sig.sort((a, b) => b.severity - a.severity);
  return { date: today.d, signals: sig.slice(0, 3) };
}
