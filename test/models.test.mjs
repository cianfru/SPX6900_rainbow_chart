// Invariants for the statistical core (src/models.js). These lock the shape of
// the offset power-law fit and the band logic so a refactor can't silently
// change what the rainbow chart (and the bot) report.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";

const m = M.buildModel(DEFAULT_RAW);
const day = M.dayN(DEFAULT_RAW.at(-1).date);
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("buildModel produces a sane fit", () => {
  assert.equal(m.bands.length, 10, "10 percentile band offsets (9 labelled bands)");
  assert.ok(Number.isFinite(m.predict(100)), "predict is finite");
  assert.ok(m.std > 0, "residual std is positive");
  assert.ok(m.r2 > 0.5 && m.r2 < 1, `r2 in plausible range: ${m.r2}`);
  assert.ok(m.t0 >= 0 && m.t0 <= 500, `t0 stays within the search grid: ${m.t0}`);
});

test("residual bands are strictly increasing (p2 < … < p99.5)", () => {
  for (let i = 1; i < m.bands.length; i++) {
    assert.ok(m.bands[i] > m.bands[i - 1], `band offset ${i} > ${i - 1}`);
  }
});

test("bandIndex stays within [0, BAND_LABELS-1] across decades of price", () => {
  for (let p = 1e-4; p <= 1e5; p *= 2) {
    const bi = M.bandIndex(m, p, day);
    assert.ok(bi >= 0 && bi <= M.BAND_LABELS.length - 1, `band ${bi} out of range for price ${p}`);
  }
});

test("bandIndex agrees with bandVal thresholds", () => {
  // A price at the geometric midpoint between two band floors must land in the
  // lower band — this ties bandIndex() and bandVal() together.
  for (let i = 0; i < M.BAND_LABELS.length; i++) {
    const mid = Math.sqrt(M.bandVal(m, day, i) * M.bandVal(m, day, i + 1));
    assert.equal(M.bandIndex(m, mid, day), i, `midpoint of band ${i} maps to ${i}`);
  }
});

test("dayN / ds round-trip a date", () => {
  const d = DEFAULT_RAW.at(-1).date;
  assert.equal(M.ds(M.dayN(d)), d);
});

test("buildRiskSeries is bounded in [0,1] and pinned at the extremes", () => {
  const rs = M.buildRiskSeries(m, DEFAULT_RAW);
  assert.equal(rs.length, DEFAULT_RAW.length);
  let min = Infinity, max = -Infinity;
  for (const r of rs) {
    assert.ok(r.risk >= 0 && r.risk <= 1, `risk in [0,1]: ${r.risk}`);
    min = Math.min(min, r.risk); max = Math.max(max, r.risk);
  }
  approx(min, 0); approx(max, 1); // min–max normalized, so both ends are reached
});

test("piCycleRatio computes 111/(350*2) with real cross events and a bounded state", () => {
  const pc = M.piCycleRatio(DEFAULT_RAW);
  assert.ok(pc.rows.length > 0, "SPX is old enough for a 350-day MA");
  // ratio is finite and positive throughout; matches ma111/(ma350*2)
  for (const r of pc.rows) {
    assert.ok(r.ratio > 0 && Number.isFinite(r.ratio));
    approx(r.ratio, r.ma111 / (r.ma350 * 2));
  }
  assert.equal(pc.cur, pc.rows.at(-1));
  // peak is the max ratio in the series
  const maxR = Math.max(...pc.rows.map(r => r.ratio));
  approx(pc.peak.ratio, maxR);
  // SPX crossed above 1 at least once (the 2024-25 run), so a "top" event exists
  assert.ok(pc.crosses.some(c => c.type === "top"), "a top-zone cross exists");
});

test("piCycleState buckets the ratio into the right zone", () => {
  assert.equal(M.piCycleState(1.2).zone, "top");
  assert.equal(M.piCycleState(0.7).zone, "neutral");
  assert.equal(M.piCycleState(0.45).zone, "accum");
  assert.equal(M.piCycleState(0.25).zone, "deep");
  assert.equal(M.piCycleState(null).zone, "");
});

test("piCycleRatio degrades gracefully on too-short input", () => {
  const pc = M.piCycleRatio([{ date: "2026-01-01", price: 1 }]);
  assert.deepEqual(pc, { rows: [], cur: null, peak: null, crosses: [] });
});
