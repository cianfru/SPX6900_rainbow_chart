// LOCAL FIFO on-chain reconstruction — the heavy per-wallet lot math runs HERE in Node,
// NOT on Dune. Dune does only the cheap part (dump raw transfers + a tiny daily price
// series); this replays them into the full on-chain suite for $0 / zero credits.
//
// Inputs (CSV, exported from a CHEAP Dune query — no joins/windows):
//   • transfers: from/"sender", to/"receiver", time/"evt_block_time", value/"amount"
//   • prices:    day/"date", price   (SPX daily USD, ~1000 rows, near-free to pull)
// Output: the SPX_ONCHAIN bundle shape + LTH/STH profit-loss + SOPR (per row), WEEKLY by
// default, PLUS a companion urpd.json (current cost-basis distribution histogram).
// One cheap extract → NUPL data + supply-in-profit + concentration + HODL waves + LTH/STH
// + SOPR + URPD, all computed locally for $0 (no Dune credits, no paywall).
//
// Method: true FIFO lots (each wallet a queue of {ts, price, qty}); a send consumes the
// EARLIEST lots first, so every held coin keeps its real acquisition age + cost. This is
// strictly more precise than the old avg-cost bundle AND unlocks the LTH/STH split that
// average-cost can't express. Excluded addresses (pools/bridge/CEX) are never queued as
// holders, but a real wallet's receive is still priced at the day's USD price regardless
// of counterparty (a buy from the pool = cost basis at market — correct).
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const EPS = 1e-9;
const DAY = 86400000;

