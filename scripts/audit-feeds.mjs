// ============================================================================
// FEED AUDIT — does every number on the site still actually arrive?
// ============================================================================
//   node scripts/audit-feeds.mjs            # full check, exits 1 on a FAIL
//   node scripts/audit-feeds.mjs --warn     # report only, always exits 0
//   node scripts/audit-feeds.mjs --json     # machine-readable, for the panel
//
// WHY THIS EXISTS. There are now ~20 data files written by 8 workflows off a dozen
// upstreams, and the failure that matters is not a workflow going red — it is a
// workflow going GREEN while one field inside its output quietly stops arriving.
// That is not hypothetical: the exchange-balance fields (cexBal/lpBal/custBal) were
// null for every one of the 53 days they existed, because the RPC behind them
// answered 521 and the fetch soft-failed to null with a console.warn nobody reads.
// The file's date looked perfect the whole time. So a check on file dates alone is
// exactly the check that would have missed it.
//
// Hence the three questions asked per feed, in order of how easily each is missed:
//   1. STALE    — is the date inside the file older than its cadence allows?
//   2. MISSING  — is a field the cards read absent from the recent window?
//   3. FROZEN   — is a field present but identical for the whole window (a
//                 forward-fill or a cached upstream masquerading as fresh data)?
//
// A field is `soft` when null is a legitimate answer (SOPR is null in a week where
// nothing moved; a signals list is usually empty). Soft fields report but never fail.
//
// ADDING A FEED: add an entry below. If a file is not listed here it is reported as
// UNTRACKED rather than ignored, so a new feed cannot slip in unaudited.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const WARN_ONLY = argv.includes("--warn");
const AS_JSON = argv.includes("--json");
const OUT = argv.find(a => a.startsWith("--out="))?.split("=")[1];

