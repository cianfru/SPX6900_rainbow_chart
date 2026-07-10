// Parity between the site's model (src/models.js) and the bot's stats engine
// (scripts/bot/stats.mjs). stats.mjs re-derives center/band/risk/drawdown/targets
// inline; if those ever drift from models.js the bot would post numbers that
// disagree with the chart. These tests pin them together.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/models.js";
import { DEFAULT_RAW, ATH } from "../src/data.js";
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

test("drawdown / ATH fold in the true high-water mark (ATH), not just the thinned bundle", () => {
  // stats.ath = max(bundle max, the intraday ATH constant). The weekly bundle peaks at
  // $1.82 but the real ATH is higher, so the ATH constant should win.
  const rawMax = Math.max(...DEFAULT_RAW.map(r => r.price));
  const expectedAth = Math.max(rawMax, ATH.price);
  approx(s.ath, expectedAth);
  assert.ok(s.ath >= rawMax, "ATH is never below the bundle's own max");
  approx(s.drawdown, last.price / expectedAth - 1);
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

test("merged live history extends the drawn series but leaves the fit frozen", () => {
  // append two synthetic days beyond the bundled baseline
  const extra = [
    { date: "2026-06-07", price: 0.36 },
    { date: "2026-06-14", price: 0.40 },
  ];
  const merged = computeStats(0.40, "2026-06-14", { history: [...DEFAULT_RAW, ...extra] });
  // the drawn price line grows by exactly the appended points
  assert.equal(merged.series.price.length, DEFAULT_RAW.length + extra.length);
  assert.equal(merged.series.price.at(-1)[1], 0.40);
  // the residual scatter is thinned to ~weekly but still runs to the latest point
  assert.ok(merged.series.resid.length <= merged.series.price.length);
  assert.equal(merged.series.resid.at(-1)[0], Date.parse("2026-06-14"));
  // the model fit is unchanged — still the frozen bundled fit
  approx(merged.model.r2, m.r2);
  approx(merged.model.a, m.a);
  approx(merged.center, Math.exp(m.predict(M.dayN("2026-06-14"))));
});
