import test from "node:test";
import assert from "node:assert/strict";
import { pickNotable, saleCopy } from "../scripts/bot/aeon-sale-watch.mjs";
import { tierOf } from "../scripts/bot/aeon-sale-card.mjs";

const TODAY = "2026-07-23";
const d = n => new Date(Date.parse(TODAY) - n * 86400e3).toISOString().slice(0, 10);
const sale = o => ({ id: 1, price: 0.5, rank: 2000, exp: 0.5, disc: 0, img: null, d: TODAY, ...o });

test("picks nothing when no sale clears a notability bar", () => {
  const rows = [sale({ id: 1, disc: 0.05 }), sale({ id: 2, price: 0.6, disc: -0.1 })];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }), null);
});

test("flags a steal (>=20% under what that rarity trades at)", () => {
  const got = pickNotable([sale({ id: 7, price: 0.4, exp: 0.6, disc: 0.33 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "steal");
  assert.equal(got.sale.id, 7);
});

test("flags a rare piece trading at all, even at a fair price", () => {
  const got = pickNotable([sale({ id: 9, rank: 42, disc: 0 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "rare");
});

test("flags a big sale at >=2x the market level", () => {
  const got = pickNotable([sale({ id: 3, price: 1.4, disc: -0.5 })], { level: 0.59, today: TODAY });
  assert.equal(got.kind, "big");
});

test("a steal outranks a rare and a big sale", () => {
  const rows = [
    sale({ id: 1, rank: 10, disc: 0 }),                       // rare
    sale({ id: 2, price: 2.0, disc: -0.5 }),                  // big
    sale({ id: 3, price: 0.35, exp: 0.6, disc: 0.42 }),       // steal
  ];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }).sale.id, 3);
});

test("ignores stale sales outside the freshness window", () => {
  const rows = [sale({ id: 5, rank: 10, d: d(9) })];
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY }), null);
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY, days: 30 }).sale.id, 5);
});

test("never re-posts a sale already recorded", () => {
  const rows = [sale({ id: 8, rank: 12 })];
  const posted = new Set([`8@${TODAY}`]);
  assert.equal(pickNotable(rows, { level: 0.59, today: TODAY, posted }), null);
});

test("copy leads with the number, names the rarity, and stays in the instant-read budget", () => {
  const pick = { sale: sale({ id: 2167, price: 0.417, exp: 0.604, rank: 257, disc: 0.31 }), kind: "steal" };
  const traits = [{ t: "Head Accessory", v: "Ultra-Helmet", pct: 0.54 }];
  const txt = saleCopy(pick, { total: 3333, tier: tierOf(257, 3333), traits });
  assert.match(txt, /#2167/);
  assert.match(txt, /31% under/);
  assert.match(txt, /0\.54%/);
  assert.equal(txt.split("\n").length, 3, "house style is exactly 3 lines");
  assert.ok([...txt].length <= 600, `copy too long: ${[...txt].length}`);
});
