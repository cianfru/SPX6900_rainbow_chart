import test from "node:test";
import assert from "node:assert/strict";
import { computeCexFlow } from "../scripts/build-onchain-local.mjs";

const DAY = 864e5;
const ASOF = Date.parse("2026-08-15T00:00:00Z");
const recent = ASOF - 5 * DAY, old = ASOF - 200 * DAY;
// two hot wallets of the SAME venue → canonVenue should merge them into "Kraken"
const labels = {
  "0xcex1": { name: "Kraken 245", kind: "cex" },
  "0xcex2": { name: "Kraken-linked", kind: "cex" },
  "0xlp": { name: "Uniswap V3: SPX", kind: "lp" },
};
const tr = (from, to, amt, ts = recent) => ({ from, to, amt, ts });

test("computeCexFlow: splits inflow vs outflow, merges venues, dust-rolls the tail", () => {
  const transfers = [
    tr("0xwhaleA", "0xcex1", 100000),        // inflow → Kraken
    tr("0xwhaleB", "0xcex2", 40000),         // inflow → Kraken (other hot wallet, same venue)
    tr("0xdust", "0xcex1", 1000),            // below dust → rolled into `more`
    tr("0xcex1", "0xwhaleC", 60000),         // outflow ← Kraken
    tr("0xwhaleD", "0xcex1", 90000, old),    // outside the window → ignored
    tr("0xcex1", "0xcex2", 500000),          // internal cex↔cex → never counted
  ];
  const r = computeCexFlow(transfers, { labels, asOf: ASOF, days: 90, dust: 25000, topN: 12 });
  assert.equal(r.inflow.length, 1, "one venue");
  assert.equal(r.inflow[0].venue, "Kraken");
  assert.equal(r.inflow[0].total, 141000, "100k + 40k + 1k dust");
  assert.deepEqual(r.inflow[0].top.map(x => x.amt), [100000, 40000], "dust excluded from top");
  assert.deepEqual(r.inflow[0].more, { n: 1, amt: 1000 }, "dust rolled up, not hidden");
  assert.equal(r.outflow[0].total, 60000);
  assert.deepEqual(r.totals, { in: 141000, out: 60000, net: 81000 });
});

test("computeCexFlow: flags an untagged high-throughput wallet as an exchange candidate", () => {
  const transfers = [];
  for (let i = 0; i < 35; i++) { transfers.push(tr("0xhub", "0xdest" + i, 5000)); transfers.push(tr("0xsrc" + i, "0xhub", 5000)); }
  const r = computeCexFlow(transfers, { labels, asOf: ASOF, days: 90 });
  const hub = r.candidates.find(c => c.a === "0xhub");
  assert.ok(hub, "0xhub flagged as a candidate");
  assert.ok(hub.txIn >= 30 && hub.txOut >= 30 && hub.cp >= 25, "throughput thresholds met");
});

test("computeCexFlow: a normal holder is NOT a candidate", () => {
  const r = computeCexFlow([tr("0xwhaleA", "0xcex1", 100000), tr("0xcex1", "0xwhaleA", 20000)], { labels, asOf: ASOF, days: 90 });
  assert.equal(r.candidates.find(c => c.a === "0xwhaleA"), undefined);
});
