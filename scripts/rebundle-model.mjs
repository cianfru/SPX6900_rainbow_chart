// Model re-fit hygiene. The power-law fit is frozen on the bundled DEFAULT_RAW,
// and the launch-era exponent is steep — left alone, the fair-value center
// marches up ~0.5–1¢/day, faster than a flat price, so price drifts down through
// the rainbow and can fall off the bottom (Fire Sale floor). See CLAUDE.md.
//
// This appends recent daily closes from public/history.json (the snapshot cron
// keeps it current) to DEFAULT_RAW — thinned to ~weekly to match the bundled
// cadence — and rewrites src/data.js so buildModel re-fits on maturing data.
//
//   node scripts/rebundle-model.mjs --check   → MONITOR only: print where a
//       re-fit would move the exponent/center/band; does NOT touch src/data.js.
//   node scripts/rebundle-model.mjs           → APPLY: rewrite DEFAULT_RAW.
//
// Policy (see CLAUDE.md): run --check ~monthly to watch the drift, but only
// APPLY when price has UNDERSHOT the lower band for a sustained stretch (the
// model genuinely failing to contain price) — not reactively the moment Fire
// Sale fires (that's a rare, valuable signal; re-fitting it away is goal-seeking).
import { readFileSync, writeFileSync } from "node:fs";
import * as M from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";

const CHECK = process.argv.includes("--check");
const WEEK = 6; // min day-gap between kept points
const snaps = JSON.parse(readFileSync(new URL("../public/history.json", import.meta.url), "utf8"))
  .filter(x => x.p > 0).map(x => ({ date: x.d, price: x.p }));
const lastBundled = DEFAULT_RAW.at(-1).date;
const fresh = snaps.filter(x => x.date > lastBundled);
const thinned = [];
for (const r of fresh) if (!thinned.length || M.dayN(r.date) - M.dayN(thinned.at(-1).date) >= WEEK) thinned.push(r);
if (fresh.length && thinned.at(-1)?.date !== fresh.at(-1).date) thinned.push(fresh.at(-1)); // always end on the latest

if (!thinned.length) {
  console.log(`No snapshots beyond ${lastBundled} — DEFAULT_RAW already current, nothing to do.`);
  process.exit(0);
}

const merged = [...DEFAULT_RAW, ...thinned];
const report = (label, RAW) => {
  const m = M.buildModel(RAW), d = M.dayN(RAW.at(-1).date), price = RAW.at(-1).price;
  console.log(`  ${label}: a=${m.a.toFixed(2)}  R²=${m.r2.toFixed(3)}  center $${Math.exp(m.predict(d)).toFixed(4)}  · last price $${price.toFixed(4)} → ${M.BAND_LABELS[M.bandIndex(m, price, d)].l}`);
};
console.log(`Re-bundle: appending ${thinned.length} point(s) (${thinned[0].date} → ${thinned.at(-1).date}), ${DEFAULT_RAW.length} → ${merged.length} points`);
report("before", DEFAULT_RAW);
report("after ", merged);

if (CHECK) {
  console.log(`\n(--check) src/data.js left UNCHANGED. Re-run without --check to apply, but only on a sustained undershoot (see CLAUDE.md).`);
  process.exit(0);
}

const url = new URL("../src/data.js", import.meta.url);
const text = readFileSync(url, "utf8");
const updated = text.replace(/^export const DEFAULT_RAW = \[.*?\];/s, `export const DEFAULT_RAW = ${JSON.stringify(merged)};`);
if (updated === text) { console.error("ERROR: could not locate the DEFAULT_RAW literal in src/data.js"); process.exit(1); }
writeFileSync(url, updated);
console.log(`\nUpdated src/data.js. Review the band shift above, then: npm run build && node --test 'test/**/*.test.mjs' && commit.`);