// Classification of the excluded addresses, for the entity-based FREE-FLOAT calc + the exchange-
// flow cards. Owner venue-tagged all 13 via Etherscan (2026-07-21). `kind` decides float vs not:
//   burn/null  → OUT of supply (0xdead holds the ONE real 69M burn; 0x0 is the mint source)
//   bridge     → ETH-locked backing Base/Solana supply → NOT ETH-native float (tradable on those chains)
//   lp/cex/custody → FLOAT (liquid / tradable). cex = named CEX hot wallets (the exchange-flow cards);
//                    custody = BitGo-style multisig (WalletSimple proxy clones).
export const EXCLUDE_LABELS = {
  "0x0000000000000000000000000000000000000000": { name: "null / mint source", kind: "null" },
  "0x000000000000000000000000000000000000dead": { name: "burn", kind: "burn" },              // 69.01M burned
  "0x52c77b0cb827afbad022e6d6caf2c44452edbc39": { name: "Uniswap V2: SPX", kind: "lp" },
  "0x3ee18b2214aff97000d974cf647e7c347e8fa585": { name: "Wormhole bridge", kind: "bridge" }, // backs Base/Solana
  "0xf35a6bd6e0459a4b53a27862c51a2a7292b383d1": { name: "CoinSpot", kind: "cex" },
  "0x6d6cc65e2060d0a280fcd47b6c22ec5636797fec": { name: "KuCoin", kind: "cex" },
  "0xdc154fcee1babb560e8528c3a7791527f01423df": { name: "BitGo custody (WalletSimple)", kind: "cex" }, // institutional custody → exchange-side
  "0x7dafba1d69f6c01ae7567ffd7b046ca03b706f83": { name: "Kraken 245", kind: "cex" },
  "0xd2dd7b597fd2435b6db61ddf48544fd931e6869f": { name: "Kraken 246", kind: "cex" },
  "0x651641299c7ec0aa44ad7ed9b7e12702fed2022f": { name: "Bybit 56", kind: "cex" },
  "0x0529ea5885702715e83923c59746ae8734c553b7": { name: "Bitpanda 18", kind: "cex" },
  "0x9b0c45d46d386cedd98873168c36efd0dcba8d46": { name: "Revolut 3", kind: "cex" },
  "0x3cc936b795a188f0e246cbb2d74c5bd190aecf18": { name: "MEXC 3", kind: "cex" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { name: "Coinbase 10", kind: "cex" },
  "0xdf5e3a1ed0c14a53eee240022301ecb9d267671b": { name: "Kraken-linked", kind: "cex" },        // Kraken-funded, trades the SPX contract
  "0x73d8bd54f7cf5fab43fe4ef40a62d390644946db": { name: "BitGo custody (WalletSimple)", kind: "cex" }, // another WalletSimple proxy → exchange-side
  // ── Owner-tagged CEX coverage batch, 2026-07-22 (Etherscan). More venues + extra hot wallets. ──
  // Owner-spotted 2026-07-28: showing as the 13th largest HOLDER at 9.4M SPX (~1% of supply) while
  // actually being an exchange. Untagged infrastructure is the most expensive kind of error here —
  // it invents a resident, inflates the holder count, distorts top-10/top-100 concentration, and
  // subtracts its balance from the venue it really belongs to.
  "0xb0a3a2b60e969afd26561429aa4c1444c57e4411": { name: "MEXC", kind: "cex" },
  // Owner-confirmed REVOLUT 2026-07-28. The largest balance in the city at 14.67M SPX, and it was
  // wearing the "biggest whale" crown. Funded by the Revolut hot wallet; first suspected Kraken,
  // then confirmed as Revolut by the owner. "-linked" is the existing convention for a hot wallet
  // funded by, and trading for, a venue — canonVenue strips it, so this aggregates into Revolut
  // rather than inventing a venue of its own.
  "0x15da7556d5ed888306839bed06f868aeaedcb0d7": { name: "Revolut-linked", kind: "cex" },
  "0x377b8ce04761754e8ac153b47805a9cf6b190873": { name: "Upbit", kind: "cex" },
  "0xcffad3200574698b78f32232aa9d63eabd290703": { name: "Crypto.com", kind: "cex" },
  "0xab782bc7d4a2b306825de5a7730034f8f63ee1bc": { name: "Bitvavo", kind: "cex" },
  "0xa023f08c70a23abc7edfc5b6b5e171d78dfc947e": { name: "Crypto.com 2", kind: "cex" },
  "0xc882b111a75c0c657fc507c04fbfcd2cc984f071": { name: "Gate.io", kind: "cex" },
  "0x93228d328c9c74c2bfe9f97638bbb5ef322f2bd5": { name: "Bybit 2", kind: "cex" },
  "0xdd276dc5223d0120f9bf1776f38957cc8da23cb0": { name: "KuCoin 2", kind: "cex" },
  "0x91dca37856240e5e1906222ec79278b16420dc92": { name: "Indodax", kind: "cex" },
  "0x9642b23ed1e01df1092b92641051881a322f5d4e": { name: "MEXC 2", kind: "cex" },
  "0xe8c15aad9d4cd3f59c9dfa18828b91a8b2c49596": { name: "KuCoin 3", kind: "cex" },
  "0xb8e6d31e7b212b2b7250ee9c26c56cebbfbe6b23": { name: "KuCoin 4", kind: "cex" },
  "0xcc282e2004428939ee5149a9e7872f0b4d5d5ec7": { name: "Kraken 3", kind: "cex" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { name: "Binance", kind: "cex" },
  "0x33a64dcdfa041befebc9161a3e0c6180cd94fa89": { name: "CoinSpot 2", kind: "cex" },
  "0x548054687ef6c56c6d82e8269e5fd93d8b88fcb2": { name: "CoinEx", kind: "cex" },      // owner Dune sweep (was mis-labelled "Coined")
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": { name: "Gate.io 1", kind: "cex" },   // owner Dune sweep
  // Big exchange hot wallet (24.4M USDC + 5,336 ETH on-chain 2026-08 = tens of $M total), but it holds
  // only ~206k SPX (~$66k) — the earlier "~$95M" note was the wallet's TOTAL value/throughput, NOT SPX.
  // USDC-heavy + high activity → Coinbase (owner read); "-linked" so canonVenue aggregates it into Coinbase.
  "0x6fe39f2831caf58529779efdb73341aa64df50ab": { name: "Coinbase-linked", kind: "cex" },
  // ── Owner-flagged from the whale-watch list, 2026-08-10 (Etherscan-labelled). Each was showing as a
  //    ≥100k "whale" but is infrastructure. DEX pools → lp, real venues → cex (attributed to their
  //    bucket); a market maker and an MEV bot → "mm" (excluded from holders but attributed to no venue —
  //    they're trading inventory, neither exchange custody nor DEX liquidity, so we don't guess a home).
  "0x7c706586679af2ba6d1a9fc2da9c6af59883fdd3": { name: "Uniswap V3: SPX", kind: "lp" },
  "0x000000000004444c5dc75cb358380d2e3de08a90": { name: "Uniswap V4: PoolManager", kind: "lp" }, // V4 singleton — holds all V4 pool liquidity
  "0x7c1c4a2cf81d2fc83b89bfd34f4d2c7e90044b32": { name: "Uniswap V2: BITCOIN/SPX", kind: "lp" }, // BITCOIN/SPX pair — holds its own SPX reserve
  "0xf60c2ea62edbfe808163751dd0d8693dcb30019c": { name: "Binance US", kind: "cex" },
  "0x1a9d699aee3a56ca49d0cc3b542ae3a37885a3e1": { name: "Upbit 2", kind: "cex" },                // second Upbit hot wallet (canonVenue → Upbit)
  "0x51c72848c68a965f66fa7a88855f9f7784502a7f": { name: "Market maker", kind: "mm" },            // pro trading inventory — excluded, not a venue
  "0xbdb3ba9ffe392549e1f8658dd2630c141fdf47b6": { name: "MEV bot", kind: "mm" },                 // arbitrage bot — transient, not a holder
  // Owner-flagged 2026-08-16: a 1.83M-SPX "whale" (rank ~#62, two-way flow). Owner traced the funding —
  // funded by a wallet that was itself funded by Kraken (two hops) → Kraken infra, so attributed to
  // Kraken (canonVenue → Kraken) rather than the neutral "mm" it was first tagged.
  "0x504ce9e51e508c85a161058c12e970a903d482fc": { name: "Kraken-linked", kind: "cex" },
  // Owner-flagged 2026-08-16: ~580k SPX (rank ~#164), $20M portfolio (not SPX) — and CONNECTED to the
  // Kraken-linked wallet above, so attributed to Kraken (canonVenue → Kraken) rather than left neutral.
  "0x655fe3fc7764e621ca738254eb1b90fae3461d51": { name: "Kraken-linked", kind: "cex" },
  // Owner-flagged + CONFIRMED 2026-08-23: a CoinEx hot-wallet cluster. The engine had merged four
  // addresses into one "owner" (0x0802…d61) because they rotate SPX between each other — the tell of an
  // exchange's own wallets, not a person. 0x50ef… showed the unmistakable signature: TWO-WAY flow
  // exclusively with CoinEx (~361k SPX in AND ~430k out over 90d) on a small ~99k resting balance =
  // deposit/settlement throughput. Owner checked all four on Etherscan → all high-throughput exchange
  // wallets (some drained, some active), not a holder cluster. Tagged "CoinEx-linked" so canonVenue
  // folds them into CoinEx; excluding them removes the invented holders AND dissolves the false cluster.
  "0x50ef5ed097913c223827636890cfb9ed492f5955": { name: "CoinEx-linked", kind: "cex" },
  "0x0802dd2edd3f9fad39a9173b4595be819f201d61": { name: "CoinEx-linked", kind: "cex" },
  "0xbca34ed5875079cc561840f3409a790769821dbc": { name: "CoinEx-linked", kind: "cex" },
  "0xfcbfc2618826fdf33e592b8e0c65089d91a0896b": { name: "CoinEx-linked", kind: "cex" },
};

// The set the FIFO engine excludes from holder reconstruction — DERIVED from EXCLUDE_LABELS so
// the two can NEVER drift (a prior bug: addresses added only to EXCLUDE_LABELS were classified
// but still counted as holders + missing from the CEX balance). One source of truth now.
export const EXCLUDE = new Set(Object.keys(EXCLUDE_LABELS));

// Canonical venue for a labelled CEX address — collapses the per-address suffixes
// ("Kraken 245"/"Kraken 246"/"Kraken 3"/"Kraken-linked" → "Kraken"; "KuCoin 2" → "KuCoin";
// "BitGo custody (WalletSimple)" → "BitGo") so per-venue balances aggregate correctly.
export const canonVenue = name => name.replace(/\s+custody \(WalletSimple\)/i, "").replace(/-linked/i, "").replace(/\s+\d+$/, "").trim();

// ── CEX FLOW SANKEY reduction ───────────────────────────────────────────────
// For the "where's the volume going" Sankey: over a trailing window, aggregate every transfer that
// touches a tagged CEX hot wallet, split into INFLOW (wallet → exchange) and OUTFLOW (exchange →
// wallet), grouped by venue (canonVenue) and counterparty. DUST-filtered so the diagram shows the
// wallets that move the market, not 1k-SPX noise; the tail rolls into a "+N smaller" band so nothing
// is hidden (the honesty rail). Also flags untagged HIGH-THROUGHPUT wallets — likely exchanges /
// routers not yet in EXCLUDE_LABELS — so we stop counting infrastructure as people. Pure + tested.
export function computeCexFlow(transfers, { labels = EXCLUDE_LABELS, asOf = null, days = 90, dust = 25000, topN = 12 } = {}) {
  const kindOf = a => labels[a]?.kind || null;
  let t1 = asOf ?? -Infinity;
  if (asOf == null) for (const t of transfers) if (t.ts > t1) t1 = t.ts;
  const cutoff = t1 - days * DAY;
  const venueIn = new Map(), venueOut = new Map();     // venue -> Map(wallet -> amount)
  const bump = (m, venue, w, amt) => { let g = m.get(venue); if (!g) m.set(venue, g = new Map()); g.set(w, (g.get(w) || 0) + amt); };
  const thru = new Map();                              // per untagged wallet: throughput for the detector
  const tp = a => { let e = thru.get(a); if (!e) thru.set(a, e = { in: 0, out: 0, volIn: 0, volOut: 0, cp: new Set() }); return e; };

  for (const t of transfers) {
    if (t.ts < cutoff || !(t.amt > 0) || !t.from || !t.to) continue;
    const fk = kindOf(t.from), tk = kindOf(t.to);
    if (tk === "cex" && fk !== "cex") bump(venueIn, canonVenue(labels[t.to].name), t.from, t.amt);
    else if (fk === "cex" && tk !== "cex") bump(venueOut, canonVenue(labels[t.from].name), t.to, t.amt);
    if (!labels[t.from]) { const e = tp(t.from); e.out++; e.volOut += t.amt; e.cp.add(t.to); }
    if (!labels[t.to]) { const e = tp(t.to); e.in++; e.volIn += t.amt; e.cp.add(t.from); }
  }

  const rollup = m => [...m].map(([venue, g]) => {
    const rows = [...g].map(([a, amt]) => ({ a, amt: Math.round(amt) })).sort((x, y) => y.amt - x.amt);
    const top = rows.filter(r => r.amt >= dust).slice(0, topN);
    const rest = rows.slice(top.length);
    return { venue, total: Math.round(rows.reduce((s, r) => s + r.amt, 0)), top, more: { n: rest.length, amt: Math.round(rest.reduce((s, r) => s + r.amt, 0)) } };
  }).sort((a, b) => b.total - a.total);

  const inflow = rollup(venueIn), outflow = rollup(venueOut);
  const totalIn = inflow.reduce((s, v) => s + v.total, 0), totalOut = outflow.reduce((s, v) => s + v.total, 0);
  const candidates = [...thru].map(([a, e]) => ({ a, txIn: e.in, txOut: e.out, cp: e.cp.size, volIn: Math.round(e.volIn), volOut: Math.round(e.volOut) }))
    .filter(c => c.txIn >= 30 && c.txOut >= 30 && c.cp >= 25)          // moves both ways, to many parties = infrastructure
    .sort((a, b) => (b.volIn + b.volOut) - (a.volIn + a.volOut)).slice(0, 20);

  return {
    updated: new Date(t1).toISOString().slice(0, 10),
    window: { from: new Date(cutoff).toISOString().slice(0, 10), to: new Date(t1).toISOString().slice(0, 10), days, dust, topN },
    totals: { in: totalIn, out: totalOut, net: totalIn - totalOut },
    inflow, outflow, candidates,
  };
}

// age (days) → band index: [<1m, 1-3m, 3-6m, 6-12m, 1y+]
export function ageBand(days) {
  if (days < 30) return 0;
  if (days < 90) return 1;
  if (days < 180) return 2;
  if (days < 365) return 3;
  return 4;
}

// Gini over an array of positive balances (0 = equal, →1 = concentrated).
export function gini(bals) {
  const n = bals.length;
  if (n === 0) return 0;
  const s = [...bals].sort((a, b) => a - b);
  let cum = 0, tot = 0;
  for (let i = 0; i < n; i++) { cum += (i + 1) * s[i]; tot += s[i]; }
  if (tot <= 0) return 0;
  return (2 * cum) / (n * tot) - (n + 1) / n;
}

// Forward-filled daily price lookup. `priced` = sorted [dayTs, price][].
export function makePriceAt(priced) {
  const days = priced.map(p => p[0]);
  return ts => {
    // greatest day <= ts (binary search); clamp to first if before.
    let lo = 0, hi = days.length - 1, ans = 0;
    if (!days.length) return null;
    if (ts < days[0]) return priced[0][1];
    while (lo <= hi) { const m = (lo + hi) >> 1; if (days[m] <= ts) { ans = m; lo = m + 1; } else hi = m - 1; }
    return priced[ans][1];
  };
}

const dayFloor = ts => Math.floor(ts / DAY) * DAY;
const iso = ts => new Date(ts).toISOString().slice(0, 10);

// Monday sample grid from first→last, inclusive of the last transfer's week.
export function mondays(startTs, endTs) {
  // JS getUTCDay: 0=Sun..6=Sat; Monday=1. Walk back to the Monday on/before start.
  let d = dayFloor(startTs);
  while (new Date(d).getUTCDay() !== 1) d -= DAY;
  const out = [];
  for (; d <= endTs + 7 * DAY; d += 7 * DAY) out.push(d);
  return out;
}

// ── SELF-MOVE DETECTION (splits + consolidations) ───────────────────────────────────────────────────
// A holder can shuffle wallets in ONE block, either a SPLIT (→ N fresh near-equal wallets) or a
// CONSOLIDATION (N emptying wallets → 1 fresh). Both read on-chain as "old whale gone + fresh whale(s)
// appeared", which fakes decentralisation (top-N drops) and fake-freshens the supply (age resets to 0)
// and drops the person out of the city. We detect the clean, unambiguous cases so the pieces/target
// INHERIT the source coin age (not fresh) and the move isn't counted as an economic spend. Deliberately
// CONSERVATIVE — real distributions (airdrops: many, unequal, source keeps a balance) and exchange
// withdrawals must NOT match, so we never silently erase genuine distribution. No tx hash in the
// archive, so "same block" = same timestamp. ⚠ MEMORY: this runs over the full ~2.7M-transfer archive,
// so the core scans an ALREADY-SORTED tx IN PLACE — it must NOT copy the array (a prior version did,
// twice, and OOM'd the FIFO engine). The exported wrappers copy+sort only for standalone/test use.
function scanSelfMoves(tx, opts = {}) {
  const SP_MIN = opts.minN ?? 3, SP_MAX = opts.maxN ?? 20, EQ = opts.eqTol ?? 1.10;
  const CON_MIN = opts.conMinN ?? 2, CON_MAX = opts.conMaxN ?? 20;
  const EMPTY = opts.emptyFrac ?? 0.9, MIN_SRC = opts.minSource ?? 100000, MIN_TOTAL = opts.conMinTotal ?? 100000;
  const exclude = opts.exclude || EXCLUDE;
  const bal = new Map();                          // per-address running balance (small map)
  const fresh = a => (bal.get(a) || 0) <= EPS;     // "fresh" = EMPTY right before the move (not "never
                                                   // received"): wallet-hoppers reuse emptied addresses,
                                                   // so ever-received was too strict and missed real moves.
  const splitIdx = new Set(), conIdx = new Set(), splitEvents = [], conEvents = [];
  let p = 0;
  while (p < tx.length) {
    const ts0 = tx[p].ts, start = p;
    while (p < tx.length && tx[p].ts === ts0) p++;
    const bySrc = new Map(), byDst = new Map();   // this block's transfers grouped both ways
    for (let k = start; k < p; k++) {
      const t = tx[k]; if (!t.from || !t.to) continue;
      let gs = bySrc.get(t.from); if (!gs) bySrc.set(t.from, gs = []); gs.push(t);
      let gd = byDst.get(t.to); if (!gd) byDst.set(t.to, gd = []); gd.push(t);
    }
    for (const [src, grp] of bySrc) {             // SPLIT: whale → N empty near-equal wallets, empties out
      if (exclude.has(src)) continue;
      const n = grp.length; if (n < SP_MIN || n > SP_MAX) continue;
      if (!grp.every(t => fresh(t.to))) continue;
      const amts = grp.map(t => t.amt), mn = Math.min(...amts), mx = Math.max(...amts);
      if (mn <= EPS || mx / mn > EQ) continue;
      const before = bal.get(src) || 0, sent = amts.reduce((a, b) => a + b, 0);
      if (before < MIN_SRC || sent < EMPTY * before) continue;
      for (const t of grp) splitIdx.add(t.i);
      splitEvents.push({ type: "split", ts: ts0, source: src, recipients: grp.map(t => t.to), each: mn, n, supply: sent, idx: grp.map(t => t.i) });
    }
    for (const [dst, grp] of byDst) {             // CONSOLIDATION: N emptying holders → 1 empty wallet
      if (exclude.has(dst) || !fresh(dst)) continue;
      if (!grp.every(t => t.from && !exclude.has(t.from))) continue;   // no exchange withdrawal in the mix
      const sentBySrc = new Map();
      for (const t of grp) sentBySrc.set(t.from, (sentBySrc.get(t.from) || 0) + t.amt);
      if (sentBySrc.size < CON_MIN || sentBySrc.size > CON_MAX) continue;
      let ok = true, total = 0;
      for (const [s, sent] of sentBySrc) { const before = bal.get(s) || 0; total += sent; if (before < EPS || sent < EMPTY * before) { ok = false; break; } }
      if (!ok || total < MIN_TOTAL) continue;
      for (const t of grp) conIdx.add(t.i);
      conEvents.push({ type: "consolidation", ts: ts0, target: dst, sources: [...sentBySrc.keys()], n: sentBySrc.size, supply: total, idx: grp.map(t => t.i) });
    }
    for (let k = start; k < p; k++) { const t = tx[k]; if (t.to) bal.set(t.to, (bal.get(t.to) || 0) + t.amt); if (t.from) bal.set(t.from, (bal.get(t.from) || 0) - t.amt); }
  }
  return { splitIdx, conIdx, splitEvents, conEvents };
}

// prepare raw transfers (copy + normalise + sort) — for STANDALONE callers only (tests). The engine
// passes its own already-sorted tx straight into scanSelfMoves and never pays for this copy.
const prepMoves = transfers => [...transfers]
  .map((t, i) => ({ from: t.from?.toLowerCase(), to: t.to?.toLowerCase(), ts: t.ts, amt: t.amt, i: t.i ?? i }))
  .filter(t => t.amt > EPS).sort((a, b) => a.ts - b.ts || a.i - b.i);

// ── ENTITY CLUSTERING (Phase 2) ──────────────────────────────────────────────────────────────────
// "Who owns what." A holder splitting into fresh wallets or shuffling funds over days is ONE person
// moving money around, not decentralisation. The self-move detector (above) only
// catches the clean SAME-BLOCK, equal-amount cases; this generalises to unequal amounts across days.
//
// THE HONEST RULE the owner set: unless a wallet moves to a CEX / smart contract / DEX pool, an
// EOA→EOA relocation is the same entity moving funds. But a raw "any EOA→EOA edge = same entity"
// would fuse unrelated people (a payment, an OTC sale, a friend). So we link ONLY on two directional,
// specific signals, and NEVER on partial sends between two live wallets (those are payments/sales):
//   FUND  — recipient was EMPTY before and is seeded with ≥MIN tokens (a fresh wallet being funded)
//   DRAIN — sender EMPTIES OUT (≥emptyFrac of its balance, ≥MIN) into the recipient (moving on)
// Both endpoints must be plain EOAs; a leg touching a tagged CEX/LP or a contract (addr-types cache)
// is an EXIT from the entity, not an internal move, and is never linked.
//
// GUARDS (over-merging OVERSTATES concentration — the worse dishonesty, so we err conservative):
//   • HUB guard — a recipient that ≥MAX_IN distinct wallets fund/drain into is almost certainly an
//     untagged service/OTC desk (unrelated people), NOT one person. Every edge into it is dropped.
//   • FAN-OUT guard — symmetric: a wallet that funds/drains ≥MAX_OUT distinct fresh wallets is a
//     distributor / router / market-maker (or a not-yet-classified contract), not a personal split.
//     Every edge FROM it is dropped. This is the same-run backstop for the addr-types cache — the FIRST
//     time an untagged router (e.g. the 1inch router, a 0x0000…-prefixed settlement contract) appears it
//     isn't yet typed, and it fanned SPX out to thousands of unrelated wallets; without this it fused a
//     single 5,402-wallet supernode. The cache classifies it for subsequent runs; this catches it on run 1.
//   • SIZE cap — a merged cluster over MAX_CLUSTER wallets is FLAGGED (oversized/uncertain), kept in
//     the output for review, and downstream metrics must treat it as unmerged (never silently fuse).
// ⚠ MEMORY: runs over the full ~2.7M-transfer archive — scans the ALREADY-SORTED tx IN PLACE (no
// array copy, the OOM lesson). Edges are RARE (a wallet drains/funds seldom), so collecting them in an
// array is cheap; the bal/seen maps are bounded by distinct-address count, not transfer count.
export function clusterEntities(tx, opts = {}) {
  const exclude = opts.exclude || EXCLUDE;
  const external = opts.externalAddrs || new Set();       // contract-typed (addr-types cache) = external endpoints
  const isEndpoint = a => exclude.has(a) || external.has(a);
  const MIN = opts.minTokens ?? 50000;                     // a meaningful move (tokens) — dust/payments ignored
  const EMPTY = opts.emptyFrac ?? 0.9;
  const MAX_IN = opts.maxInDegree ?? 8;                    // > this many funders/drainers = an untagged hub
  const MAX_OUT = opts.maxOutDegree ?? 40;                 // > this many distinct recipients = a distributor/router (above legit personal splits)
  const MAX_CLUSTER = opts.maxCluster ?? 30;               // merged clusters above this are flagged, not trusted

  const bal = new Map();                                   // running balance (bounded by distinct addresses)
  const seen = new Set();                                  // has ever received (for "fresh")
  const edges = [];                                        // {from, to, ts, amt, kind} — sparse
  let p = 0;
  while (p < tx.length) {
    const ts0 = tx[p].ts, start = p;
    while (p < tx.length && tx[p].ts === ts0) p++;
    // evaluate edges against PRE-BLOCK balances/freshness (same convention as scanSelfMoves), then apply
    for (let k = start; k < p; k++) {
      const t = tx[k];
      if (!t.from || !t.to || t.from === t.to || t.amt < MIN) continue;
      if (isEndpoint(t.from) || isEndpoint(t.to)) continue;      // internal EOA↔EOA moves only
      const fresh = !seen.has(t.to) && (bal.get(t.to) || 0) <= EPS;
      if (fresh) { edges.push({ from: t.from, to: t.to, ts: t.ts, amt: t.amt, kind: "fund" }); continue; }
      const beforeFrom = bal.get(t.from) || 0;
      if (beforeFrom > EPS && t.amt >= EMPTY * beforeFrom) edges.push({ from: t.from, to: t.to, ts: t.ts, amt: t.amt, kind: "drain" });
    }
    for (let k = start; k < p; k++) { const t = tx[k]; if (t.to) { bal.set(t.to, (bal.get(t.to) || 0) + t.amt); seen.add(t.to); } if (t.from) bal.set(t.from, (bal.get(t.from) || 0) - t.amt); }
  }

  // HUB + FAN-OUT guard — drop edges touching a node with too many distinct counterparties in EITHER
  // direction (many→one hub = a service/OTC desk; one→many fan-out = a distributor/router/untagged contract).
  const funders = new Map(), fanout = new Map();
  for (const e of edges) {
    let i = funders.get(e.to); if (!i) funders.set(e.to, i = new Set()); i.add(e.from);
    let o = fanout.get(e.from); if (!o) fanout.set(e.from, o = new Set()); o.add(e.to);
  }
  const hubs = new Set();
  for (const [a, s] of funders) if (s.size > MAX_IN) hubs.add(a);   // in-degree hub (funded/drained by many)
  for (const [a, s] of fanout) if (s.size > MAX_OUT) hubs.add(a);   // out-degree fan-out (funds/drains many)
  const kept = edges.filter(e => !hubs.has(e.to) && !hubs.has(e.from));

  // union-find over the surviving edges → connected components = entities
  const parent = new Map();
  const find = a => {
    let r = a; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r);
    let c = a; while (parent.has(c) && parent.get(c) !== c) { const n = parent.get(c); parent.set(c, r); c = n; }
    return r;
  };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of kept) union(e.from, e.to);

  // group members + their linking edges by component root
  const groups = new Map();
  for (const a of parent.keys()) { const r = find(a); let g = groups.get(r); if (!g) groups.set(r, g = { wallets: new Set(), edges: [] }); g.wallets.add(a); }
  for (const e of kept) groups.get(find(e.from)).edges.push(e);

  const EDGE_CAP = opts.edgeCap ?? 200;                    // cap evidence per entity (file size on pathological clusters)
  const entities = [];
  let clustered = 0, largest = 0, flagged = 0;
  for (const g of groups.values()) {
    if (g.wallets.size < 2) continue;                      // a lone wallet is its own entity — not emitted
    const wallets = [...g.wallets].sort();
    const size = wallets.length, oversized = size > MAX_CLUSTER;
    clustered += size; if (size > largest) largest = size; if (oversized) flagged++;
    entities.push({
      id: wallets[0], size, flagged: oversized,
      wallets,
      edges: g.edges.slice().sort((a, b) => a.ts - b.ts).slice(0, EDGE_CAP)
        .map(e => ({ from: e.from, to: e.to, kind: e.kind, date: iso(e.ts), amt: +e.amt.toFixed(2) })),
    });
  }
  entities.sort((a, b) => b.size - a.size);
  return { entities, hubs: [...hubs], edgeCount: kept.length, stats: { entities: entities.length, clustered, largest, flagged, hubs: hubs.size, edgesDropped: edges.length - kept.length } };
}

