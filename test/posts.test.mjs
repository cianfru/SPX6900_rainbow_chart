// Smoke tests for the daily X bot's post builders (scripts/bot/posts.mjs). These
// catch a post that throws, renders empty text, or emits a card the renderer
// can't draw — without needing network or X credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds } from "../scripts/bot/posts.mjs";

const last = DEFAULT_RAW.at(-1);
const stats = computeStats(last.price, last.date);
const ids = allIds(stats);

test("the BTC-cycle post series is wired into the rotation", () => {
  for (const id of ["cycle", "cyclepeak", "cycleclock"]) {
    assert.ok(ids.includes(id), `missing post: ${id}`);
  }
});

test("the milestone + model cards are wired into the rotation", () => {
  for (const id of ["milestones", "memecoins", "btcgrade", "model"]) {
    assert.ok(ids.includes(id), `missing post: ${id}`);
  }
});

test("every available post builds non-empty text + a renderable card", () => {
  assert.ok(ids.length >= 8, `expected a healthy rotation, got ${ids.length}`);
  for (const id of ids) {
    const p = buildPost(stats, new Date(), id);
    assert.equal(p.id, id, "override id is honored");
    assert.equal(typeof p.text, "string");
    assert.ok(p.text.trim().length > 0 && p.text.length < 4000, `text length sane for ${id}`);
    assert.ok(p.text.includes("#spx6900"), `branded footer present for ${id}`);
    assert.ok(p.card && ["rainbow", "line", "bar", "mbars", "donut", "stack", "compare", "model", "cube", "scale", "gauge", "heatmap", "dca", "kraken"].includes(p.card.type), `valid card type for ${id}`);
  }
});

test("the daily rotation actually rotates through topics", () => {
  const seen = new Set();
  for (let d = 0; d < ids.length * 2; d++) {
    seen.add(buildPost(stats, new Date(d * 86400000)).id);
  }
  assert.ok(seen.size > 1, `rotation should surface multiple posts, saw ${seen.size}`);
});

test("bullish cards are weighted to appear more often than neutral ones", () => {
  const count = {};
  for (let d = 0; d < 400; d++) {
    const id = buildPost(stats, new Date(d * 86400000)).id;
    count[id] = (count[id] || 0) + 1;
  }
  // a representative bullish card should out-appear a representative neutral one
  assert.ok((count.milestones || 0) > (count.risk || 0),
    `milestones (${count.milestones}) should beat risk (${count.risk})`);
  assert.ok((count.cycle || 0) > (count.monthlybars || 0),
    `cycle (${count.cycle}) should beat monthlybars (${count.monthlybars})`);
  // the de-rotated drawdown card must never auto-post (still buildable via override)
  assert.equal(count.drawdown || 0, 0, "drawdown is excluded from the daily rotation");
});
