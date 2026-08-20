// Smoke tests for the daily X bot's post builders (scripts/bot/posts.mjs). These
// catch a post that throws, renders empty text, or emits a card the renderer
// can't draw — without needing network or X credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds, LONGFORM } from "../scripts/bot/posts.mjs";
import { CARD_TYPES } from "../scripts/bot/charts.mjs";

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
    // CARD_TYPES comes from charts.mjs, so adding a card cannot leave this list stale.
    assert.ok(p.card && CARD_TYPES.has(p.card.type), `valid card type for ${id} (got "${p.card?.type}")`);
  }
});

test("every post stays within a sane long-form ceiling (verified account)", () => {
  // The account is VERIFIED (X Premium long-form) — the moat is honest, data-rich
  // content, so we do NOT cap posts at the ~290 "See more" barrier anymore (owner
  // call: "remove the limit"). This is now just a SANITY ceiling that catches a
  // runaway bug (an unterminated template, a value blowing up) rather than a style
  // rule. Copy length is VALUE-DEPENDENT (band labels, big % strings), so we still
  // check at extreme prices spanning the deepest and hottest bands.
  const CEILING = 2000;   // generous; real cards land ~250–700, X's hard limit is 25k
  for (const st of [statsCoins, computeStats(0.05, last.date), computeStats(12, last.date)]) {
    for (const id of allIds(st)) {
      const len = xLen(buildPost(st, new Date(), id).text);
      // LONGFORM only RAISES the ceiling (a card explicitly allowed to run longer); it never lowers
      // it, so a LONGFORM card is never held to a TIGHTER cap than an ordinary one. Today every
      // LONGFORM value is under CEILING, so this is the flat 2000 sanity ceiling for all cards.
      const cap = Math.max(LONGFORM[id] ?? 0, CEILING);
      assert.ok(len <= cap, `post "${id}" is ${len} chars at $${st.price} (${st.band.l}) — over the ${cap} sanity ceiling`);
    }
  }
});

test("every post has at most one cashtag (X rejects posts with 2+)", () => {
  // X's API 403s on "more than one cashtag ($SYMBOL)". The branded footer already
  // spends the one allowed cashtag ($SPX), so a card's body must not add another —
  // use plain "BITCOIN"/"SPX", not "$BITCOIN"/"$SPX". Cashtags are $ + letters
  // ($0.37 price amounts don't count).
  for (const id of allIds(statsCoins)) {
    const text = buildPost(statsCoins, new Date(), id).text;
    const cashtags = text.match(/\$[A-Za-z]\w*/g) || [];
    assert.ok(cashtags.length <= 1, `post "${id}" has ${cashtags.length} cashtags (${cashtags.join(", ")}) — X allows one`);
  }
});

test("no post attaches a possessive to an @handle (X breaks the link)", () => {
  // X fails to parse "@handle's" — the apostrophe swallows the mention and the link dies. validateDraft
  // already guards LLM drafts (llm-copy.mjs); this is the equivalent guard for STATIC human-authored
  // templates that carry handles (rsidots → @100trillionUSD, dcaladder → @benjamincowen, spxbitcoin).
  // Check across extreme prices too, since band-dependent copy can reshuffle a handle's neighbours.
  const bad = /@\w+['’]/;
  for (const st of [statsCoins, computeStats(0.05, last.date), computeStats(12, last.date)]) {
    for (const id of allIds(st)) {
      const text = buildPost(st, new Date(), id).text;
      assert.ok(!bad.test(text), `post "${id}" has a possessive on an @handle at $${st.price} — breaks the mention link`);
    }
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

test("CARD_TYPES stays in step with the dispatch it guards", () => {
  // The set is hand-written but the dispatch is the truth, so read the source and
  // check them against each other. A card wired into charts.mjs but left out of the
  // set would throw at render time in production; this catches it in CI instead.
  const src = readFileSync("scripts/bot/charts.mjs", "utf8");
  const dispatched = [...src.matchAll(/if \(type === "([a-z0-9]+)"\)/g)].map(m => m[1]);
  assert.ok(dispatched.length > 40, "the dispatch regex still matches");
  const missing = dispatched.filter(t => !CARD_TYPES.has(t));
  assert.deepEqual(missing, [], `dispatched but missing from CARD_TYPES: ${missing.join(", ")}`);
  // "line" is the fallthrough default and so is never dispatched by name.
  const orphan = [...CARD_TYPES].filter(t => t !== "line" && !dispatched.includes(t));
  assert.deepEqual(orphan, [], `in CARD_TYPES but nothing renders them: ${orphan.join(", ")}`);
});
