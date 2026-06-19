// Guard: keep every rotation post's copy to a sane length. The account is X
// Premium, so the old hard 280-char API limit no longer applies — this is now a
// soft readability ceiling (a feed post shouldn't be an essay), and a tripwire
// against a copy bug stuffing the whole stats object into a tweet. Bump LIMIT if
// a longer format is ever intended. (X counts most emoji / CJK as 2; approximate.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds } from "../scripts/bot/posts.mjs";

const LIMIT = 1000; // weighted chars; Premium allows far more, this is a readability guard

const weighted = s => [...s].reduce((n, ch) => {
  const cp = ch.codePointAt(0);
  const wide = cp > 0x1100 && (cp > 0xffff || /\p{Extended_Pictographic}/u.test(ch));
  return n + (wide ? 2 : 1);
}, 0);

test("every rotation post stays within the readability limit", () => {
  const stats = computeStats(DEFAULT_RAW.at(-1).price, undefined, {});
  for (const id of allIds(stats)) {
    const len = weighted(buildPost(stats, new Date(), id).text);
    assert.ok(len <= LIMIT, `post "${id}" is ${len} chars (> ${LIMIT})`);
  }
});
