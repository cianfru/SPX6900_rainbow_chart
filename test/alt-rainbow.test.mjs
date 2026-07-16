import { test } from "node:test";
import assert from "node:assert/strict";
import { altRatio, buildAltRainbow, zLabel } from "../src/alt-rainbow.js";

const DAY = 86400000;
const iso = n => new Date(Date.UTC(2023, 7, 24) + n * DAY).toISOString().slice(0, 10);
const near = (a, b, e = 0.02) => assert.ok(Math.abs(a - b) <= e, `${a} ≈ ${b}`);

test("altRatio joins SPX and TOTAL3ES on common dates only", () => {
  const spx = [[iso(0), 1], [iso(1), 2], [iso(2), 3]];
  const alt = [[iso(0), 10], [iso(2), 30]]; // no day 1
  const r = altRatio(spx, alt);
  assert.deepEqual(r.map(p => p.d), [iso(0), iso(2)]);
  near(r[0].ratio, 0.1); near(r[1].ratio, 0.1);
});

test("a perfectly exponential ratio → z≈0 everywhere, slope recovered", () => {
  const n = 120, b = 0.01;
  const spx = [], alt = [];
  for (let i = 0; i < n; i++) { spx.push([iso(i), Math.exp(b * i)]); alt.push([iso(i), 1e9]); }
  const R = buildAltRainbow(spx, alt);
  assert.equal(R.series.length, n);
  near(R.series[0].rr, 1);                     // rebased to launch
  near(R.cur.rr, Math.exp(b * (n - 1)), 0.5);
  near(R.fit.b, b, 0.001);                     // recovered daily log-slope
  assert.ok(R.fit.sigma < 1e-6, "no residual on a clean exponential");
  assert.ok(Math.abs(R.cur.z) < 0.01);         // sits on trend
});

test("a final spike above trend reads as a high positive z", () => {
  const n = 120, b = 0.01, spx = [], alt = [];
  for (let i = 0; i < n; i++) { spx.push([iso(i), Math.exp(b * i)]); alt.push([iso(i), 1e9]); }
  spx[n - 1][1] *= 3;                          // 3× spike on the last day
  const R = buildAltRainbow(spx, alt);
  assert.ok(R.cur.z > 1.5, `spike should be stretched, got z=${R.cur.z}`);
  assert.match(R.cur.label, /stretched|outperforming/);
});

test("zLabel thresholds", () => {
  assert.match(zLabel(2), /stretched/);
  assert.match(zLabel(0), /in line/);
  assert.match(zLabel(-2), /deeply cheap/);
});
