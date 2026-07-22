// Compute the valuation composite (scripts/bot/valuation-composite.mjs) and write
// public/valuation.json — the historical over/under-valued oscillator + today's weighted
// lens breakdown. The site's ValuationComposite chart reads this; regenerated daily by the
// snapshot cron so it stays fresh. Standalone: reads the latest price/date from history.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeStats } from "./bot/stats.mjs";
import { valuationComposite, INDICATORS, ZONES } from "./bot/valuation-composite.mjs";
import { DEFAULT_RAW } from "../src/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let price = DEFAULT_RAW.at(-1).price, date = DEFAULT_RAW.at(-1).date;
try {
  const hist = JSON.parse(readFileSync(join(root, "public/history.json"), "utf8"));
  const last = [...hist].reverse().find(r => r.p > 0);
  if (last) { price = last.p; date = last.d; }
} catch { /* use bundle */ }

const s = computeStats(price, date);
const { series, cur, indicators } = valuationComposite(s);
if (!series.length || !cur) { console.error("no composite series produced"); process.exit(1); }

const out = {
  updated: date,
  indicators: indicators.map(i => ({ key: i.key, label: i.label, group: i.group, weight: i.weight })),
  zones: ZONES,
  series: series.map(p => [p.ts, p.composite, p.n]),
  cur: { composite: cur.composite, byLens: cur.byLens },
};
writeFileSync(join(root, "public/valuation.json"), JSON.stringify(out));
const z = ZONES.find(z => cur.composite < z.max) || ZONES.at(-1);
console.log(`wrote public/valuation.json — ${series.length} weeks · today ${(cur.composite * 100).toFixed(0)}% (${z.label})`);
