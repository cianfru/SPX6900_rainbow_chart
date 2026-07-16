import { test } from "node:test";
import assert from "node:assert/strict";
import { fitRainbow, altRatioSeries, buildAltRainbow, zLabel } from "../src/alt-rainbow.js";
import { TOTAL3ES } from "../src/total3es-history.js";

const DAY = 86400000;
const near = (a, b, e = 0.02) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test("fitRainbow: a perfectly exponential ratio → z≈0 everywhere, slope recovered", () => {
  const n = 120, b = 0.01, t0 = Date.UTC(2024, 0, 1);
  const pts = Array.from({ length: n }, (_, i) => ({ ts: t0 + i * DAY, ratio: Math.exp(b * i) }));
  const R = fitRainbow(pts);
  assert.equal(R.series.length, n);
  near(R.series[0].rr, 1);          // rebased to 1× at the start
  near(R.fit.b, b, 0.001);          // recovered daily log-slope
  assert.ok(R.fit.sigma <= 1e-6, "no residual on a clean exponential (σ floored)");
  assert.ok(Math.abs(R.cur.z) < 0.01);
});

test("fitRainbow: a final spike above trend reads as a high positive z", () => {
  const n = 120, b = 0.01, t0 = Date.UTC(2024, 0, 1);
  const pts = Array.from({ length: n }, (_, i) => ({ ts: t0 + i * DAY, ratio: Math.exp(b * i) }));
  pts[n - 1].ratio *= 3;
  const R = fitRainbow(pts);
  assert.ok(R.cur.z > 1.5, `spike should be stretched, got z=${R.cur.z}`);
  assert.match(R.cur.label, /stretched|outperforming/);
});

test("altRatioSeries: no history → just the bundle; forward point is rebased to the seam level", () => {
  const base = altRatioSeries([]);
  assert.ok(base.length > 100, "bundle base present");
  const seam = base.at(-1); // last bundle day

  // a forward snapshot the day after the seam: its rebased ratio must equal p / seamT3es
  // (the forward t3es cancels against the deterministic rebase = seamT3es / firstFwdT3es).
  const seamT3es = TOTAL3ES.at(-1)[1];
  const nextDay = new Date(Date.parse(seam.d) + DAY).toISOString().slice(0, 10);
  const withFwd = altRatioSeries([{ d: nextDay, p: 0.5, t3es: seamT3es * 1.15 }]); // 15% higher level
  assert.equal(withFwd.length, base.length + 1);
  near(withFwd.at(-1).ratio, 0.5 / seamT3es, 1e-14); // level offset rebased away
});

test("buildAltRainbow runs off the real bundle and returns a current z", () => {
  const R = buildAltRainbow([]);
  assert.ok(R && Number.isFinite(R.cur.z), "produces a fit");
  assert.ok(R.series.length > 100);
});

test("zLabel thresholds", () => {
  assert.match(zLabel(2), /stretched/);
  assert.match(zLabel(0), /in line/);
  assert.match(zLabel(-2), /deeply cheap/);
});