// Standalone wrapper (copy+sort) — for tests / ad-hoc runs. The engine reuses its own sorted tx.
export function buildEntities(transfers, opts = {}) { return clusterEntities(prepMoves(transfers), opts); }

// Splits only. { splitIdx, linkOf:Map(recipient→source), events, count, supply }.
export function detectSelfSplits(transfers, opts = {}) {
  const { splitIdx, splitEvents } = scanSelfMoves(prepMoves(transfers), opts);
  const linkOf = new Map();
  for (const e of splitEvents) for (const r of e.recipients) linkOf.set(r, e.source);
  return { splitIdx, linkOf, events: splitEvents, count: splitEvents.length, supply: splitEvents.reduce((s, e) => s + e.supply, 0) };
}
// Consolidations only. { splitIdx, linkOf:Map(target→last source), events, count, supply }.
export function detectConsolidations(transfers, opts = {}) {
  const { conIdx, conEvents } = scanSelfMoves(prepMoves(transfers), opts);
  const linkOf = new Map();
  for (const e of conEvents) linkOf.set(e.target, e.sources.at(-1));
  return { splitIdx: conIdx, linkOf, events: conEvents, count: conEvents.length, supply: conEvents.reduce((s, e) => s + e.supply, 0) };
}

// Core replay. transfers = [{from,to,ts,amt}] (any order), priceAt(ts)->usd,
// sampleTs = ascending sample timestamps. Returns the on-chain rows.
export function replayFifo(transfers, priceAt, sampleTs, opts = {}) {
  const exclude = opts.exclude || EXCLUDE;
  const thr = (opts.thresholdDays ?? 90) * DAY;   // LTH cutoff
  const tx = [...transfers].filter(t => t.amt > EPS)
    .map((t, i) => ({ ...t, from: t.from?.toLowerCase(), to: t.to?.toLowerCase(), i }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i);

  // Self-relocations — a holder shuffling wallets, either a SPLIT (→ N fresh equal wallets) or a
  // CONSOLIDATION (N emptying wallets → 1 fresh). The pieces/target INHERIT the source coin age
  // instead of resetting to fresh, and the move is NOT counted as an economic spend, so a wallet
  // move keeps its city standing. Detected once over the whole history; `splitIdx` = the transfer
  // indices to treat as lot-moves (see moveLots). Disabled with opts.detectSplits === false.
  let splitIdx, splitEvents;
  if (opts.detectSplits === false) { splitIdx = new Set(); splitEvents = []; }
  else {
    // scan the engine's OWN already-sorted tx in place — no array copy (that's what OOM'd on 2.7M rows)
    const mv = scanSelfMoves(tx, opts.splitOpts);
    splitEvents = [...mv.splitEvents, ...mv.conEvents];
    // PHASE-1 GATE: a self-move that touches an EXTERNAL endpoint (a contract/Safe or a tagged CEX/LP)
    // is UNVERIFIED — a Safe fan-out could be a treasury distribution, a DEX-settlement inflow isn't a
    // relocation. We still surface it (for review), but we do NOT re-age it (only EOA-only moves get the
    // age inheritance). `externalAddrs` is built from the addr-type cache + EXCLUDE_LABELS by main().
    const ext = opts.externalAddrs || new Set();
    const touchesExt = e => e.type === "split"
      ? (ext.has(e.source) || e.recipients.some(a => ext.has(a)))
      : (ext.has(e.target) || e.sources.some(a => ext.has(a)));
    splitIdx = new Set();
    for (const e of splitEvents) { e.unverified = touchesExt(e); if (!e.unverified) for (const i of e.idx) splitIdx.add(i); }
  }
  const splitsByTs = splitEvents.slice().sort((a, b) => a.ts - b.ts);

  const wallets = new Map(); // addr -> {q:[{ts,price,qty}], head, bal}
  const get = a => { let e = wallets.get(a); if (!e) { e = { q: [], head: 0, bal: 0 }; wallets.set(a, e); } return e; };
  // Move lots from source → recipient PRESERVING their acquisition ts + price (age + cost basis), for
  // a detected self-split. No realized-P/L / coin-days accounting — it's a relocation, not a sale.
  const moveLots = (from, to, amount) => {
    const s = wallets.get(from); if (!s) return;
    const d = get(to);
    let need = amount;
    while (need > EPS && s.head < s.q.length) {
      const lot = s.q[s.head], take = Math.min(lot.qty, need);
      lot.qty -= take; s.bal -= take; need -= take;
      d.q.push({ ts: lot.ts, price: lot.price, qty: take }); d.bal += take;
      if (lot.qty <= EPS) { s.q[s.head] = null; s.head++; }
    }
  };
  // FIFO consume; returns, for the spent coins:
  //   val/cost   — realized VALUE (qty×send price) and COST (qty×lot price) → SOPR + realized P/L
  //   profit/loss — realized gain and realized loss in USD, split per lot (a spend can consume
  //                 lots above AND below the send price) → Net Realized Profit/Loss (NRPL)
  //   cdd        — COIN-DAYS DESTROYED: qty × how long each lot was held → dormancy / liveliness
  //   moved      — qty actually consumed (< amount only on an oversell)
  const consume = (e, amount, sendPrice, sendTs) => {
    let need = amount, val = 0, cost = 0, profit = 0, loss = 0, cdd = 0;
    while (need > EPS && e.head < e.q.length) {
      const lot = e.q[e.head], take = Math.min(lot.qty, need);
      lot.qty -= take; e.bal -= take; need -= take;
      val += take * sendPrice; cost += take * lot.price;
      profit += take * Math.max(0, sendPrice - lot.price);
      loss += take * Math.max(0, lot.price - sendPrice);
      cdd += take * (sendTs - lot.ts) / DAY;
      if (lot.qty <= EPS) { e.q[e.head] = null; e.head++; }
    }
    return { val, cost, profit, loss, cdd, moved: amount - need };
  };

  // A split transfer creates NO fresh lot on receive — the source's aged lots are moved over in send().
  const recv = t => { if (splitIdx.has(t.i)) return; if (t.to && !exclude.has(t.to)) { const price = priceAt(t.ts); if (price != null) { const e = get(t.to); e.q.push({ ts: t.ts, price, qty: t.amt }); e.bal += t.amt; } } };
  const send = t => {
    if (splitIdx.has(t.i)) { if (t.from && !exclude.has(t.from)) moveLots(t.from, t.to, t.amt); return; } // relocation, not a spend
    if (t.from && !exclude.has(t.from)) { const e = wallets.get(t.from); if (e) { const sp = priceAt(t.ts); const r = consume(e, t.amt, sp ?? 0, t.ts); winCDD += r.cdd; winVol += r.moved; if (sp != null) { winVal += r.val; winCost += r.cost; winProfit += r.profit; winLoss += r.loss; } } }
  };
  // Track balances on the EXCLUDED addresses too (they're not "holders", but their kind —
  // CEX/LP/custody vs bridge/burn — drives the LIQUID vs ILLIQUID supply split). Sum the
  // "liquid excluded" (cex+lp+custody) supply per sample so liquid supply over time =
  // short-term-holder supply + liquid-excluded.
  const exBal = new Map();
  const exTouch = t => {
    if (t.to && exclude.has(t.to)) exBal.set(t.to, (exBal.get(t.to) || 0) + t.amt);
    if (t.from && exclude.has(t.from)) exBal.set(t.from, (exBal.get(t.from) || 0) - t.amt);
  };
  const liqKinds = new Set(["cex", "lp", "custody"]);
  const liqExcluded = () => { let s = 0; for (const [a, b] of exBal) { if (b > EPS && liqKinds.has(EXCLUDE_LABELS[a]?.kind)) s += b; } return s; };
  // Per-kind excluded balances, so the LIQUID bucket can be split into its parts. CEX
  // balance over time is the exchange-flow / sell-side proxy (coins ON exchanges); its
  // week-over-week DELTA is the netflow. LP balance is Uniswap liquidity depth (a different
  // story — providing liquidity, not selling), which BTC on-chain analytics can't isolate.
  const kindBal = kind => { let s = 0; for (const [a, b] of exBal) { if (b > EPS && EXCLUDE_LABELS[a]?.kind === kind) s += b; } return s; };
  // Per-VENUE cex balance (Coinbase vs Binance vs Kraken …) — the CEX total split by exchange,
  // so the supply curve can be stacked by venue + a current market-share donut drawn. Only
  // venues with a positive balance are emitted.
  const cexByVenue = () => {
    const v = {};
    for (const [a, b] of exBal) { if (b > EPS && EXCLUDE_LABELS[a]?.kind === "cex") { const name = canonVenue(EXCLUDE_LABELS[a].name); v[name] = (v[name] || 0) + b; } }
    for (const k of Object.keys(v)) v[k] = +v[k].toFixed(2);
    return v;
  };

  const rows = [];
  // URPD OVER TIME setup: one fixed price grid from the full range of acquisition prices (a cheap
  // pre-pass over the transfers), then a per-week slice binned into it. `stride` keeps it ~weekly
  // even when the sample grid is daily, so the terrain stays ~150 slices, not ~1,100.
  let urpdHist = null, uGrid = null;
  if (opts.collectUrpdHistory) {
    let gMin = Infinity, gMax = -Infinity;
    for (const t of tx) { if (t.to && !exclude.has(t.to)) { const pr = priceAt(t.ts); if (pr > 0) { if (pr < gMin) gMin = pr; if (pr > gMax) gMax = pr; } } }
    if (Number.isFinite(gMin) && gMax > 0) { uGrid = urpdGrid(gMin, gMax, opts.urpdHistBuckets ?? 40); urpdHist = []; }
  }
  const uStride = Math.max(1, opts.urpdHistStride ?? 1);
  // per-sample-window spend accumulators (SOPR + NRPL + dormancy) and the running total
  // of coin-days destroyed (for liveliness, which is cumulative by definition).
  let p = 0, winVal = 0, winCost = 0, winProfit = 0, winLoss = 0, winCDD = 0, winVol = 0, cumCDD = 0;
  let splitP = 0, splitCumN = 0, splitCumSup = 0;   // cumulative detected self-splits, for disclosure
  // WHALE WATCHER: snapshot every wallet's balance at a few lookback checkpoints, so the final
  // state can be diffed against them → who has been ADDING vs SHEDDING. `wallets` already
  // excludes CEX/LP/bridge/burn (EXCLUDE), so these are real holders, not infrastructure.
  const lastTs = sampleTs.at(-1);
  const checkpoints = (opts.whaleLookback || [1, 7, 30]).map(d => ({ d, target: lastTs - d * DAY, snap: null }));
  for (const sTs of sampleTs) {
    // Replay up to this sample, ONE BLOCK (same timestamp) at a time — applying every
    // RECEIVE before every SEND in the block. block_timestamp is per-block, second-
    // granularity, and the extract has no tx/log index to resolve intra-block order; a
    // send processed before its same-block receive would hit an empty balance, skip the
    // consume, and leave a phantom balance (inflating held supply ~1.75×). Receives-first
    // fixes that without needing the ordering columns.
    while (p < tx.length && tx[p].ts <= sTs) {
      const ts0 = tx[p].ts, start = p;
      while (p < tx.length && tx[p].ts === ts0) p++;
      for (let k = start; k < p; k++) { exTouch(tx[k]); recv(tx[k]); }
      for (let k = start; k < p; k++) send(tx[k]);
    }
    const row = snapshot(wallets, sTs, priceAt(sTs), thr);
    while (splitP < splitsByTs.length && splitsByTs[splitP].ts <= sTs) { splitCumN++; splitCumSup += splitsByTs[splitP].supply; splitP++; }
    row.splitCount = splitCumN;                    // cumulative detected self-relocations (splits + merges)
    row.splitSupply = +splitCumSup.toFixed(2);     // supply that has flowed through a detected self-move
    row.liqEx = +(liqExcluded() / 1).toFixed(2); // CEX+LP+custody supply (tokens) — the always-liquid excluded bucket
    row.cexBal = +kindBal("cex").toFixed(2);     // SPX on tagged CEX addresses — exchange-flow / sell-side proxy
    // The other two pieces of the non-holder supply, so the city's harbour reads them live instead
    // of from documented constants: the Wormhole bridge (what actually backs Base and Solana) and
    // the burn. The burn is fixed by definition — 0x…dead is receive-only — but emitting it means
    // nothing downstream has to hardcode a number that could silently go stale.
    row.bridgeBal = +kindBal("bridge").toFixed(2);
    row.burnBal = +kindBal("burn").toFixed(2);
    row.cexVenues = cexByVenue();                // that CEX total split by exchange (Kraken/Bybit/Coinbase/…)
    row.lpBal = +kindBal("lp").toFixed(2);       // SPX in Uniswap LP — liquidity depth (our edge vs BTC on-chain)
    // SOPR for this window = realized value ÷ cost of all coins that MOVED since the
    // last sample. >1 = holders spending at a profit, <1 = at a loss. null = nothing moved.
    row.sopr = winCost > EPS ? +(winVal / winCost).toFixed(4) : null;
    // NET REALIZED PROFIT/LOSS — the DOLLAR magnitude of gains vs losses locked in this
    // window (SOPR is the ratio; this is the size). Big red = capitulation, big green = profit-taking.
    row.nrplProfit = +winProfit.toFixed(2);
    row.nrplLoss = +winLoss.toFixed(2);
    row.nrpl = +(winProfit - winLoss).toFixed(2);
    // DORMANCY — average age (days) of the coins that moved this window (coin-days destroyed ÷
    // volume). LIVELINESS — cumulative coin-days destroyed ÷ coin-days ever created; the created
    // total is exactly destroyed + still-alive, and `row.coinDays` is the still-alive sum at this
    // sample. Rises when old coins spend (distribution), falls when the base sits still (HODLing).
    row.cdd = +winCDD.toFixed(2);
    row.dormancy = winVol > EPS ? +(winCDD / winVol).toFixed(2) : null;
    cumCDD += winCDD;
    row.liveliness = (cumCDD + row.coinDays) > EPS ? +(cumCDD / (cumCDD + row.coinDays)).toFixed(4) : null;
    rows.push(row);
    // URPD-over-time slice: bin the current held lots into the fixed grid at ~weekly stride (always
    // include the final sample so the terrain's leading edge is today).
    if (urpdHist) {
      const idx = rows.length - 1;
      if (idx % uStride === 0 || sTs === lastTs) {
        const { pct } = binHeldSupply(wallets, uGrid);
        urpdHist.push({ d: iso(sTs), spot: +(priceAt(sTs) ?? 0).toFixed(7), pct });
      }
    }
    // capture the balance map the first time we reach each lookback checkpoint
    for (const c of checkpoints) {
      if (!c.snap && sTs >= c.target) { const m = new Map(); for (const [a, e] of wallets) if (e.bal > EPS) m.set(a, e.bal); c.snap = m; }
    }
    winVal = 0; winCost = 0; winProfit = 0; winLoss = 0; winCDD = 0; winVol = 0;
  }
  // WHALE WATCHER: the biggest CURRENT holders, each with how much they've added or shed over
  // the lookback windows and how long their oldest still-held lot has sat. One row per wallet —
  // the raw material for the 3D skyline (tower = size × conviction, colour = accumulating/shedding).
  const buildWhales = () => {
    const arr = [];
    for (const [a, e] of wallets) {
      if (e.bal <= EPS) continue;
      let oldest = Infinity;
      for (let i = e.head; i < e.q.length; i++) { const lot = e.q[i]; if (lot && lot.qty > EPS && lot.ts < oldest) oldest = lot.ts; }
      arr.push({ a, bal: e.bal, oldest });
    }
    arr.sort((x, y) => y.bal - x.bal);

    // ⭐ RESIDENCY, not a top-N. A wallet earns a building by holding a real position for a real
    // length of time — 5,000 SPX for 90 days — rather than by beating 1,499 others on a leaderboard.
    // Two reasons that is the better rule. A rank cutoff makes the city churn every time the order
    // shuffles, and it silently changes meaning as the holder base grows; a fixed bar means being in
    // the city always says exactly the same thing about you.
    //
    // DENOMINATED IN TOKENS, NEVER DOLLARS. A USD bar would evict a chunk of the city on a week when
    // nobody sold anything — the price moved, that's all. Token balances change only when someone
    // actually acts, which is what the city is a map of.
    //
    // HYSTERESIS: once resident you keep your building until you fall below 0.8x the bar. Without
    // it every wallet sitting near 5,000 blinks in and out week to week, which reads as a rendering
    // fault rather than as anything true.
    const MIN_TOKENS = Number(opts.minTokens ?? 5000);
    const MIN_DAYS = Number(opts.minDays ?? 90);
    const WATCH_FLOOR = Number(opts.watchFloor ?? 100000);   // ≥100k whales ship at ANY tenure
    const KEEP = 0.8;
    const resident = new Set(opts.previousResidents || []);
    const CAP = Number(opts.whaleTop ?? 8000);   // a backstop against pathological data, not a rank

    const daysOf = w => Number.isFinite(w.oldest) ? Math.round((lastTs - w.oldest) / DAY) : 0;
    // CITY RESIDENCY: a real position (≥MIN_TOKENS) held for a real time (≥MIN_DAYS), with hysteresis.
    const isResident = w => daysOf(w) >= MIN_DAYS && (w.bal >= MIN_TOKENS || (resident.has(w.a) && w.bal >= MIN_TOKENS * KEEP));
    // A wallet is emitted if it's EITHER a city resident OR a ≥100k whale of any tenure — the Whales
    // Watching monitor wants fresh whales too (to read flows in/out of the ecosystem), so it drops the
    // 90-day bar the city keeps. `res` records which: the city filters res:true, the watcher takes ≥100k.
    const qualifies = w => w.bal >= WATCH_FLOOR || isResident(w);

    return arr.filter(qualifies).slice(0, CAP).map(w => {
      const o = { a: w.a, bal: +w.bal.toFixed(2), days: daysOf(w), res: isResident(w) };
      // delta vs each checkpoint. A wallet absent from the snapshot was empty then, so the
      // delta is its whole balance — a genuinely NEW whale, which is exactly what we want to show.
      for (const c of checkpoints) if (c.snap) o[`d${c.d}`] = +(w.bal - (c.snap.get(w.a) || 0)).toFixed(2);
      return o;
    });
  };

  // URPD (cost-basis distribution) is a CURRENT-STATE histogram — compute it for the
  // final wallet state only, returned alongside the rows when requested.
  if (opts.collectUrpd || opts.collectWhales || opts.collectUrpdHistory || opts.collectEntities) {
    const out = { rows };
    // Entity clustering (Phase 2) reuses the engine's OWN already-sorted tx — no second 2.7M sort/copy.
    if (opts.collectEntities) {
      const ent = clusterEntities(tx, { exclude, externalAddrs: opts.externalAddrs, ...(opts.entityOpts || {}) });
      // Enrich each entity with its COMBINED current holdings (Phase 3 — "who owns what"): the sum of its
      // members' live balances and how many of them still hold. This is what lets the entity view show real
      // concentration ("one owner controls X across N wallets") vs the by-wallet view. Held supply is emitted
      // too, so % of holder supply can be computed without a cross-file join.
      let held = 0;
      for (const w of wallets.values()) if (w.bal > EPS) held += w.bal;
      // Reuse the whale-watcher lookback snapshots (balance maps at 1/7/30d ago) to score each
      // cluster BUY vs SELL: sum every member's (now − then) over the window. Fresh members (absent
      // then) count their whole balance as inflow; drained members count as outflow — so the entity's
      // net accumulation/distribution reads correctly even as it shuffles wallets. Per-member flow +
      // age are emitted too, so the 3D can render each wallet as a cube (size, age hue, buy/sell beam).
      const c30 = checkpoints.find(c => c.d === 30);
      for (const e of ent.entities) {
        let bal = 0, holders = 0; const wb = {}, wf = {}, wg = {}, wf7 = {}, wf1 = {};
        const flow = {}; for (const c of checkpoints) flow[c.d] = 0;
        for (const a of e.wallets) {
          const w = wallets.get(a); const b = (w && w.bal > EPS) ? w.bal : 0;
          wb[a] = +b.toFixed(2); if (b > 0) { bal += b; holders++; }
          for (const c of checkpoints) if (c.snap) flow[c.d] += b - (c.snap.get(a) || 0);
          const snapF = d => { const c = checkpoints.find(x => x.d === d); return c && c.snap ? b - (c.snap.get(a) || 0) : 0; };
          const f30 = c30 && c30.snap ? b - (c30.snap.get(a) || 0) : 0, f7 = snapF(7), f1 = snapF(1);
          if (b > 0 || Math.abs(f30) > EPS) {   // hold now, or moved in the window → render/track it
            wf[a] = +f30.toFixed(2);
            let oldest = Infinity;
            if (w) for (let i = w.head; i < w.q.length; i++) { const lot = w.q[i]; if (lot && lot.qty > EPS && lot.ts < oldest) oldest = lot.ts; }
            wg[a] = Number.isFinite(oldest) ? Math.round((lastTs - oldest) / DAY) : 0;
          }
          // sparse per-member flow at the shorter windows (only movers), for the 3D cluster city granularity
          if (Math.abs(f7) > EPS) wf7[a] = +f7.toFixed(2);
          if (Math.abs(f1) > EPS) wf1[a] = +f1.toFixed(2);
        }
        e.bal = +bal.toFixed(2); e.holders = holders; e.walletBal = wb;   // per-wallet balances → sized bubbles in the graph view
        e.walletFlow = wf; e.walletAge = wg;                              // per-member 30d net flow + holding age → 3D cubes/beams
        e.walletFlow7 = wf7; e.walletFlow1 = wf1;                          // per-member 7d / 24h net (sparse) → 3D window toggle
        for (const c of checkpoints) e[`d${c.d}`] = +flow[c.d].toFixed(2); // entity net flow over each window → buy/sell signal
      }
      ent.entities.sort((a, b) => b.bal - a.bal || b.size - a.size);   // rank by combined holdings for the explorer
      out.entities = {
        updated: iso(lastTs), spot: priceAt(lastTs) ?? 0, heldSupply: +held.toFixed(2),
        method: "EOA→EOA drain/fund clustering — a wallet emptied into, or a fresh wallet funded by, another plain wallet is the same entity moving funds. CEX/LP/contract legs are exits, never links. Hubs (many funders) and oversized clusters are flagged, not trusted. Links on SPX flows only — a common ETH/gas funder that never touched SPX is not seen.",
        params: { minTokens: opts.entityOpts?.minTokens ?? 50000, emptyFrac: opts.entityOpts?.emptyFrac ?? 0.9, maxInDegree: opts.entityOpts?.maxInDegree ?? 8, maxOutDegree: opts.entityOpts?.maxOutDegree ?? 40, maxCluster: opts.entityOpts?.maxCluster ?? 30 },
        stats: ent.stats, entities: ent.entities,
      };
    }
    if (opts.collectUrpd) {
      const s = priceAt(sampleTs.at(-1)), d = iso(sampleTs.at(-1));
      out.urpd = computeUrpd(wallets, s, d, opts.urpdBuckets ?? 42);
      // A FINER cost-basis grid for the "Cost Basis vs Price" volume-profile (more price pockets,
      // better when zoomed). Kept separate from `buckets` so the standard histogram + the cards
      // (which draw one bar per bucket) stay readable at the coarse count.
      out.urpd.bucketsFine = computeUrpd(wallets, s, d, opts.urpdFine ?? 160).buckets;
    }
    if (opts.collectWhales) out.whales = { updated: iso(lastTs), spot: priceAt(lastTs) ?? 0, lookback: checkpoints.map(c => c.d), wallets: buildWhales() };
    // The detected self-relocation EVENTS (which wallets, when), newest first — for verification +
    // a future disclosure surface. Dated + typed (split / consolidation).
    out.selfMoves = {
      updated: iso(lastTs), count: splitEvents.length, supply: +splitEvents.reduce((s, e) => s + e.supply, 0).toFixed(2),
      reAged: splitEvents.filter(e => !e.unverified).length,                                    // EOA-only moves that got the age re-link
      flagged: splitEvents.filter(e => e.unverified).length,                                    // external-touched → shown, not re-aged
      events: splitEvents.slice().sort((a, b) => b.ts - a.ts).map(e => ({
        type: e.type, date: iso(e.ts), supply: +e.supply.toFixed(2), n: e.n, unverified: !!e.unverified,
        ...(e.type === "split" ? { source: e.source, recipients: e.recipients } : { target: e.target, sources: e.sources }),
      })),
    };
    if (urpdHist) out.urpdHistory = {
      updated: iso(lastTs), pMin: +Math.exp(uGrid.loLog).toFixed(7), pMax: +Math.exp(uGrid.hiLog).toFixed(7),
      nBuckets: uGrid.nBuckets, edges: uGrid.edges, weeks: urpdHist,
    };
    return out;
  }
  return rows;
}

// Cost-basis distribution ("URPD" — Unrealized Realized Price Distribution): the share of
// currently-held supply grouped by the PRICE each coin was acquired at (its FIFO lot cost).
// The classic Glassnode/ITC "where are the bags" histogram — the walls of supply. Buckets
// are log-spaced across the held cost range; each is flagged in/out of profit vs current spot.
//
// Each lot ALSO carries its acquisition timestamp, so we split every cost-basis bucket by
// HOLDING AGE (the same 5 bands as HODL waves: 0-1m/1-3m/3-6m/6-12m/1y+). That gives the joint
// cost-basis × age distribution — for a round-tripping asset like SPX the SAME price bucket holds
// coins of very different ages (bought on the way up vs on the way down), which the 1D histogram
// can't show. `bucket.age` is that split (each entry = % of ALL held supply, so they sum to
// bucket.pct); a 2D "cost basis × age" heatmap reads straight off it, and the 1D URPD is unchanged.
const URPD_AGE_DAYS = [30, 90, 180, 365]; // band cutoffs → [0-1m, 1-3m, 3-6m, 6-12m, 1y+]
export function computeUrpd(wallets, spot, updated, nBuckets = 42) {
  const lots = [];
  let held = 0;
  for (const e of wallets.values()) {
    if (e.bal <= EPS) continue;
    for (let i = e.head; i < e.q.length; i++) {
      const lot = e.q[i]; if (!lot || lot.qty <= EPS || !(lot.price > 0)) continue;
      lots.push(lot); held += lot.qty;
    }
  }
  if (!lots.length || held <= 0) return { spot: spot ?? 0, updated, held: 0, buckets: [] };
  // "now" for age = the snapshot date (fall back to the newest lot if `updated` won't parse).
  let nowTs = Date.parse(updated);
  if (!Number.isFinite(nowTs)) { nowTs = -Infinity; for (const l of lots) if (l.ts > nowTs) nowTs = l.ts; }
  const ageBand = ts => { const d = (nowTs - ts) / DAY; let a = 0; while (a < URPD_AGE_DAYS.length && d >= URPD_AGE_DAYS[a]) a++; return a; };
  let pmin = Infinity, pmax = -Infinity;
  for (const l of lots) { if (l.price < pmin) pmin = l.price; if (l.price > pmax) pmax = l.price; }
  if (pmin === pmax) pmax = pmin * 1.0001; // degenerate guard
  const lo = Math.log(pmin), hi = Math.log(pmax), span = hi - lo || 1;
  const b = Array.from({ length: nBuckets }, () => 0);
  const bAge = Array.from({ length: nBuckets }, () => [0, 0, 0, 0, 0]); // qty per (bucket, age band)
  for (const l of lots) {
    let k = Math.floor(((Math.log(l.price) - lo) / span) * nBuckets);
    if (k < 0) k = 0; if (k >= nBuckets) k = nBuckets - 1;
    b[k] += l.qty; bAge[k][ageBand(l.ts)] += l.qty;
  }
  const edge = k => Math.exp(lo + (span * k) / nBuckets);
  const buckets = b.map((qty, k) => {
    const e0 = edge(k), e1 = edge(k + 1), mid = Math.sqrt(e0 * e1);
    return {
      lo: +e0.toFixed(7), hi: +e1.toFixed(7), pct: +(100 * qty / held).toFixed(3),
      inProfit: spot != null && mid <= spot,
      age: bAge[k].map(q => +(100 * q / held).toFixed(4)), // % of held per age band (sums to pct)
    };
  });
  return { spot: spot != null ? +spot.toFixed(7) : 0, updated, held: +held.toFixed(2), ageBands: ["0-1m", "1-3m", "3-6m", "6-12m", "1y+"], buckets };
}

// URPD OVER TIME — a cost-basis histogram per week on a SINGLE FIXED price grid, so the weekly
// slices stack into a coherent terrain (price × time × supply). computeUrpd re-derives its price
// range per call, which is right for a one-off histogram but wrong for a surface (every week would
// sit on a different x-axis). Here the grid is built ONCE from the full range of acquisition prices,
// then every emitted week bins its currently-held lots into that same grid. Exported for unit tests.
export function urpdGrid(pMin, pMax, nBuckets) {
  const loLog = Math.log(pMin), hiLog = Math.log(pMax > pMin ? pMax : pMin * 1.0001);
  const span = (hiLog - loLog) || 1;
  const edges = Array.from({ length: nBuckets + 1 }, (_, k) => +Math.exp(loLog + span * k / nBuckets).toFixed(7));
  return { loLog, hiLog, span, nBuckets, edges };
}
export function binHeldSupply(wallets, grid) {
  const b = Array.from({ length: grid.nBuckets }, () => 0);
  let held = 0;
  for (const e of wallets.values()) {
    if (e.bal <= EPS) continue;
    for (let i = e.head; i < e.q.length; i++) {
      const lot = e.q[i]; if (!lot || lot.qty <= EPS || !(lot.price > 0)) continue;
      let k = Math.floor(((Math.log(lot.price) - grid.loLog) / grid.span) * grid.nBuckets);
      if (k < 0) k = 0; if (k >= grid.nBuckets) k = grid.nBuckets - 1;
      b[k] += lot.qty; held += lot.qty;
    }
  }
  return { held: +held.toFixed(2), pct: held > 0 ? b.map(q => +(100 * q / held).toFixed(3)) : b };
}

function snapshot(wallets, sTs, spot, thr) {
  const bals = [];
  let held = 0, rcap = 0, profitQty = 0, coinDays = 0;
  const age = [0, 0, 0, 0, 0];
  let lthP = 0, lthL = 0, sthP = 0, sthL = 0;
  for (const e of wallets.values()) {
    if (e.bal <= EPS) continue;
    bals.push(e.bal); held += e.bal;
    for (let i = e.head; i < e.q.length; i++) {
      const lot = e.q[i]; if (!lot || lot.qty <= EPS) continue;
      const ageD = (sTs - lot.ts) / DAY;
      rcap += lot.qty * lot.price;
      coinDays += lot.qty * ageD;            // still-alive coin-days (for liveliness)
      age[ageBand(ageD)] += lot.qty;
      const lth = (sTs - lot.ts) >= thr, inProfit = spot != null && spot >= lot.price;
      if (inProfit) { profitQty += lot.qty; if (lth) lthP += lot.qty; else sthP += lot.qty; }
      else { if (lth) lthL += lot.qty; else sthL += lot.qty; }
    }
  }
  bals.sort((a, b) => b - a);
  const topN = n => held > 0 ? +(100 * bals.slice(0, n).reduce((s, x) => s + x, 0) / held).toFixed(2) : 0;
  // The WHALE COHORT, defined by size rather than by rank. top10/top100 is a fixed
  // headcount, so its share falling only ever says "concentration eased". A size
  // threshold lets the count and the share move independently, which is where the
  // finding lives: the count has been flat near 175 for two years while the share fell
  // from 82% to 66%. Same wallets, steadily less of the float — something HODL waves
  // cannot show, since long-held supply says nothing about WHO holds it.
  const whaleThr = held / 1000;                       // 0.1% of holder supply
  const whales = bals.filter(b => b >= whaleThr);
  // The same supply split by WALLET SIZE, in absolute tokens — the tier equivalent of
  // HODL waves. One threshold can only say the whale cohort shed 21 points; the ladder
  // says where those points landed, which turns out to be the two tiers immediately
  // below rather than dust. Absolute bands rather than % of float because "holds a
  // million SPX" is a thing a person can picture, and it is how Bitcoin's own wallet-
  // size waves are cut.
  const TIER_EDGES = [1e3, 1e4, 1e5, 1e6];          // <1k · 1k-10k · 10k-100k · 100k-1M · 1M+
  const tierTok = new Array(TIER_EDGES.length + 1).fill(0);
  for (const b of bals) {
    let i = 0; while (i < TIER_EDGES.length && b >= TIER_EDGES[i]) i++;
    tierTok[i] += b;
  }
  // The same wallets binned by what they were WORTH that week, in dollars. Deliberately
  // HEADCOUNT, not share of supply: a dollar band's share of supply is ~85% just the coin
  // price moving (measured — hold the price fixed and only 17% of the movement survives),
  // which would dress a price chart up as a distribution chart. How many wallets sit in
  // each bracket is the honest question the dollar axis can answer, and it is the one
  // people actually ask.
  const USD_EDGES = [100, 1e3, 1e4, 1e5];           // <$100 · $100-1k · $1k-10k · $10k-100k · $100k+
  const wealthN = new Array(USD_EDGES.length + 1).fill(0);
  if (spot != null && spot > 0) {
    for (const b of bals) {
      const usd = b * spot;
      let i = 0; while (i < USD_EDGES.length && usd >= USD_EDGES[i]) i++;
      wealthN[i]++;
    }
  }
  const pct = q => held > 0 ? +(100 * q / held).toFixed(2) : 0;
  const rp = held > 0 ? rcap / held : 0;
  return {
    d: iso(sTs),
    sip: pct(profitQty),
    top10: topN(10), top100: topN(100),
    whaleN: whales.length,
    whalePct: held > 0 ? +(100 * whales.reduce((a, b) => a + b, 0) / held).toFixed(2) : 0,
    tiers: tierTok.map(v => (held > 0 ? +(100 * v / held).toFixed(2) : 0)),
    wealth: wealthN,                                  // wallet COUNT per USD bracket

    gini: +gini(bals).toFixed(4),
    age: age.map(pct),
    coinDays: +coinDays.toFixed(2),         // still-alive coin-days at this sample (liveliness denominator)
    holders: bals.length,
    heldTokens: +held.toFixed(2), // holder supply in tokens (for the liquid/illiquid split)
    rp: +rp.toFixed(7), mvrv: rp > 0 && spot != null ? +(spot / rp).toFixed(4) : 0,
    spot: spot != null ? +spot.toFixed(7) : 0,
    lthProfit: pct(lthP), lthLoss: pct(lthL), sthProfit: pct(sthP), sthLoss: pct(sthL),
  };
}

// ── CSV ingestion (streaming, column-flexible) ───────────────────────────────
function splitCsv(line) { return line.split(",").map(s => s.trim().replace(/^"|"$/g, "")); }
const idx = (hdr, ...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };

async function loadTransfers(path, decimals) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let hdr = null, cf, ct, ctime, cval, raw = false, scale = 10 ** decimals, out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!hdr) {
      hdr = splitCsv(line).map(s => s.toLowerCase());
      cf = idx(hdr, "from", "sender"); ct = idx(hdr, "to", "receiver");
      ctime = idx(hdr, "time", "evt_block_time", "block_time", "day");
      cval = idx(hdr, "amount", "value"); raw = hdr[cval] === "value";
      if (cf < 0 || ct < 0 || ctime < 0 || cval < 0) throw new Error(`transfers header missing columns: ${hdr}`);
      continue;
    }
    const c = splitCsv(line);
    const ts = Date.parse(c[ctime]); const v = Number(c[cval]);
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    out.push({ from: c[cf], to: c[ct], ts, amt: raw ? v / scale : v });
  }
  return out;
}

