import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNotable } from "../scripts/bot/notable.mjs";
import { aeonFlow } from "../src/aeon-flow.js";

// A helper to find an item by lane.
const lane = (brief, l) => brief.items.find(i => i.lane === l);

test("detectNotable: surfaces a whale split from self-moves", () => {
  const brief = detectNotable({
    onchain: [{ d: "2026-08-16" }],
    selfMoves: { events: [{ type: "split", date: "2026-08-10", supply: 5_728_930, n: 5, source: "0xabc0000000000000000000000000000000000001", unverified: true }] },
  });
  const it = lane(brief, "whale-moves");
  assert.ok(it, "whale-moves item present");
  assert.match(it.headline, /5\.73M-SPX wallet split into 5/);
  assert.equal(it.verify.href, "https://etherscan.io/address/0xabc0000000000000000000000000000000000001");
  assert.ok(it.severity > 5);
});

test("detectNotable: exchange-flow fires only on an accelerated window", () => {
  // Flat balance for 40 days, then a sharp 7-day build-up → a large z-score.
  const days = [];
  for (let i = 0; i < 40; i++) days.push([`d${i}`, 100_000_000, 0, 0, 0, 0, 0.3]);
  for (let i = 0; i < 7; i++) days.push([`e${i}`, 100_000_000 + (i + 1) * 1_000_000, 0, 0, 0, 0, 0.3]);
  const brief = detectNotable({ onchain: [{ d: "x" }], cexFlow: { days } });
  const it = lane(brief, "exchange-flow");
  assert.ok(it, "exchange-flow fires on the spike");
  assert.match(it.headline, /onto exchanges/);

  // A steady drift must NOT fire (within noise).
  const flat = [];
  for (let i = 0; i < 47; i++) flat.push([`d${i}`, 100_000_000 + i * 1000, 0, 0, 0, 0, 0.3]);
  const calm = detectNotable({ onchain: [{ d: "x" }], cexFlow: { days: flat } });
  assert.equal(lane(calm, "exchange-flow"), undefined, "no false positive on a gentle drift");
});

test("detectNotable: composite driver flags the outlier axis", () => {
  const brief = detectNotable({
    onchain: [{ d: "x" }],
    valuation: { cur: { composite: 0.2, byAxis: { valuation: 0.06, relative: 0.08, flow: 0.57, conviction: 0.15, sentiment: 0.37 } } },
  });
  const it = lane(brief, "composite-driver");
  assert.ok(it, "driver item present");
  assert.match(it.headline, /exchange flow/);
});

test("detectNotable: AEON accumulation via the shared aeonFlow", () => {
  const trades = [];
  for (let i = 0; i < 8; i++) trades.push({ f: "0xseller" + i, to: "0xbuyer", eth: 0.5, usd: 900, token: i, d: "2026-08-14" });
  const brief = detectNotable({ onchain: [{ d: "x" }], aeonSales: { trades }, aeonOnchain: { holders: [] } }, aeonFlow);
  const it = lane(brief, "aeon-accum");
  assert.ok(it, "aeon-accum present");
  assert.match(it.headline, /scooped 8 AEON/);
});

test("detectNotable: a self-move older than the 7-day window drops out (freshness)", () => {
  const brief = detectNotable({
    onchain: [{ d: "2026-08-27" }],
    selfMoves: { events: [{ type: "split", date: "2026-08-05", supply: 6_000_000, n: 5, source: "0x1" }] }, // 22d old
  });
  assert.equal(lane(brief, "whale-moves"), undefined, "a 22-day-old split is no longer news");
  // but a 2-day-old one still is
  const fresh = detectNotable({
    onchain: [{ d: "2026-08-27" }],
    selfMoves: { events: [{ type: "split", date: "2026-08-25", supply: 6_000_000, n: 5, source: "0x1" }] },
  });
  assert.ok(lane(fresh, "whale-moves"), "a 2-day-old split still surfaces");
});

test("detectNotable: market scans surface band / heat / risk / YTD / month with card mappings", () => {
  const ph = [], base = Date.parse("2026-01-01");
  for (let i = 0; i < 240; i++) ph.push({ date: new Date(base + i * 86400000).toISOString().slice(0, 10), price: 0.40 + i * 0.0006 });
  const sp = ph.map((p, i) => [p.date, 6800 + i * 2]);
  const refDate = ph.at(-1).date;
  const brief = detectNotable({ onchain: [{ d: refDate }], priceHistory: ph, spSeries: sp });
  for (const l of ["band", "heat20w", "risklevel", "ytd-vs-sp", "month-green"]) assert.ok(lane(brief, l), `${l} present`);
  assert.equal(lane(brief, "band").card, "rainbow");
  assert.equal(lane(brief, "risklevel").card, "risklevels");
  assert.equal(lane(brief, "month-green").card, "monthlyreturns");
  assert.equal(lane(brief, "ytd-vs-sp").card, "sp500ytd");
  assert.equal(lane(brief, "heat20w").card, "riskheat");
  // every scan is a state or a change, never a raw "event"
  for (const l of ["band", "heat20w", "risklevel", "ytd-vs-sp", "month-green"]) assert.ok(["state", "change"].includes(lane(brief, l).kind));
});

test("detectNotable: quiet data yields an empty-ish brief, never throws", () => {
  const brief = detectNotable({ onchain: [{ d: "2026-08-16" }] });
  assert.equal(brief.date, "2026-08-16");
  assert.ok(Array.isArray(brief.items));
  // ranks are contiguous from 1
  brief.items.forEach((it, i) => assert.equal(it.rank, i + 1));
});

test("detectNotable: one item per lane, ranked by severity descending", () => {
  const brief = detectNotable({
    onchain: [{ d: "x" }],
    selfMoves: { events: [{ type: "split", date: "d", supply: 6_000_000, n: 4, source: "0x1" }, { type: "split", date: "d", supply: 5_000_000, n: 3, source: "0x2" }] },
  });
  const whaleItems = brief.items.filter(i => i.lane === "whale-moves");
  assert.equal(whaleItems.length, 1, "deduped to one per lane");
  for (let i = 1; i < brief.items.length; i++) assert.ok(brief.items[i - 1].severity >= brief.items[i].severity);
});
