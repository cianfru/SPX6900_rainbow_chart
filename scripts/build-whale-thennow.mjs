// Precompute the "Whales Then vs Now" panels → public/whale-thennow.json, so the card (and the og
// function) read a small file instead of scanning the 3 MB spx-timeline.json. Runs after the timeline
// is rebuilt (onchain-dune.yml). The heavy reconstruction lives in whale-thennow-card.mjs.
import { writeFileSync } from "node:fs";
import { computeThenNow } from "./bot/whale-thennow-card.mjs";

const data = computeThenNow();
if (!data) { console.error("whale-thennow: no timeline / NRPL peaks yet — skipped"); process.exit(0); }

const out = {
  updated: data.updated,
  peaks: data.peaks,
  panels: data.panels.map(p => ({
    title: p.title, date: p.date, total: p.total, buy: p.buy, sell: p.sell, flat: p.flat,
    rows: p.rows.map(r => ({ net: Math.round(r.net), bal: Math.round(r.bal) })),
  })),
};
writeFileSync("public/whale-thennow.json", JSON.stringify(out));
console.error(`whale-thennow: ${out.panels.map(p => `${p.title} ${p.total}w`).join(" · ")} → public/whale-thennow.json`);
