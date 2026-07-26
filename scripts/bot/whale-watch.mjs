// ============================================================================
// WHALE WATCH — fires when the whale cohort has actually moved
// ============================================================================
//   node scripts/bot/whale-watch.mjs [--track=spx|aeon] [--dry-run]
//
// Both tracks now carry a whale-supply series (onchain.json whalePct, aeon-onchain.json
// dist.whaleTok), and the interesting thing about both is that they move slowly. That
// makes the threshold the entire design problem: set it low and this becomes a weekly
// noise generator that trains people to ignore it.
//
// So the thresholds are measured, not guessed. Over the full history of each track the
// four-week change in whale share distributes like this:
//
//            median   p90    p97    max
//   SPX      0.72pp   3.03   7.21   9.04
//   AEON     0.54pp   2.12   4.23   7.38
//
// A four-week window rather than one week, because a single week is mostly noise on a
// metric this slow. The bars below sit near each track's p95 and were chosen by counting
// how often they would actually have fired across the whole series:
//
//   SPX  2.5pp → 5 fires in 2.9 years (1.7/yr)
//   AEON 2.0pp → 5 fires in 2.7 years (1.9/yr)
//
// About twice a year each. If it starts firing monthly, the threshold is wrong, not the
// market. A 8-week cooldown stops one slow drift being reported as several events.
//
// HUMAN-IN-THE-LOOP, like the anomaly detector: this writes a candidate and posts
// nothing on its own. Whale distribution is a loaded thing to assert and the framing
// deserves a human.
import { readFileSync, writeFileSync } from "node:fs";

const arg = (k, d) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.split("=")[1] : d; };
const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

export const TRACKS = {
  spx: { label: "SPX6900", thr: 2.5, unit: "of supply", who: "wallets holding 0.1%+ of supply" },
  aeon: { label: "Project AEON", thr: 2.0, unit: "of the collection", who: "wallets holding 11+ AEON" },
};
const WINDOW = 4;        // weeks
const COOLDOWN = 8;      // weeks between fires on one track

/** Whale-share series for a track: [{ d, pct, n }]. */
export function seriesFor(track, data) {
  if (track === "spx") {
    return (data || [])
      .filter(r => r?.whalePct > 0 && r?.holders > 1000)
      .map(r => ({ d: r.d, pct: r.whalePct, n: r.whaleN }));
  }
  return (data?.series || [])
    .filter(r => r?.held > 0 && r?.dist?.whaleTok != null)
    .map(r => ({ d: r.d, pct: (r.dist.whaleTok / r.held) * 100, n: r.dist.whale }));
}

/**
 * The move, if there is one. Compares the latest point to WINDOW weeks earlier and
 * returns null unless it clears the track's measured bar.
 */
export function detect(track, series, { posted = new Set() } = {}) {
  const t = TRACKS[track];
  if (!t || series.length < WINDOW + 2) return null;
  const cur = series.at(-1), prev = series[series.length - 1 - WINDOW];
  if (!cur || !prev) return null;
  const delta = cur.pct - prev.pct;
  if (Math.abs(delta) < t.thr) return null;
  if (posted.has(`${track}@${cur.d}`)) return null;
  return {
    track, label: t.label, who: t.who, unit: t.unit,
    d: cur.d, from: prev.d,
    pct: cur.pct, prevPct: prev.pct, delta,
    n: cur.n, prevN: prev.n,
    direction: delta > 0 ? "accumulating" : "distributing",
  };
}

/** Whether a fire is too close to the last one on the same track. */
export function inCooldown(track, series, state) {
  const last = state?.lastFired?.[track];
  if (!last) return false;
  const i = series.findIndex(r => r.d === last);
  if (i < 0) return false;
  return (series.length - 1 - i) < COOLDOWN;
}

/** Copy in house style: three lines, the number first, the caveat last. */
export function whaleCopy(m) {
  const dir = m.delta > 0 ? "added" : "shed";
  const pp = Math.abs(m.delta).toFixed(1);
  const countNote = m.n === m.prevN
    ? `Still ${m.n} of them`
    : `${m.prevN} → ${m.n} wallets`;
  return `🐋 ${m.label} whales have ${dir} ${pp} points ${m.unit} in four weeks — now ${m.pct.toFixed(0)}%.

${countNote}, so this is the cohort changing its position rather than changing size. ${m.who}, exchanges and contracts excluded.

A month is a short window on a slow measure. Position, not a signal.`;
}

const STATE = "public/whale-state.json";

function main() {
  const only = arg("track", "");
  const state = readJson(STATE) || { lastFired: {}, posted: [] };
  const posted = new Set(state.posted || []);
  const found = [];

  for (const track of Object.keys(TRACKS)) {
    if (only && only !== track) continue;
    const data = track === "spx" ? readJson("public/onchain.json") : readJson("public/aeon-onchain.json");
    const series = seriesFor(track, data);
    if (series.length < WINDOW + 2) { console.log(`${track}: not enough history`); continue; }
    const latest = series.at(-1);
    const move = detect(track, series, { posted });
    if (!move) {
      const prev = series[series.length - 1 - WINDOW];
      const d = prev ? (latest.pct - prev.pct) : 0;
      console.log(`${track}: quiet — ${d >= 0 ? "+" : ""}${d.toFixed(2)}pp over ${WINDOW}w (bar ${TRACKS[track].thr}pp), whales at ${latest.pct.toFixed(1)}%`);
      continue;
    }
    if (inCooldown(track, series, state)) { console.log(`${track}: ${move.delta.toFixed(2)}pp move but within the ${COOLDOWN}-week cooldown`); continue; }
    console.log(`${track}: ⚡ ${move.direction} — ${move.delta >= 0 ? "+" : ""}${move.delta.toFixed(2)}pp over ${WINDOW}w, now ${move.pct.toFixed(1)}%`);
    found.push({ ...move, copy: whaleCopy(move) });
  }

  // Candidates only — nothing here posts. The control panel surfaces them for review.
  writeFileSync("public/whale-signals.json", JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    window: WINDOW, cooldownWeeks: COOLDOWN,
    thresholds: Object.fromEntries(Object.entries(TRACKS).map(([k, v]) => [k, v.thr])),
    signals: found,
  }, null, 1) + "\n");
  console.log(`whale-watch: ${found.length} candidate${found.length === 1 ? "" : "s"} → public/whale-signals.json (review before posting)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