// Per feed:
//   cadence   how many days old the newest row may be before it is stale
//   fields    must be non-null across `window` recent rows (a gap FAILS)
//   soft      same check, but a gap only WARNs — null is a legitimate answer
//   require   scalar keys that must be present on an object-shaped feed
//   nonEmpty  array/map keys that must have something in them
//   mayBeEmpty  array keys that are usually empty (a signal list, a quiet hour)
//               — reported, never failed
export const FEEDS = [
  // ── daily snapshot cron (00:17 UTC) ─────────────────────────────────────────
  { file: "history.json", cadence: 2, by: "snapshot.yml", what: "daily price, holders, cost basis, sentiment",
    window: 14,
    fields: ["p", "holders", "be", "fng", "sup", "sp", "upnl", "rpnl", "gini"],
    soft: ["holdersBase", "holdersSol", "supplyBase", "supplySol", "t3es", "cexBal", "lpBal"] },
  { file: "chain-wallets.json", cadence: 2, by: "snapshot.yml (step)", what: "wallet growth across ETH/Base/Solana",
    window: 8, fields: ["eth"], soft: ["base", "sol"] },
  { file: "valuation.json", cadence: 2, by: "snapshot.yml (step)", what: "the weighted valuation composite" },
  { file: "signals.json", cadence: 2, by: "snapshot.yml (step)", what: "the anomaly detector's daily candidates",
    mayBeEmpty: ["signals"] },
  // Rows are positional tuples [date, cex, lp, custody, organicNet, onboardNet, price], not objects,
  // so the field checks read by column index via `cols`.
  { file: "cex-flow.json", cadence: 3, by: "snapshot.yml (step)", what: "exchange balances and net flow",
    window: 8, fields: ["cex", "lp"], cols: { cex: 1, lp: 2 } },

  // ── weekly on-chain FIFO rebuild (Mon 05:23 UTC) ─────────────────────────────
  { file: "onchain.json", cadence: 9, by: "onchain-dune.yml", what: "the whole FIFO on-chain suite",
    window: 6,
    fields: ["sip", "top100", "holders", "rp", "mvrv", "age", "tiers", "wealth", "whalePct", "whaleN", "heldTokens"],
    // whaleN is a THRESHOLD count (wallets ≥0.1% of supply), not a top-N: it legitimately sits
    // flat for weeks (a wallet crossing 0.1% is rare), so a constant value is healthy, not stale —
    // whalePct next to it moves daily and is what proves the cohort is being recomputed.
    allowConstant: ["whaleN"],
    soft: ["sopr", "cexBal", "lpBal", "cexVenues", "liqEx"] },
  { file: "urpd.json", cadence: 9, by: "onchain-dune.yml", what: "the cost-basis histogram" },
  // A FEED, not state: Whale City reads it and it is refreshed by the same daily pipeline. Audited
  // for freshness on purpose — if the pipeline stops, the city silently shows a stale population
  // rather than nothing, which is the failure mode this audit exists to catch. Its rows live under
  // `.wallets` (not a shape rowsOf knows), so nonEmpty is what confirms the population is there.
  { file: "whales.json", cadence: 9, by: "onchain-dune.yml", what: "the wallets resident in Whale City",
    nonEmpty: ["wallets"] },
  // SPX-on-Solana ≥5k residents (age/flow). Daily via solana-onchain.yml: a keyless public-RPC
  // snapshot (getProgramAccounts) appended to the committed archive dune/out/spx6900_solana_balances.csv
  // (FULL ≥5k history since launch → true holder ages). Residency = latest dense snapshot; age = first
  // ≥5k day. cadence 9 mirrors ETH onchain.json. Rows live under `.wallets`, so nonEmpty confirms it.
  { file: "solana-onchain.json", cadence: 9, by: "solana-onchain.yml", what: "SPX-on-Solana ≥5k residents (age/flow)",
    nonEmpty: ["wallets"] },
  // SPX-on-Base ≥5k cohort (holders + exits + real ages/survival). Daily via base-onchain.yml: an
  // Alchemy getAssetTransfers DELTA replayed onto the committed cohort (dune/out/spx6900_base_cohort.csv),
  // full ETH/Solana parity. cadence 9 mirrors the others. Current holders under `.wallets`.
  { file: "base-onchain.json", cadence: 9, by: "base-onchain.yml", what: "SPX-on-Base ≥5k cohort (ages/exits/survival)",
    nonEmpty: ["wallets"] },

  // ── other schedules ─────────────────────────────────────────────────────────
  { file: "price-history.json", cadence: 9, by: "price-history.yml", what: "the dense daily price line" },
  { file: "longshort.json", cadence: 3, by: "longshort.yml", what: "Hyperliquid funding and open interest" },
  { file: "btc-mvrv.json", cadence: 40, by: "btc-mvrv.yml", what: "Bitcoin's MVRV, for the comparison chart" },

  // ── Project AEON (daily 01:37 UTC, plus the hourly sale watcher) ─────────────
  { file: "aeon.json", cadence: 2, by: "aeon.yml", what: "AEON floor, owners, supply",
    require: ["floor", "owners", "tokens"] },
  { file: "aeon-history.json", cadence: 2, by: "aeon.yml", what: "AEON floor and owners over time",
    window: 3, fields: ["floor", "owners"] },
  { file: "aeon-onchain.json", cadence: 3, by: "aeon.yml", what: "AEON ownership, holder age, concentration",
    // Not `held` (AEON is a fixed 3,333 supply) and not `top10` (checked: the same ten
    // wallets have held 17.56% for ten straight weeks — real, they simply have not
    // traded). `owners` moves every week, so it proves liveness without a standing warn
    // that would train us to ignore this row.
    window: 6, fields: ["owners", "dist", "age"], nonEmpty: ["holders"] },
  { file: "aeon-market.json", cadence: 3, by: "aeon.yml", what: "AEON MVRV, URPD, fair value, deals",
    require: ["floor", "levelNow"], nonEmpty: ["urpd", "salesScatter", "biggest", "traitPremiums"] },
  { file: "aeon-sales.json", cadence: 3, by: "aeon.yml", what: "AEON marketplace trades",
    require: ["totalSales", "totalVolEth"], nonEmpty: ["daily", "scatter"] },
  { file: "aeon-timeline.json", cadence: 3, by: "aeon.yml", what: "city time-machine (AEON weekly balances)",
    require: ["week0", "n"], nonEmpty: ["wallets"] },
  { file: "city-recap.json", cadence: 3, by: "onchain-dune.yml", what: "weekly/monthly city changes (new residents, tier upgrades)",
    require: ["weekly", "monthly"] },
  { file: "spx-timeline.json", cadence: 3, by: "onchain-dune.yml", what: "city time-machine (SPX weekly balances)",
    require: ["week0", "n"], nonEmpty: ["wallets"] },
  { file: "cohort-survival.json", cadence: 3, by: "onchain-dune.yml", what: "wallet survival by arrival era",
    require: ["overall", "week0"], nonEmpty: ["cohorts", "weekly"] },
  { file: "whale-cohort-history.json", cadence: 3, by: "onchain-dune.yml", what: "per-week whale counts by size cohort",
    require: ["week0", "n"], nonEmpty: ["rows", "labels"] },
  { file: "exit-flow.json", cadence: 3, by: "onchain-dune.yml", what: "daily departures split by profit/loss",
    require: ["overall", "res"], nonEmpty: ["days"] },
  { file: "smart-money.json", cadence: 3, by: "onchain-dune.yml", what: "live smart-money cohort holdings + net-flow",
    require: ["cohortSize", "flow"], nonEmpty: ["weeks"] },
  { file: "aeon-traders.json", cadence: 3, by: "aeon.yml", what: "AEON per-wallet realized P&L",
    require: ["traders"], nonEmpty: ["top", "byVolume"] },
  { file: "aeon-listings.json", cadence: 3, by: "aeon.yml", what: "live AEON listings for the deal finder",
    require: ["total"], mayBeEmpty: ["listings"] },
  { file: "aeon-rarity.json", cadence: 400, by: "aeon.yml (once)", what: "AEON trait rarity (static once built)",
    require: ["total"], nonEmpty: ["tokens", "traitTypes"] },
  { file: "aeon-live-sales.json", cadence: 2, by: "aeon-sale-watch.yml", what: "sub-day AEON sales from Alchemy",
    mayBeEmpty: ["sales"] },
  { file: "ens.json", cadence: 9, by: "aeon.yml (step)", what: "ENS names for the wallets we display",
    require: ["resolved", "named"], nonEmpty: ["names"] },
  { file: "whale-signals.json", cadence: 9, by: "onchain-dune.yml (step)", what: "whale-cohort move candidates",
    mayBeEmpty: ["signals"] },
];

