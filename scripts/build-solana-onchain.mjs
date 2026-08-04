// Reconstruct the SPX-on-Solana RESIDENT set (Queens borough) from a Dune solana_utils.daily_balances
// CSV — the ≥5k cohort's balance-change rows (owner, balance, day). Phase 1: current balance + holder
// age + net-flow, the three things the city needs. Phase 2 (later, full history) adds exit/cohort
// survival, which needs the ever-≥5k owners' FULL path (below-bar rows too) — not this ≥5k slice.
//
//   node scripts/build-solana-onchain.mjs --in=dune/out/spx6900_solana_balances.csv \
//        --out=public/solana-onchain.json [--decimals=8|--scale=1] [--threshold=5000] [--now=YYYY-MM-DD]
//
// balance UNIT: Dune's token_balance may be raw base units or human. --decimals=N divides by 10^N
// (SPX Solana = 8); --scale=1 if already human. Auto-warns if values look mis-scaled.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.split("=")[1] : (process.argv.includes(`--${k}`) ? true : d); };
const DAY = 86400000;

// Tolerant CSV parse → [{owner, bal, ts}]. Finds columns by header name so column order can't bite.
export function parseBalances(text, scale) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].toLowerCase().split(",").map(s => s.trim().replace(/^"|"$/g, ""));
  const oi = head.findIndex(h => h.includes("owner")) ?? head.indexOf("owner");
  const bi = head.findIndex(h => h.includes("balance"));
  const di = head.findIndex(h => h === "day" || h.includes("day") || h.includes("time") || h.includes("date"));
  if (oi < 0 || bi < 0 || di < 0) throw new Error(`CSV header missing owner/balance/day: ${lines[0]}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length <= Math.max(oi, bi, di)) continue;
    const owner = c[oi].trim().replace(/^"|"$/g, "");
    const bal = Number(c[bi]) * scale;
    const ts = Date.parse(c[di].trim().replace(/^"|"$/g, "").replace(" ", "T").replace(/(\+00:?00| UTC)$/i, "Z"));
    if (!owner || !Number.isFinite(bal) || !Number.isFinite(ts)) continue;
    rows.push({ owner, bal, ts });
  }
  return rows;
}

// LP / CEX / bridge / treasury addresses to EXCLUDE — same idea as ETH's EXCLUDE_LABELS: "residents"
// must be people, not Raydium/Orca pools or exchange hot wallets. Fill from Solscan
// (solscan.io/account/<addr>); the ≥5k CSV's big + high-churn wallets are the prime suspects (LPs and
// CEX hot wallets churn constantly). kind ∈ cex | lp | bridge | treasury.
export const SOLANA_EXCLUDE = {
  // Tagged infrastructure (Solscan, owner-verified 2026-08). Only IDENTIFIED infra is stripped —
  // untagged "system program" wallets are ordinary user wallets and stay, even if high-churn.
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { kind: "lp", name: "Raydium" },
  "AgeSxtVWWMojFWYNrXKnVp9cFuC5CQ7M4rzmrseLxfUj": { kind: "lp", name: "Orca" },
  "MfDuWeqSHEqTFVYZ7LoexgAK9dxk7cy4DFJWjWMGVWa": { kind: "mm", name: "Wintermute" },
  "DMe3ddj7awSR3LFC64rjmCPexsrSv33QAxFoJux4vGH3": { kind: "cex", name: "SwissBorg" },
  "9SLPTL41SPsYkgdsMzdfJsxymEANKr5bYoBsQzJyKpKS": { kind: "mm", name: "hypernuit" },
  // Untagged but infra by behaviour (owner call): Coinbase-hot-wallet funded, holds 3M JTO too,
  // TX pattern reads as infra not a person. The one inferred-not-labelled exclusion — noted as such.
  "5E2d6Z5FRe4584RTmJpyjg8yRtHG1YeorKbFSA1BpkPq": { kind: "infra", name: "untagged infra (Coinbase-funded, by TX pattern)" },
};

// Per-owner resident record: current balance, holder age (since first ≥threshold day), net-flow.
//
// TWO membership models. A ≥5k change-log NEVER records a drop BELOW the bar (that row is filtered
// out at the source), so "latest balance forward-filled" would count everyone who was EVER ≥5k and
// last recorded ≥5k — a big overcount of exiters. So when the archive's latest day is a DENSE
// snapshot (the daily public-RPC pull records EVERY current ≥5k owner), pass `currentDay`: a wallet
// is a resident iff it appears in that snapshot. Age still comes from the FULL history (first ≥5k
// day), so a long-quiet holder reads its true age, not 0. Without `currentDay` the legacy forward-
// fill applies (used by the unit fixtures). Tagged LP/CEX/MM owners are always stripped.
export function residents(rows, { threshold = 5000, nowTs, flowDays = 30, exclude = SOLANA_EXCLUDE, currentDay = null } = {}) {
  const byOwner = new Map();
  for (const r of rows) { let a = byOwner.get(r.owner); if (!a) { a = []; byOwner.set(r.owner, a); } a.push(r); }
  const dayStr = ts => new Date(ts).toISOString().slice(0, 10);
  const curDayStr = currentDay ? String(currentDay).slice(0, 10) : null;
  const refTs = curDayStr ? Date.parse(curDayStr) : nowTs;   // age/flow measured as of the snapshot day
  const flowCut = refTs - flowDays * DAY;
  const out = []; let exBal = 0;
  for (const [owner, rs] of byOwner) {
    rs.sort((a, b) => a.ts - b.ts);
    let bal;
    if (curDayStr) {
      const onDay = rs.filter(r => dayStr(r.ts) === curDayStr);   // membership: present in the dense snapshot
      if (!onDay.length) continue;                                // absent → not ≥5k now (exited)
      bal = onDay[onDay.length - 1].bal;
    } else {
      bal = rs[rs.length - 1].bal;                                // legacy forward-fill
    }
    if (exclude[owner]) { exBal += bal >= threshold ? bal : 0; continue; }   // LP/CEX/MM — not a resident
    if (bal < threshold) continue;
    const firstQual = rs.find(r => r.bal >= threshold) || rs[0];  // true first ≥threshold day = holder age anchor
    const days = Math.max(0, Math.round((refTs - firstQual.ts) / DAY));
    let past = 0; for (const r of rs) { if (r.ts <= flowCut) past = r.bal; else break; }
    out.push({ a: owner, bal: Math.round(bal), days, flow: Math.round(bal - past) });
  }
  out.sort((a, b) => b.bal - a.bal);
  out.excludedSupply = Math.round(exBal);   // ≥5k supply stripped as LP/CEX/MM (for transparency)
  return out;
}

function main() {
  const inPath = arg("in", "dune/out/spx6900_solana_balances.csv");
  const outPath = arg("out", "public/solana-onchain.json");
  const decimals = arg("decimals", null);
  const scale = arg("scale", null) != null ? Number(arg("scale")) : (decimals != null ? 1 / 10 ** Number(decimals) : 1e-8);
  const threshold = Number(arg("threshold", 5000));
  const now = arg("now", null) ? Date.parse(arg("now")) : Date.now();

  const rows = parseBalances(readFileSync(inPath, "utf8"), scale);
  if (!rows.length) throw new Error("no rows parsed — check the CSV / column names");
  const med = rows.map(r => r.bal).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  if (med > 1e7 || med < 1e-2) console.warn(`⚠ median balance ${med} looks mis-scaled — check --decimals/--scale against a known wallet`);

  // Latest day in the archive = the dense RPC snapshot → current residency; full history → ages.
  const maxDay = rows.reduce((m, r) => { const d = new Date(r.ts).toISOString().slice(0, 10); return d > m ? d : m; }, "");
  const currentDay = arg("current", null) || maxDay;
  const wallets = residents(rows, { threshold, nowTs: now, flowDays: 30, currentDay });
  // reduce, NOT Math.min(...rows): spreading 120k+ timestamps into a call overflows the stack
  // (the same scale bug the ETH FIFO engine hit). maxDay above already uses this pattern.
  const minTs = rows.reduce((m, r) => (r.ts < m ? r.ts : m), rows[0].ts);
  const firstDay = new Date(minTs).toISOString().slice(0, 10);
  const doc = {
    v: 1, updated: currentDay, chain: "solana", source: "public Solana RPC snapshot (residency) + Dune daily_balances (full ≥5k history for ages)",
    threshold, sliceFrom: firstDay, excludedSupply: wallets.excludedSupply, excluded: Object.keys(SOLANA_EXCLUDE).length,
    note: "residents = latest dense RPC snapshot; holder age = first ≥5k day over full history since launch",
    wallets,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc));
  const held = wallets.reduce((s, w) => s + w.bal, 0);
  console.log(`✓ ${outPath} — ${wallets.length} residents ≥${threshold} · held ${(held / 1e6).toFixed(1)}M SPX · slice from ${firstDay}`
    + (wallets.excludedSupply ? ` · excluded ${(wallets.excludedSupply / 1e6).toFixed(1)}M (${Object.keys(SOLANA_EXCLUDE).length} LP/CEX)` : ""));
  console.log(`  top: ${wallets.slice(0, 3).map(w => `${w.a.slice(0, 4)}…=${(w.bal / 1e3).toFixed(0)}k`).join(" · ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
