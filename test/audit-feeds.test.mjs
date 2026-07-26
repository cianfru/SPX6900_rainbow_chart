import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { FEEDS, STATE, auditFeed, dateOf, rowsOf } from "../scripts/audit-feeds.mjs";

const TODAY = "2026-07-26";

test("every JSON file in public/ is either an audited feed or declared state", () => {
  // The audit is only as good as its coverage: a new feed that nobody listed is a
  // feed nobody is watching. The script reports these as UNTRACKED; this fails CI.
  const known = new Set([...FEEDS.map(f => f.file), ...STATE]);
  const untracked = readdirSync("public").filter(f => f.endsWith(".json") && !known.has(f));
  assert.deepEqual(untracked, [], `add these to FEEDS (a data feed) or STATE (runtime state): ${untracked.join(", ")}`);
});

test("a feed whose date is inside its cadence passes", () => {
  const doc = [{ d: "2026-07-25", p: 1 }, { d: "2026-07-26", p: 2 }];
  const r = auditFeed({ file: "x", cadence: 2, window: 2, fields: ["p"] }, doc, TODAY);
  assert.equal(r.status, "ok");
});

test("a stale feed fails", () => {
  const doc = [{ d: "2026-07-01", p: 1 }];
  const r = auditFeed({ file: "x", cadence: 2 }, doc, TODAY);
  assert.equal(r.status, "fail");
  assert.match(r.notes.join(" "), /25d old/);
});

test("a field that never arrived fails — the cexBal case", () => {
  // Fresh dates, correct row count, one column null the whole way down.
  const doc = Array.from({ length: 8 }, (_, i) => ({ d: `2026-07-${19 + i}`, p: i, cexBal: null }));
  const r = auditFeed({ file: "x", cadence: 2, window: 6, fields: ["p", "cexBal"] }, doc, TODAY);
  assert.equal(r.status, "fail");
  assert.match(r.notes.join(" "), /cexBal: never populated/);
});

test("a field that stopped arriving is distinguished from one that never did", () => {
  const doc = Array.from({ length: 10 }, (_, i) => ({ d: `2026-07-${17 + i}`, x: i < 2 ? 5 : null }));
  const r = auditFeed({ file: "x", cadence: 2, window: 6, fields: ["x"] }, doc, TODAY);
  assert.match(r.notes.join(" "), /x: stopped arriving/);
});

test("a soft field only warns", () => {
  const doc = Array.from({ length: 8 }, (_, i) => ({ d: `2026-07-${19 + i}`, sopr: null }));
  const r = auditFeed({ file: "x", cadence: 2, window: 6, soft: ["sopr"] }, doc, TODAY);
  assert.equal(r.status, "warn");
});

test("a frozen field warns", () => {
  const doc = Array.from({ length: 8 }, (_, i) => ({ d: `2026-07-${19 + i}`, v: 42 }));
  const r = auditFeed({ file: "x", cadence: 2, window: 6, fields: ["v"] }, doc, TODAY);
  assert.equal(r.status, "warn");
  assert.match(r.notes.join(" "), /frozen or forward-filled/);
});

test("object-shaped feeds are judged on their keys, not on rows", () => {
  const doc = { updated: TODAY, floor: 0.87, owners: 1173, listings: [], tokens: [1, 2] };
  const ok = auditFeed({ file: "x", cadence: 2, require: ["floor", "owners"], nonEmpty: ["tokens"], mayBeEmpty: ["listings"] }, doc, TODAY);
  assert.equal(ok.status, "ok");
  assert.match(ok.notes.join(" "), /listings: empty/);

  const bad = auditFeed({ file: "x", cadence: 2, nonEmpty: ["tokens", "missingKey"] }, { updated: TODAY, tokens: [] }, TODAY);
  assert.equal(bad.status, "fail");
  assert.match(bad.notes.join(" "), /tokens: empty/);
  assert.match(bad.notes.join(" "), /missingKey: missing/);
});

test("a missing file fails rather than being skipped", () => {
  const r = auditFeed({ file: "gone.json", cadence: 2 }, undefined, TODAY);
  assert.equal(r.status, "fail");
});

test("dateOf prefers the file's own stamp, then its last row", () => {
  assert.equal(dateOf({ updated: "2026-07-26T04:00:00Z" }), "2026-07-26");
  assert.equal(dateOf({ date: "2026-07-25", signals: [] }), "2026-07-25");
  assert.equal(dateOf([{ d: "2026-07-24" }]), "2026-07-24");
  assert.equal(dateOf({ series: [{ d: "2026-07-23" }] }), "2026-07-23");
  assert.equal(dateOf([["2026-07-22", 1]]), "2026-07-22");
});

test("rowsOf finds the series whatever it is called", () => {
  assert.equal(rowsOf([1, 2]).length, 2);
  assert.equal(rowsOf({ series: [1] }).length, 1);
  assert.equal(rowsOf({ points: [1, 2, 3] }).length, 3);
  assert.equal(rowsOf({ nothing: 1 }).length, 0);
});
