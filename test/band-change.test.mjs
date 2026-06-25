// The band-watcher's event post: builds for each marquee band and renders a card.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildBandChangePost, MARQUEE_BANDS, bandPostDecision, BAND_COOLDOWN_MS, confirmBandCrossing, BAND_CONFIRM_READINGS } from "../scripts/bot/posts.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";

const base = computeStats(DEFAULT_RAW.at(-1).price, DEFAULT_RAW.at(-1).date, {});

test("marquee bands are Fire Sale / BUY / SELL / Max Bubble", () => {
  assert.deepEqual([...MARQUEE_BANDS].sort((a, b) => a - b), [0, 1, 7, 8]);
});

test("band-change post builds text + a valid card for each marquee band", () => {
  for (const to of MARQUEE_BANDS) {
    const s = { ...base, bandIndex: to, band: M.BAND_LABELS[to] };
    const from = to >= 4 ? to - 1 : to + 1; // approach from below for hot bands, above for cheap
    const post = buildBandChangePost(s, from);
    assert.equal(post.id, "bandchange");
    assert.ok(post.text.includes(M.BAND_LABELS[to].l), `names the ${M.BAND_LABELS[to].l} band`);
    assert.ok(post.text.includes("#spx6900"), "has branded footer");
    assert.equal(post.card.type, "rainbow");
    const png = renderPostCard(post, s);
    assert.ok(png[0] === 0x89 && png[1] === 0x50, "valid PNG card");
  }
});

test("direction wording flips with the crossing", () => {
  const s = { ...base, bandIndex: 1, band: M.BAND_LABELS[1] };
  assert.match(buildBandChangePost(s, 3).text, /dropped into/);  // 3 -> 1 = down
  assert.match(buildBandChangePost(s, 0).text, /climbed into/);  // 0 -> 1 = up
});

// --- band-watcher guardrails (bandPostDecision) ---
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const after = h => T0 + h * 3600 * 1000;

test("a fresh excursion into a marquee band posts", () => {
  const d = bandPostDecision({ bi: 1, state: { band: 3, armed: true }, now: T0 });
  assert.equal(d.shouldPost, true);
});

test("BUY<->Fire Sale oscillation only fires once (hysteresis)", () => {
  // 3(calm) -> 1: posts, then disarm. Each subsequent flap between two marquee
  // bands must NOT re-fire until price returns to a calm band.
  let state = { band: 3, armed: true, lastPostTs: null };
  const seq = [1, 0, 1, 0]; // BUY, Fire Sale, BUY, Fire Sale
  const fired = [];
  for (let i = 0; i < seq.length; i++) {
    const d = bandPostDecision({ bi: seq[i], state, dailyPostedToday: false, now: after(7 * (i + 1)) });
    fired.push(d.shouldPost);
    // mirror band-watch's state writes: disarm on a post, else carry armed forward
    state = d.shouldPost
      ? { band: seq[i], armed: false, lastPostTs: new Date(after(7 * (i + 1))).toISOString() }
      : { band: seq[i], armed: d.armed, lastPostTs: state.lastPostTs };
  }
  assert.deepEqual(fired, [true, false, false, false], "only the first crossing fires");
});

test("returning to a calm band re-arms a future marquee post", () => {
  const posted = { band: 0, armed: false, lastPostTs: new Date(T0).toISOString() };
  // climb to a calm band (3): re-arms
  const calm = bandPostDecision({ bi: 3, state: posted, now: after(30) });
  assert.equal(calm.armed, true);
  // a later drop back into a marquee band fires again
  const reEntry = bandPostDecision({ bi: 1, state: { band: 3, armed: true }, now: after(40) });
  assert.equal(reEntry.shouldPost, true);
});

test("daily post already out today suppresses band alerts", () => {
  const d = bandPostDecision({ bi: 0, state: { band: 3, armed: true }, dailyPostedToday: true, now: T0 });
  assert.equal(d.shouldPost, false);
});

test("cooldown blocks a second post inside the window", () => {
  const recent = { band: 3, armed: true, lastPostTs: new Date(T0).toISOString() };
  assert.equal(bandPostDecision({ bi: 1, state: recent, now: T0 + BAND_COOLDOWN_MS - 1 }).shouldPost, false);
  assert.equal(bandPostDecision({ bi: 1, state: recent, now: T0 + BAND_COOLDOWN_MS }).shouldPost, true);
});

// --- anti-spike confirmation (confirmBandCrossing) ---
test("a transient one-check spike across a band never confirms", () => {
  // confirmed band 0; price spikes to band 1 for a single check, then reverts.
  const spike = confirmBandCrossing({ bi: 1, state: { band: 0, pendingBand: null, pendingCount: 0 } });
  assert.equal(spike.confirmed, false);
  assert.equal(spike.pendingCount, 1);
  // next check back in band 0 → pending cleared, no crossing
  const revert = confirmBandCrossing({ bi: 0, state: { band: 0, pendingBand: spike.pendingBand, pendingCount: spike.pendingCount } });
  assert.equal(revert.confirmed, false);
  assert.equal(revert.pendingCount, 0);
});

test("a band held for BAND_CONFIRM_READINGS checks confirms", () => {
  let state = { band: 0, pendingBand: null, pendingCount: 0 }, res;
  for (let i = 1; i <= BAND_CONFIRM_READINGS; i++) {
    res = confirmBandCrossing({ bi: 1, state });
    assert.equal(res.pendingCount, i);
    assert.equal(res.confirmed, i >= BAND_CONFIRM_READINGS);
    state = { ...state, pendingBand: res.pendingBand, pendingCount: res.pendingCount };
  }
  assert.equal(res.confirmed, true);
});

test("a new pending band resets the count", () => {
  const res = confirmBandCrossing({ bi: 7, state: { band: 0, pendingBand: 1, pendingCount: 2 } });
  assert.equal(res.pendingBand, 7);
  assert.equal(res.pendingCount, 1);
});
