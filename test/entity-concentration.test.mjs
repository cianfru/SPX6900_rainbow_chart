import test from "node:test";
import assert from "node:assert/strict";
import { entityConcentration } from "../src/entity-concentration.js";

// The one dishonesty the clustering pipeline guards against is OVERSTATING concentration,
// and this module sits right on that edge: it merges wallets into owners. These tests pin
// the merge rules — flagged clusters never fuse, cluster members never double-count, and
// the raw side reproduces the plain by-wallet sum — so a careless edit can't quietly
// inflate (or deflate) the headline share.

// Synthetic world: heldSupply 1000. Wallet pool of 120 addresses so the top-100 maths is
// exercised; two clusters own the biggest bags.
function fixture({ flagSecond = false } = {}) {
  const wallets = [];
  // cluster A: 3 wallets of 50 each (owner bal 150) — the largest owner when merged
  const A = ["0xa1", "0xa2", "0xa3"];
  A.forEach(a => wallets.push({ a, bal: 50 }));
  // cluster B: 2 wallets of 40 each (owner bal 80)
  const B = ["0xb1", "0xb2"];
  B.forEach(a => wallets.push({ a, bal: 40 }));
  // 115 singles with descending balances 30, 29.8, 29.6, ... keeps everything rankable
  for (let i = 0; i < 115; i++) wallets.push({ a: `0xs${i}`, bal: 30 - i * 0.2 });
  const ent = {
    updated: "2026-08-23",
    heldSupply: 1000,
    entities: [
      { id: "0xa1", size: 3, flagged: false, wallets: A, bal: 150 },
      { id: "0xb1", size: 2, flagged: flagSecond, wallets: B, bal: 80 },
    ],
  };
  return { ent, whales: { wallets } };
}

test("merges unflagged clusters into single owners and never double-counts members", () => {
  const { ent, whales } = fixture();
  const r = entityConcentration(ent, whales);
  assert.ok(r);
  // raw top10 = 50+50+50+40+40+30+29.8+29.6+29.4+29.2 = 378 → 37.8%
  assert.ok(Math.abs(r.raw.top10 - 37.8) < 1e-9);
  // owner top10 = 150 (A) + 80 (B) + eight singles 30..28.6 = 464.4 → 46.44%
  assert.ok(Math.abs(r.owner.top10 - 46.44) < 1e-9);
  // merging can only concentrate the top — owner share must be ≥ raw share
  assert.ok(r.owner.top10 >= r.raw.top10);
  assert.ok(r.owner.top100 >= r.raw.top100);
  assert.equal(r.largest.bal, 150);
  assert.equal(r.largest.size, 3);
  assert.equal(r.largest.rank, 1);
  assert.equal(r.clustersInTop100, 2);
  assert.equal(r.updated, "2026-08-23");
});

test("a flagged cluster is NOT fused — its members count individually, like the raw view", () => {
  const { ent, whales } = fixture({ flagSecond: true });
  const r = entityConcentration(ent, whales);
  assert.ok(r);
  // B stays two 40s; owner top10 = 150 + 40 + 40 + seven singles 30..28.8 = 435.8 → 43.58%
  assert.ok(Math.abs(r.owner.top10 - 43.58) < 1e-9);
  assert.equal(r.clustersInTop100, 1);
  // the raw side is untouched by flagging
  assert.ok(Math.abs(r.raw.top10 - 37.8) < 1e-9);
});

test("cluster membership matching is case-insensitive", () => {
  const { ent, whales } = fixture();
  whales.wallets.forEach(w => { w.a = w.a.toUpperCase(); });
  const r = entityConcentration(ent, whales);
  assert.ok(r);
  assert.ok(Math.abs(r.owner.top10 - 46.44) < 1e-9, "uppercased pool addresses must still dedupe against cluster members");
});

test("a cluster whose members sit below the wallet-pool floor still enters through its combined bal", () => {
  const { ent, whales } = fixture();
  // drop cluster A's members from the pool entirely (as if each were under the whales floor)
  whales.wallets = whales.wallets.filter(w => !w.a.startsWith("0xa"));
  const r = entityConcentration(ent, whales);
  assert.ok(r);
  // owner ranking still sees the 150 owner at #1
  assert.equal(r.largest.bal, 150);
  assert.equal(r.largest.rank, 1);
});

test("degenerate inputs return null, never NaN", () => {
  const { ent, whales } = fixture();
  assert.equal(entityConcentration(null, whales), null);
  assert.equal(entityConcentration(ent, null), null);
  assert.equal(entityConcentration({ ...ent, heldSupply: 0 }, whales), null);
  assert.equal(entityConcentration({ ...ent, entities: "nope" }, whales), null);
  // too few wallets to rank a top-100 honestly
  assert.equal(entityConcentration(ent, { wallets: whales.wallets.slice(0, 50) }), null);
});

test("malformed rows are skipped, not crashed on", () => {
  const { ent, whales } = fixture();
  ent.entities.push({ id: "bad" }, null, { id: "x", flagged: false, wallets: ["0xz"], bal: NaN });
  whales.wallets.push(null, { a: 42, bal: 10 }, { a: "0xok", bal: NaN });
  const r = entityConcentration(ent, whales);
  assert.ok(r);
  assert.ok(Number.isFinite(r.owner.top10) && Number.isFinite(r.raw.top100));
});