// Runtime state and owner-edited config: written by the bot or the control panel,
// not by a data feed. Present so nothing is silently unaccounted for.
export const STATE = new Set([
  "post-state.json", "band-state.json", "daily-band-state.json", "milestone-state.json",
  "next-post.json", "post-copy.json", "card-ar.json", "rotation-excludes.json",
  "recap-pending.json", "aeon-sale-state.json", "whale-state.json",
  "freefloat-peers.json", "resemblance.json",       // deliberately dormant, see CLAUDE.md
  "feed-health.json",                                // written by this script
  // A cache of the on-chain noticeboard, not a feed: it is legitimately EMPTY until the contract
  // is deployed, and legitimately UNCHANGED for as long as nobody writes a note. Auditing it for
  // freshness would raise an alarm about people not chatting, which is not a data problem.
  "city-notes.json",
]);

const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return undefined; } };

/** The rows a feed's freshness and fields should be judged on. */
export function rowsOf(o) {
  if (Array.isArray(o)) return o;
  if (!o || typeof o !== "object") return [];
  for (const k of ["series", "points", "history", "rows", "days", "buckets", "signals"]) {
    if (Array.isArray(o[k])) return o[k];
  }
  return [];
}

/** The date a feed claims, preferring its own stamp over its last row. */
export function dateOf(o) {
  if (o && !Array.isArray(o)) {
    for (const k of ["updated", "date", "checked"]) if (typeof o[k] === "string") return o[k].slice(0, 10);
  }
  const rows = rowsOf(o);
  const last = rows.at(-1);
  const d = last?.d ?? last?.date ?? (Array.isArray(last) ? last[0] : null);
  return typeof d === "string" ? d.slice(0, 10) : null;
}

const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * Audit one feed. Returns { file, status, age, notes[] } where status is
 * ok | warn | fail | absent.
 */
