// RESEMBLANCE SCAN — which coin's trajectory best rhymes with SPX6900's at the SAME age?
// For a basket of candidate coins (majors + L1s + alts, NOT just memekings), fetch full
// daily history from CryptoCompare (CI-reachable; blocked from the dev sandbox), rebase
// each to its first data point, and read its growth MULTIPLE at SPX6900's CURRENT age.
// Rank by closeness (log-distance) to SPX's own same-age multiple, and also report the
// correlation of the full log-multiple CURVE up to that age (shape resemblance, not just
// the endpoint). Prints a ranked table + writes public/resemblance.json. Read-only study;
// it does NOT wire any card — we pick the winner, then build its same-age card.
import { writeFile } from "node:fs/promises";
import { DEFAULT_RAW } from "../src/data.js";

const DAY = 86400000;
// CryptoCompare symbols. Broad, deliberately beyond the memecoins.
const CANDIDATES = [
  "ETH", "SOL", "BNB", "MATIC", "POL", "LINK", "AVAX", "ADA", "DOT", "ATOM",
  "NEAR", "LTC", "XRP", "TRX", "UNI", "AAVE", "INJ", "RNDR", "SUI", "APT",
  "ALGO", "FTM", "ICP", "HBAR", "VET", "DOGE", "SHIB",
];

// CryptoCompare now requires a (free) API key for histoday — keyless calls 401.
const CC_KEY = process.env.CRYPTOCOMPARE_KEY || process.env.CC_KEY || "";
const CC_HEADERS = { Accept: "application/json", ...(CC_KEY ? { authorization: `Apikey ${CC_KEY}` } : {}) };

async function fullHistory(sym) {
  const out = new Map(); // time(sec) -> close
  let toTs = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 6; page++) {
    const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}`;
    const res = await fetch(url, { headers: CC_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 401 ? " (set CRYPTOCOMPARE_KEY)" : ""}`);
    const json = await res.json();
    const list = json?.Data?.Data;
    if (!Array.isArray(list) || !list.length) break;
    let minTime = Infinity, any = false;
    for (const d of list) { if (d.close > 0) { out.set(d.time, d.close); any = true; } if (d.time) minTime = Math.min(minTime, d.time); }
    if (!any || !Number.isFinite(minTime) || out.size > 5000) break;
    toTs = minTime - 86400;
  }
  // → sorted [ageDaysSinceFirstPoint, price]
  const rows = [...out.entries()].map(([t, p]) => [t * 1000, p]).sort((a, b) => a[0] - b[0]);
  if (!rows.length) return null;
  const t0 = rows[0][0], p0 = rows[0][1];
  return rows.map(([ts, p]) => [(ts - t0) / DAY, p / p0]);
}

const interp = (s, a) => {
  if (a <= s[0][0]) return s[0][1];
  if (a >= s.at(-1)[0]) return s.at(-1)[1];
  for (let i = 1; i < s.length; i++) if (s[i][0] >= a) { const [a0, q0] = s[i - 1], [a1, q1] = s[i]; return q0 + ((a - a0) / ((a1 - a0) || 1)) * (q1 - q0); }
  return s.at(-1)[1];
};

// Pearson correlation of two coins' log-multiple sampled every 15 days up to `age`.
function shapeCorr(spx, peer, age) {
  const xs = [], ys = [];
  for (let a = 15; a <= age; a += 15) { xs.push(Math.log(interp(spx, a))); ys.push(Math.log(interp(peer, a))); }
  const n = xs.length; if (n < 4) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : null;
}

async function run() {
  if (!CC_KEY) console.warn("⚠ No CRYPTOCOMPARE_KEY set — CryptoCompare will 401. Add a free key as a repo secret.\n");
  // SPX from the bundled model set (self-contained); age & multiple at "now".
  const spx = DEFAULT_RAW.map(r => [Date.parse(r.date), r.price]);
  const st0 = spx[0][0], sp0 = spx[0][1];
  const ageNow = (spx.at(-1)[0] - st0) / DAY;
  const spxCurve = spx.map(([ts, p]) => [(ts - st0) / DAY, p / sp0]);
  const spxMult = spxCurve.at(-1)[1];
  console.log(`SPX6900: age ${(ageNow / 365).toFixed(2)}y (${Math.round(ageNow)}d), multiple ${spxMult.toFixed(0)}x\n`);

  const rows = [];
  for (const sym of CANDIDATES) {
    try {
      const curve = await fullHistory(sym);
      if (!curve) { console.warn(`${sym}: no data`); continue; }
      const peerAge = curve.at(-1)[0];
      if (peerAge < ageNow) { console.warn(`${sym}: too young (${(peerAge / 365).toFixed(1)}y < SPX)`); continue; }
      const mult = interp(curve, ageNow);
      const logDist = Math.abs(Math.log(mult) - Math.log(spxMult));
      const corr = shapeCorr(spxCurve, curve, ageNow);
      rows.push({ sym, mult, logDist, corr });
    } catch (e) { console.warn(`${sym}: ${e.message}`); }
  }
  rows.sort((a, b) => a.logDist - b.logDist);
  console.log("rank  coin    mult@2.9y   logΔ    shapeCorr");
  rows.forEach((r, i) => console.log(
    String(i + 1).padStart(2), " ", r.sym.padEnd(6), (r.mult.toFixed(0) + "x").padStart(9), "  ", r.logDist.toFixed(2), "   ", r.corr == null ? "—" : r.corr.toFixed(2)));
  await writeFile("public/resemblance.json", JSON.stringify({ spxMult, ageDays: Math.round(ageNow), ranked: rows }, null, 2));
  console.log("\nClosest by multiple:", rows[0]?.sym, "| best shape:", [...rows].filter(r => r.corr != null).sort((a, b) => b.corr - a.corr)[0]?.sym);
}
run().catch(e => { console.error(e); process.exit(1); });
