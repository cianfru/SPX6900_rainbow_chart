// Parity between the site's model (src/models.js) and the bot's stats engine
// (scripts/bot/stats.mjs). stats.mjs re-derives center/band/risk/drawdown/targets
// inline; if those ever drift from models.js the bot would post numbers that
// disagree with the chart. These tests pin them together.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";

const m = M.buildModel(DEFAULT_RAW);
const last = DEFAULT_RAW.at(-1);
const day = M.dayN(last.date);
// Pin to a known historical point so the test is deterministic (no "today").
const s = computeStats(last.price, last.date);
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("center / band / vsCenter match models.js directly", () => {
  approx(s.center, Math.exp(m.predict(day)));
  assert.equal(s.bandIndex, M.bandIndex(m, last.price, day));
  assert.deepEqual(s.band, M.BAND_LABELS[s.bandIndex]);
  approx(s.vsCenter, last.price / s.center - 1);
});

test("risk matches buildRiskSeries' last value", () => {
  const rs = M.buildRiskSeries(m, DEFAULT_RAW);
  approx(s.risk, rs.at(-1).risk);
});

test("drawdown / ATH are consistent with the raw history", () => {
  const ath = Math.max(...DEFAULT_RAW.map(r => r.price));
  approx(s.ath, ath);
  approx(s.drawdown, last.price / ath - 1);
  assert.ok(s.drawdown <= 0 && s.drawdown > -1, "current drawdown is in (-1, 0]");
});

test("targets are price/price multiples of the canonical TARGETS", () => {
  assert.equal(s.targets.length, M.TARGETS.length);
  for (let i = 0; i < s.targets.length; i++) {
    approx(s.targets[i].mult, M.TARGETS[i].price / last.price);
  }
});

test("all-time return matches first→last price ratio", () => {
  approx(s.allTimeReturn, last.price / DEFAULT_RAW[0].price - 1);
  approx(s.firstPrice, DEFAULT_RAW[0].price);
});