export function auditFeed(spec, doc, today) {
  const notes = [];
  if (doc === undefined) return { ...spec, status: "fail", age: null, notes: ["file missing or unparseable"] };

  const d = dateOf(doc);
  const age = d ? daysBetween(today, d) : null;
  let status = "ok";
  const fail = m => { notes.push(m); status = "fail"; };
  const warn = m => { notes.push(m); if (status === "ok") status = "warn"; };

  if (age == null) warn("no date inside the file — freshness cannot be checked");
  else if (age > spec.cadence) fail(`${age}d old, cadence allows ${spec.cadence}d`);

  // Object-shaped feeds (the AEON bundles, the ENS cache) are judged on their keys.
  const size = v => Array.isArray(v) ? v.length : (v && typeof v === "object" ? Object.keys(v).length : null);
  for (const k of spec.require ?? []) {
    if (doc[k] == null) fail(`${k}: missing`);
  }
  for (const k of spec.nonEmpty ?? []) {
    const n = size(doc[k]);
    if (n == null) fail(`${k}: missing`);
    else if (n === 0) fail(`${k}: empty`);
  }
  for (const k of spec.mayBeEmpty ?? []) {
    const n = size(doc[k]);
    if (n == null) fail(`${k}: missing`);
    else if (n === 0) notes.push(`${k}: empty (allowed, but worth knowing)`);
  }

  // Row-shaped feeds are judged on their recent window.
  const rows = rowsOf(doc);
  const rowChecks = (spec.fields?.length ?? 0) + (spec.soft?.length ?? 0) > 0;
  if (!rows.length) {
    if (rowChecks || !(spec.require || spec.nonEmpty || spec.mayBeEmpty)) fail("no rows");
    return { ...spec, status, age, date: d, rows: 0, notes };
  }

  const win = rows.slice(-(spec.window ?? 6));
  // Rows may be objects (r.field) or positional tuples (r[index]); `cols` maps a field name to its
  // column index for the tuple feeds, so the same checks work on both shapes.
  const get = (r, f) => (spec.cols && f in spec.cols) ? r?.[spec.cols[f]] : r?.[f];
  const check = (names, hard) => {
    for (const f of names ?? []) {
      const vals = win.map(r => get(r, f)).filter(v => v != null && v !== "");
      const everSeen = rows.some(r => get(r, f) != null);
      if (!vals.length) {
        const msg = everSeen ? `${f}: stopped arriving` : `${f}: never populated`;
        hard ? fail(msg) : warn(msg);
        continue;
      }
      if (vals.length < win.length) warn(`${f}: ${win.length - vals.length} of ${win.length} recent rows null`);
      else if (win.length >= 5 && !spec.allowConstant?.includes(f) && new Set(vals.map(v => JSON.stringify(v))).size === 1) {
        warn(`${f}: identical across ${win.length} rows — frozen or forward-filled?`);
      }
    }
  };
  check(spec.fields, true);
  check(spec.soft, false);

  return { ...spec, status, age, date: d, rows: rows.length, notes };
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const results = FEEDS.map(spec => auditFeed(spec, readJson(`public/${spec.file}`), today));

  const known = new Set([...FEEDS.map(f => f.file), ...STATE]);
  const untracked = readdirSync("public").filter(f => f.endsWith(".json") && !known.has(f));

  const fails = results.filter(r => r.status === "fail");
  const warns = results.filter(r => r.status === "warn");

  if (AS_JSON || OUT) {
    const payload = {
      checked: today,
      ok: results.length - fails.length - warns.length,
      warn: warns.length, fail: fails.length, untracked,
      feeds: results.map(({ file, by, what, status, age, cadence, date, notes }) =>
        ({ file, by, what, status, age, cadence, date, notes })),
    };
    const text = JSON.stringify(payload, null, 1) + "\n";
    if (OUT) writeFileSync(OUT, text);
    if (AS_JSON) console.log(text);
  }

  if (!AS_JSON) {
    const icon = { ok: "  ok ", warn: "WARN ", fail: "FAIL " };
    console.log(`feed audit — ${today}\n`);
    for (const r of results) {
      const ageS = r.age == null ? "  ?" : `${String(r.age).padStart(3)}d`;
      console.log(`${icon[r.status]} ${ageS}/${String(r.cadence).padStart(3)}d  ${r.file.padEnd(24)} ${r.by}`);
      for (const n of r.notes) console.log(`              ↳ ${n}`);
    }
    if (untracked.length) console.log(`\nUNTRACKED (add to FEEDS or STATE): ${untracked.join(", ")}`);
    console.log(`\n${results.length - fails.length - warns.length} ok · ${warns.length} warn · ${fails.length} fail`);
  }

  if (fails.length && !WARN_ONLY) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync("public")) { console.error("run from the repo root"); process.exit(2); }
  main();
}
