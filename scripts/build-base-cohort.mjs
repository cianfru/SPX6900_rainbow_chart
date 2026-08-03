// Ingest the Alchemy Base ≥5k COHORT CSV → public/base-onchain.json (rich: current holders with real
// ages, plus the full exit/survival picture). CSV columns:
//   address, balance, status(holder|exited), first_5k_day, since_5k_day, exit_day
// This is the authoritative Base cohort (Alchemy transfer reconstruction) — holders + everyone who
// ever crossed 5k and left. Gives Base full ETH/Solana parity: ages (first_5k_day), exits (exit_day),
// survival. The daily Alchemy pipeline (build-base-alchemy.mjs) keeps this CSV current.
//
//   node scripts/build-base-cohort.mjs --in=dune/out/spx6900_base_cohort.csv --out=public/base-onchain.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_EXCLUDE } from "./build-base-onchain.mjs";

const DAY = 86400000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : (process.argv.includes(`--${k}`) ? true : d); };

// Parse the cohort CSV → {holders:[...], exits:[...]} with infra stripped. Pure → unit-tested.
export function parseCohort(text, { threshold = 5000, nowTs, exclude = BASE_EXCLUDE } = {}) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines[0].toLowerCase().split(",").map(s => s.trim());
  const ci = { a: head.indexOf("address"), bal: head.indexOf("balance"), st: head.indexOf("status"), first: head.indexOf("first_5k_day"), since: head.indexOf("since_5k_day"), exit: head.indexOf("exit_day") };
  const holders = [], exits = []; let exBal = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 4) continue;
    const a = c[ci.a].trim().toLowerCase();
    const bal = Number(c[ci.bal]);
    const status = c[ci.st].trim();
    const first = c[ci.first]?.trim(), exit = c[ci.exit]?.trim();
    if (exclude[a]) { if (status === "holder" && bal >= threshold) exBal += bal; continue; }  // LP/CEX/bridge
    if (status === "holder" && bal >= threshold) {
      const firstTs = Date.parse(first);
      const days = Number.isFinite(firstTs) ? Math.max(0, Math.round((nowTs - firstTs) / DAY)) : 0;
      holders.push({ a, bal: Math.round(bal), days, first });
    } else if (exit) {
      exits.push({ a, exit });   // a wallet that ever crossed 5k and has since dropped below
    }
  }
  holders.sort((x, y) => y.bal - x.bal);
  return { holders, exits, excludedSupply: Math.round(exBal) };
}

const BANDS = [[0, 90], [90, 180], [180, 365], [365, 730], [730, 1e9]];
const bandsOf = (arr) => BANDS.map(([lo, hi]) => +(arr.filter(d => d >= lo && d < hi).length / arr.length * 100).toFixed(1));
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function main() {
  const inPath = arg("in", join(root, "dune/out/spx6900_base_cohort.csv"));
  const outPath = arg("out", join(root, "public/base-onchain.json"));
  const nowTs = arg("now", null) ? Date.parse(arg("now")) : Date.now();
  const day = new Date(nowTs).toISOString().slice(0, 10);

  const { holders, exits, excludedSupply } = parseCohort(readFileSync(inPath, "utf8"), { nowTs });
  if (!holders.length) throw new Error("no holders parsed — check the CSV columns");
  const ages = holders.map(h => h.days);
  const everHeld = holders.length + exits.length;
  // exit timeline by month
  const exM = new Map();
  for (const e of exits) { const m = e.exit.slice(0, 7); exM.set(m, (exM.get(m) || 0) + 1); }
  const exitTimeline = [...exM.entries()].filter(([m]) => /^\d{4}-\d{2}$/.test(m)).sort();

  const doc = {
    v: 2, updated: day, chain: "base", source: "Alchemy transfer reconstruction (≥5k cohort)",
    threshold: 5000, excluded: Object.keys(BASE_EXCLUDE).length, excludedSupply,
    holders: holders.length, exited: exits.length, everHeld,
    survivalPct: +(holders.length / everHeld * 100).toFixed(1),
    medAge: median(ages), ageBands: bandsOf(ages),
    exitTimeline,
    note: "current ≥5k holders with real ages (first ≥5k day); exits = ever-≥5k wallets now below the bar",
    wallets: holders.map(h => ({ a: h.a, bal: h.bal, days: h.days })),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc));
  const held = holders.reduce((s, h) => s + h.bal, 0);
  console.log(`✓ ${outPath} — ${holders.length} holders ≥5k · held ${(held / 1e6).toFixed(1)}M · ${exits.length} exited · survival ${doc.survivalPct}%`);
  console.log(`  age p50 ${doc.medAge}d · bands ${JSON.stringify(doc.ageBands)} · excludedSupply ${(excludedSupply / 1e6).toFixed(2)}M`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