async function loadPrices(path) {
  const txt = await readFile(path, "utf8");
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const hdr = splitCsv(lines[0]).map(s => s.toLowerCase());
  const cd = idx(hdr, "day", "date", "time"), cp = idx(hdr, "price", "usd", "close");
  if (cd < 0 || cp < 0) throw new Error(`prices header missing day/price: ${hdr}`);
  return lines.slice(1).map(l => splitCsv(l)).map(c => [dayFloor(Date.parse(c[cd])), Number(c[cp])])
    .filter(([d, p]) => Number.isFinite(d) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const tPath = args.transfers, pPath = args.prices;
  if (!tPath || !pPath) { console.error("usage: node scripts/build-onchain-local.mjs --transfers=raw.csv --prices=price.csv [--out=public/onchain.json] [--urpd=public/urpd.json] [--decimals=8] [--daily] [--threshold=90]"); process.exit(1); }
  const decimals = Number(args.decimals ?? 8);
  const transfers = await loadTransfers(tPath, decimals);
  const priced = await loadPrices(pPath);
  console.log(`loaded ${transfers.length} transfers, ${priced.length} price days`);
  const priceAt = makePriceAt(priced);
  // reduce, NOT Math.min(...arr) — spreading millions of args overflows the call stack.
  let t0 = Infinity, t1 = -Infinity;
  for (const t of transfers) { if (t.ts < t0) t0 = t.ts; if (t.ts > t1) t1 = t.ts; }
  // Daily grid runs from the first transfer's day THROUGH the last transfer's day, inclusive — clamp
  // the end to dayFloor(t1) so the newest row is never stamped 1–2 days in the future (a `+2` length
  // overshot the real data; metrics were correct but the row's `d` label read ahead of the data).
  const g0 = dayFloor(t0), g1 = dayFloor(t1);
  const grid = args.daily
    ? Array.from({ length: (g1 - g0) / DAY + 1 }, (_, i) => g0 + i * DAY)
    : mondays(t0, t1);
  // Who lived here last run. Hysteresis needs it: a resident keeps their building down to 0.8x the
  // bar, so nobody near the threshold blinks in and out week to week. Missing file on the first run
  // simply means nobody is grandfathered, which is correct.
  const whalesPath = args.whales || (args.out || "public/onchain.json").replace(/[^/]+$/, "whales.json");
  let prevResidents = [];
  try { prevResidents = (JSON.parse(await readFile(whalesPath, "utf8")).wallets || []).map(w => w.a); }
  catch { /* first run */ }

  // PHASE-1 entity foundation: the persistent address-type cache (contract vs EOA), built by
  // enrich-addr-types.mjs. Addresses typed "contract" are EXTERNAL endpoints (Gnosis Safes, DEX
  // settlement, routers) — a self-move that touches one is surfaced but NOT re-aged. Missing file →
  // nothing extra gated (the base engine already excludes tagged CEX/LP), the enrichment fills it in.
  const externalAddrs = new Set();
  try {
    const at = JSON.parse(await readFile(args.addrtypes || (args.out || "public/onchain.json").replace(/[^/]+$/, "addr-types.json"), "utf8"));
    for (const [a, t] of Object.entries(at.types || {})) if (t === "contract") externalAddrs.add(a.toLowerCase());
  } catch { /* no cache yet */ }

  const { rows, urpd, whales, urpdHistory, selfMoves, entities } = replayFifo(transfers, priceAt, grid, { externalAddrs, thresholdDays: Number(args.threshold ?? 90), collectUrpd: true, urpdBuckets: Number(args.buckets ?? 72), collectWhales: true,
    collectEntities: true,
    collectUrpdHistory: true, urpdHistBuckets: Number(args.urpdhist_buckets ?? 40), urpdHistStride: args.daily ? 7 : 1,
    whaleTop: Number(args.whales_top ?? 8000),
    minTokens: Number(args.whale_min ?? 5000),
    minDays: Number(args.whale_days ?? 90),
    previousResidents: prevResidents });
  const clean = rows.filter(r => r.holders > 0);
  const out = args.out || "public/onchain.json";
  await writeFile(out, JSON.stringify(clean));
  // URPD histogram is a small current-state companion file (default sibling of `out`).
  const urpdOut = args.urpd || out.replace(/[^/]+$/, "urpd.json");
  await writeFile(urpdOut, JSON.stringify(urpd));
  // Whale watcher companion (top current holders + how much they've added/shed).
  const whalesOut = whalesPath;
  await writeFile(whalesOut, JSON.stringify(whales));
  // CEX flow Sankey companion — who supplies / withdraws from exchanges, + exchange candidates.
  // Emitted at THREE windows (90 / 30 / 7 days) so the chart can offer granularity; the 90-day slice
  // stays at top level for back-compat, the rest live under byWindow.
  try {
    const dust = Number(args.cexflow_dust ?? 25000);
    const wins = [90, 30, 7];
    const byWindow = {}; let cf = null;
    for (const d of wins) {
      const w = computeCexFlow(transfers, { asOf: t1, days: d, dust });
      byWindow[d] = { window: w.window, totals: w.totals, inflow: w.inflow, outflow: w.outflow };
      if (d === 90) cf = w;
    }
    cf = { ...cf, windows: wins, byWindow };   // flat 90d fields + byWindow{90,30,7}
    const cfOut = out.replace(/[^/]+$/, "cex-sankey.json");
    await writeFile(cfOut, JSON.stringify(cf));
    console.log(`Wrote ${cfOut}: in ${(cf.totals.in / 1e6).toFixed(1)}M · out ${(cf.totals.out / 1e6).toFixed(1)}M · ${cf.candidates.length} exchange candidate(s)${cf.candidates[0] ? " (top " + cf.candidates[0].a.slice(0, 10) + ": " + cf.candidates[0].txIn + " in / " + cf.candidates[0].txOut + " out, " + cf.candidates[0].cp + " parties)" : ""}`);
  } catch (e) { console.warn("cex-sankey:", e.message); }
  // Self-relocation events companion — which wallets split/merged, when (for verification + disclosure).
  if (selfMoves) {
    const smOut = out.replace(/[^/]+$/, "self-moves.json");
    await writeFile(smOut, JSON.stringify(selfMoves));
    console.log(`Wrote ${smOut}: ${selfMoves.count} self-moves · ${(selfMoves.supply / 1e6).toFixed(2)}M SPX`);
  }
  // Entity clustering companion (Phase 2) — which wallets belong to one owner (drain/fund graph).
  // The raw by-wallet metrics are UNCHANGED; this is a second, disclosed view (validate before wiring).
  if (entities) {
    const enOut = out.replace(/[^/]+$/, "entities.json");
    await writeFile(enOut, JSON.stringify(entities));
    const s = entities.stats;
    console.log(`Wrote ${enOut}: ${s.entities} multi-wallet entities · ${s.clustered} wallets clustered · largest ${s.largest} · flagged ${s.flagged} · ${s.hubs} hubs dropped`);
  }
  // URPD-over-time companion (weekly cost-basis slices on one fixed grid → the 3D terrain).
  if (urpdHistory) {
    const uhOut = out.replace(/[^/]+$/, "urpd-history.json");
    await writeFile(uhOut, JSON.stringify(urpdHistory));
    console.log(`Wrote ${uhOut}: URPD history ${urpdHistory.weeks.length} slices × ${urpdHistory.nBuckets} buckets · $${urpdHistory.pMin}–$${urpdHistory.pMax}`);
  }
  const c = clean.at(-1);
  console.log(`Wrote ${out}: ${clean.length} rows. Latest ${c.d}: rp $${c.rp} · mvrv ${c.mvrv}× · sip ${c.sip}% · sopr ${c.sopr} · holders ${c.holders} · top100 ${c.top100}% · age ${c.age.join("/")}`);
  console.log(`Wrote ${urpdOut}: URPD ${urpd.buckets.length} buckets · held ${urpd.held} · spot $${urpd.spot}`);
  const wAdd = whales.wallets.filter(w => (w.d30 ?? 0) > 0).length, wCut = whales.wallets.filter(w => (w.d30 ?? 0) < 0).length;
  console.log(`Wrote ${whalesOut}: ${whales.wallets.length} whales · ${wAdd} adding / ${wCut} shedding (30d) · biggest ${whales.wallets[0]?.bal.toLocaleString()} SPX`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("build-onchain-local failed:", e.message); process.exit(1); });
}
