// Guards the per-tab social-image pipeline (api/og.js reuses this): the bot's
// post specs must render to valid PNGs via renderPostCard. Covers the
// model-only tabs that the OG endpoint can produce without network/snapshot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RAW } from "../src/data.js";
import { computeStats } from "../scripts/bot/stats.mjs";
import { buildPost } from "../scripts/bot/posts.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";

const stats = computeStats(DEFAULT_RAW.at(-1).price, undefined, {});
// Same tab→post map the OG endpoint uses, minus the network-dependent ones.
const OFFLINE_TABS = { rainbow: "valuation", risk: "risk", drawdown: "drawdown", rally: "rally", btccycle: "cycle" };

for (const [tab, postId] of Object.entries(OFFLINE_TABS)) {
  test(`og card for tab "${tab}" renders a valid PNG`, () => {
    const post = buildPost(stats, new Date(), postId);
    assert.equal(post.id, postId, `post "${postId}" is available offline`);
    const png = renderPostCard(post, stats);
    assert.ok(png.length > 1000, `non-trivial PNG (${png.length} bytes)`);
    assert.ok(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, "PNG magic header");
  });
}
