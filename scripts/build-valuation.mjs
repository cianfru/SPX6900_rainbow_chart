// Compute the valuation composite (scripts/bot/valuation-composite.mjs) and write
// public/valuation.json — the historical over/under-valued oscillator + today's weighted
// lens breakdown. The site's ValuationComposite chart reads this; regenerated daily by the
// snapshot cron so it stays fresh. Standalone: reads the latest price/date from history.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeStats } from "./bot/stats.mjs";
import { valuationComposite, ZONES } from "./bot/valuation-composite.mjs";
import { DEFAULT_RAW } from "../src/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let price = DEFAULT_RAW.at(-1).price, date = DEFAULT_RAW.at(-1).date;
try {
  const hist = JSON.parse(readFileSync(join(root, "public/history.json"), "utf8"));
  const last = [...hist].reverse().find(r => r.p > 0);
  if (last) { price = last.p; date = last.d; }
} catch { /* use bundle */ }

const s = computeStats(price, date);
// Feed Bitcoin's MVRV history for the cross-asset anchor (falls back to SPX-only if absent).
if (!s.btcMvrv) { try { s.btcMvrv = JSON.parse(readFileSync(join(root, "public/btc-mvrv.json"), "utf8")); } catch { /* SPX-only */ } }
const { series, cur, axes } = valuationComposite(s);
if (!series.length || !cur) { console.error("no composite series produced"); process.exit(1); }

const out = {
  updated: date,
  axes: axes.map(a => ({ key: a.key, label: a.label, weight: a.weight, blurb: a.blurb, members: a.members.map(m => ({ key: m.key, label: m.label, crossAsset: !!m.crossAsset })) })),
  zones: ZONES,
  series: series.map(p => [p.ts, p.composite, p.n]),
  cur: { composite: cur.composite, byAxis: cur.byAxis, byLens: cur.byLens },
};
writeFileSync(join(root, "public/valuation.json"), JSON.stringify(out));
const z = ZONES.find(z => cur.composite < z.max) || ZONES.at(-1);
console.log(`wrote public/valuation.json — ${series.length} days · today ${(cur.composite * 100).toFixed(0)}% (${z.label})`);
