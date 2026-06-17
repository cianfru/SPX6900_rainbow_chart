// Guard: a tweet over 280 weighted chars fails to post on a non-Premium account.
// Keep every rotation post's copy under the limit so a copy edit can't silently
// break posting. (X counts most emoji / CJK as 2; approximate that here.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds } from "../scripts/bot/posts.mjs";

const weighted = s => [...s].reduce((n, ch) => {
  const cp = ch.codePointAt(0);
  const wide = cp > 0x1100 && (cp > 0xffff || /\p{Extended_Pictographic}/u.test(ch));
  return n + (wide ? 2 : 1);
}, 0);

test("every rotation post fits in a 280-char tweet", () => {
  const stats = computeStats(DEFAULT_RAW.at(-1).price, undefined, {});
  for (const id of allIds(stats)) {
    const len = weighted(buildPost(stats, new Date(), id).text);
    assert.ok(len <= 280, `post "${id}" is ${len} chars (> 280)`);
  }
});
