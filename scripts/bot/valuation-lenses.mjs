// Shared valuation lenses for the "Am I Cheap?" convergence dashboard. Reads N
// independent lenses off the live stats and classifies each cheap/neutral/rich, so the
// card AND the tweet copy read from ONE source (no drift). A valuation-POSITION read,
// never a buy signal. No Resvg import here so posts.mjs/tests can use it freely.
import * as M from "../../src/models.js";

// → [{ name, phrase, state }] for whatever lenses have data.
export function lenses(s) {
  const g = [];
  if (s.band && s.bandIndex != null)
    g.push({ name: "Rainbow band", phrase: s.band.l, state: s.bandIndex <= 2 ? "cheap" : s.bandIndex >= 6 ? "rich" : "neutral" });
  if (s.supply?.breakEven > 0 && s.price > 0) {
    const m = s.price / s.supply.breakEven;
    g.push({ name: "MVRV · cost basis", phrase: `${m.toFixed(2)}× · ${m < 1 ? "underwater" : "in profit"}`, state: m < 1 ? "cheap" : m > 2 ? "rich" : "neutral" });
  }
  if (s.onchain?.length) {
    const sip = s.onchain.at(-1).sip;
    g.push({ name: "Supply in profit", phrase: `${sip.toFixed(0)}% · ${sip < 50 ? "mostly underwater" : "mostly green"}`, state: sip < 45 ? "cheap" : sip > 80 ? "rich" : "neutral" });
  }
  const pc = M.piCycleRatio(s.drawn || []);
  if (pc.rows.length >= 60) {
    const r = pc.cur.ratio, st = M.piCycleState(r, pc.zones);
    g.push({ name: "Pi Cycle · trend", phrase: `${r.toFixed(2)} · ${st.label}`, state: r < pc.zones.accum ? "cheap" : r > pc.zones.top ? "rich" : "neutral" });
  }
  if (s.fng != null)
    g.push({ name: "Fear & Greed", phrase: `${s.fng} · ${s.fng < 30 ? "fear" : s.fng > 70 ? "greed" : "neutral"}`, state: s.fng < 30 ? "cheap" : s.fng > 70 ? "rich" : "neutral" });
  return g;
}

// Tally + overall verdict (cheap / rich / mixed) from the lenses.
export function tally(s) {
  const g = lenses(s);
  const cheap = g.filter(x => x.state === "cheap").length;
  const rich = g.filter(x => x.state === "rich").length;
  const verdict = cheap > rich && cheap >= g.length / 2 ? "cheap" : rich > cheap ? "rich" : "neutral";
  return { lenses: g, total: g.length, cheap, rich, verdict };
}
