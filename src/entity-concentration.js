// Entity-adjusted concentration — "who owns what" applied to the top-N share.
// The by-wallet concentration (onchain.json top10/top100) treats every address as a
// separate holder, but the clustering engine (entities.json) knows which addresses one
// owner controls. This recomputes today's top-10 / top-100 share BY OWNER: each unflagged
// cluster votes once with its combined balance; every other wallet stays itself.
//
// Honesty rails (owner rules, 2026-08-11):
//  - Merge ONLY unflagged clusters. Flagged / over-sized ones are uncertain — fusing them
//    would OVERSTATE concentration, the one dishonesty the clustering pipeline guards
//    against — so their member wallets count individually, exactly as the raw view does.
//    (Hub-like routers never survive to entities.json — their edges are dropped in the
//    engine — so "unflagged" is the only filter needed here.)
//  - The result is a FLOOR on real concentration: the engine links wallets through SPX
//    flows only, so a shared ETH/gas funder that never touched SPX is invisible.
//  - Same pool, same denominator as the raw read: whales.json balances + entities.json
//    heldSupply, which reproduce onchain.json's latest top10/top100 exactly — so the
//    raw-vs-owner delta is apples-to-apples, never a definitional artifact.
//
// Pure and side-effect free so it unit-tests offline (test/entity-concentration.test.mjs).

/**
 * @param {{entities:Array, heldSupply:number, updated?:string}|null} ent  parsed /entities.json
 * @param {{wallets:Array<{a:string,bal:number}>}|null} whales             parsed /whales.json
 * @returns {null | {
 *   raw:   { top10:number, top100:number },
 *   owner: { top10:number, top100:number },
 *   largest: null | { bal:number, size:number, rank:number },
 *   clustersInTop100: number,
 *   updated: string|null,
 * }} shares in % of held (tracked, non-excluded) supply; null when inputs can't support the read.
 */
export function entityConcentration(ent, whales) {
  const entities = ent?.entities;
  const held = ent?.heldSupply;
  const pool = whales?.wallets;
  if (!Array.isArray(entities) || !Array.isArray(pool) || !Number.isFinite(held) || held <= 0) return null;

  // Wallets already represented by an unflagged cluster — they must not ALSO count solo.
  const clustered = new Set();
  const owners = [];
  for (const e of entities) {
    if (e?.flagged || !Array.isArray(e?.wallets) || !Number.isFinite(e?.bal)) continue;
    for (const a of e.wallets) if (typeof a === "string") clustered.add(a.toLowerCase());
    owners.push({ bal: e.bal, size: e.size ?? e.wallets.length, cluster: true });
  }

  const rawBals = [];
  for (const w of pool) {
    if (!w || typeof w.a !== "string" || !Number.isFinite(w.bal)) continue;
    rawBals.push(w.bal);
    if (!clustered.has(w.a.toLowerCase())) owners.push({ bal: w.bal, size: 1, cluster: false });
  }
  // whales.json only carries the big wallets, but the top-100 threshold sits far above its
  // floor, so nothing rankable is missing; a cluster whose members are all sub-floor still
  // enters through its combined bal above.
  if (rawBals.length < 100 || owners.length < 100) return null;

  owners.sort((a, b) => b.bal - a.bal);
  rawBals.sort((a, b) => b - a);
  const share = (arr, n, pick) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += pick ? pick(arr[i]) : arr[i];
    return (s / held) * 100;
  };

  const top100 = owners.slice(0, 100);
  const iLargest = owners.findIndex(o => o.cluster);
  return {
    raw:   { top10: share(rawBals, 10), top100: share(rawBals, 100) },
    owner: { top10: share(owners, 10, o => o.bal), top100: share(owners, 100, o => o.bal) },
    largest: iLargest === -1 ? null
      : { bal: owners[iLargest].bal, size: owners[iLargest].size, rank: iLargest + 1 },
    clustersInTop100: top100.filter(o => o.cluster).length,
    updated: ent?.updated ?? null,
  };
}
