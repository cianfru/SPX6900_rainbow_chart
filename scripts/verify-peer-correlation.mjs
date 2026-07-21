// Free local sanity check: does SPX6900's DAILY RETURN co-move with AIXBT and BITCOIN(HPOS10I)?
// Mirrors dune/spx6900_correlation.sql (Pearson r on daily % returns, joined by day) but runs
// on data already in hand — SPX_DAILY (bundled) + the Dune dex.trades daily closes — so $0, no credits.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SPX_DAILY } from "../src/spx-daily.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// CSV → Map<day, price>. Uses median_usd (robust to a single outlier print).
function loadCsv(path, priceCol = "median_usd") {
  const lines = readFileSync(join(root, path), "utf8").trim().split("\n");
  const head = lines[0].split(",");
  const di = head.indexOf("day"), pi = head.indexOf(priceCol);
  const m = new Map();
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const day = c[di].replace(/"/g, "");
    m.set(day, Number(c[pi]));
  }
  return m;
}

const spx = new Map(SPX_DAILY.map(([d, p]) => [d, p]));
const series = {
  AIXBT: loadCsv("dune/out/aixbt_dex_daily.csv"),
  BITCOIN: loadCsv("dune/out/bitcoin_hpos10i_dex_daily.csv"),
};

const pearson = (x, y) => {
  const n = x.length, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(x), my = mean(y);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { cov += (x[i]-mx)*(y[i]-my); vx += (x[i]-mx)**2; vy += (y[i]-my)**2; }
  return cov / Math.sqrt(vx * vy);
};
// Spearman = Pearson on ranks (outlier-robust).
const rank = (a) => {
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  idx.forEach(([, i], k) => { r[i] = k + 1; });
  return r;
};
const spearman = (x, y) => pearson(rank(x), rank(y));

// Returns over the days BOTH series share. skipN drops the first N shared days (early launch noise).
function returnsPair(a, b, skipN = 0) {
  const days = [...a.keys()].filter((d) => b.has(d)).sort();
  const ra = [], rb = [];
  for (let i = 1 + skipN; i < days.length; i++) {
    const pa0 = a.get(days[i - 1]), pa1 = a.get(days[i]);
    const pb0 = b.get(days[i - 1]), pb1 = b.get(days[i]);
    if (pa0 > 0 && pb0 > 0) { ra.push(pa1 / pa0 - 1); rb.push(pb1 / pb0 - 1); }
  }
  return { ra, rb, first: days[1 + skipN], last: days.at(-1) };
}

console.log("SPX6900 daily-returns correlation (local, from data in hand)\n");
console.log("peer      pearson  spearman  pearson(skip 30d)   n     window");
for (const [name, s] of Object.entries(series)) {
  const full = returnsPair(spx, s);
  const trim = returnsPair(spx, s, 30);
  const p = pearson(full.ra, full.rb);
  const sp = spearman(full.ra, full.rb);
  const pt = pearson(trim.ra, trim.rb);
  console.log(
    `${name.padEnd(8)}  ${p.toFixed(3)}    ${sp.toFixed(3)}     ${pt.toFixed(3)}` +
    `               ${String(full.ra.length).padStart(4)}  ${full.first} → ${full.last}`
  );
}
