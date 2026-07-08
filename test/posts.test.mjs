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

// A coins-enabled stats so the live-data-gated posts (btc/majors/majorcaps/ytd)
// also build and get length-checked. Synthetic but deterministic.
const mkCoin = base => Array.from({ length: 380 }, (_, i) =>
  ({ date: new Date(Date.parse(last.date) - (380 - i) * 86400000).toISOString().slice(0, 10), price: base * (1 + i / 1000) }));
const statsCoins = computeStats(last.price, last.date, { coins: { btc: mkCoin(60000), eth: mkCoin(3000), sol: mkCoin(150) } });

// X-weighted length: most code points count 1, astral (emoji) count 2, and a URL
// counts as 23 regardless of its real length. Mirrors how X truncates the feed.
function xLen(text) {
  let urls = 0;
  const noUrls = text.replace(/https?:\/\/\S+/g, () => { urls += 23; return ""; });
  return urls + [...noUrls].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0);
}

test("the BTC-cycle post series is wired into the rotation", () => {
  for (const id of ["cycle", "cycleclock"]) {
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
    assert.ok(p.card && ["rainbow", "channel", "riskcolor", "risklevels", "riskheat", "runningroi", "longshort", "firesalerally", "underwater", "goldencross", "holdergrowth", "mvrvbtc", "cyclesync", "cycleclock", "rsidots", "monthcompare", "line", "bar", "mbars", "donut", "stack", "model", "cube", "scale", "gauge", "fngdial", "heatmap", "dca", "dcaladder", "kraken"].includes(p.card.type), `valid card type for ${id}`);
  }
});

test("every post fits X's visible preview (no \"See more\" barrier)", () => {
  // Hook + description + closing + branded footer must stay within X's visible
  // budget so the whole post reads in the timeline. 290 is the safe ceiling;
  // most land 250–280. Promo (kraken) included; its referral URL counts as 23.
  for (const id of allIds(statsCoins)) {
    const len = xLen(buildPost(statsCoins, new Date(), id).text);
    assert.ok(len <= 290, `post "${id}" is ${len} chars — over the 290 visible ceiling`);
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
  assert.ok((count.milestones || 0) > (count.timeinband || 0),
    `milestones (${count.milestones}) should beat timeinband (${count.timeinband})`);
  assert.ok((count.cycle || 0) > (count.monthlybars || 0),
    `cycle (${count.cycle}) should beat monthlybars (${count.monthlybars})`);
  // the de-rotated cards must never auto-post (still buildable via override)
  assert.equal(count.drawdown || 0, 0, "drawdown is excluded from the daily rotation");
  assert.equal(count.risk || 0, 0, "risk is excluded from the daily rotation");
  assert.equal(count.riskdial || 0, 0, "riskdial is removed entirely");
});
