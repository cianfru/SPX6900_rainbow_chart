// The band-watcher's event post: builds for each marquee band and renders a card.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/models.js";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildBandChangePost, MARQUEE_BANDS } from "../scripts/bot/posts.mjs";
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
