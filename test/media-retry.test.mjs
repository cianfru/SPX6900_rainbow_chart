// Video uploads to X occasionally hit transient 5xx (we saw a 503 downgrade a
// targets post to a static PNG). postWithMedia should retry the video upload and
// only fall back to PNG if it keeps failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransient, uploadWithRetry, postWithMedia } from "../scripts/bot/media.mjs";

const err = code => Object.assign(new Error("Request failed with code " + code), { code });

test("isTransient flags 429/5xx, not 4xx", () => {
  assert.ok(isTransient(err(503)));
  assert.ok(isTransient(err(500)));
  assert.ok(isTransient(err(429)));
  assert.ok(!isTransient(err(403)));
  assert.ok(!isTransient(err(400)));
});

test("uploadWithRetry recovers after transient failures", async () => {
  let calls = 0;
  const client = { v2: { uploadMedia: async () => { calls++; if (calls < 3) throw err(503); return "media123"; } } };
  const id = await uploadWithRetry(client, Buffer.from("x"), "video/mp4", { tries: 4, baseMs: 1 });
  assert.equal(id, "media123");
  assert.equal(calls, 3);
});

test("uploadWithRetry gives up on a non-transient error immediately", async () => {
  let calls = 0;
  const client = { v2: { uploadMedia: async () => { calls++; throw err(403); } } };
  await assert.rejects(() => uploadWithRetry(client, Buffer.from("x"), "video/mp4", { tries: 4, baseMs: 1 }));
  assert.equal(calls, 1);
});

test("postWithMedia posts the video once a retry succeeds (no PNG downgrade)", async () => {
  let uploads = 0, pngUploads = 0, tweetMediaType = null;
  const client = { v2: {
    uploadMedia: async (data, { media_type }) => {
      uploads++;
      if (media_type === "image/png") { pngUploads++; return "png"; }
      if (uploads < 2) throw err(503); // first video attempt fails, second succeeds
      tweetMediaType = media_type;
      return "vid";
    },
    tweet: async () => ({ data: { id: "tweet1" } }),
  } };
  const media = { data: Buffer.from("vid"), mediaType: "video/mp4", kind: "video" };
  const post = { text: "hi", card: { type: "line", spec: {} } };
  const id = await postWithMedia(client, post, {}, media, { baseMs: 1 });
  assert.equal(id, "tweet1");
  assert.equal(tweetMediaType, "video/mp4", "tweeted the video, not the PNG");
  assert.equal(pngUploads, 0, "did not fall back to PNG");
});
