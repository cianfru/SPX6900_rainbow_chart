// Choose the media for a post: an animated mp4 for rainbow cards (when video is
// on), else the static PNG. Falls back to PNG if the video render fails. Kept
// separate from charts.mjs so the Vercel OG function never pulls in ffmpeg.
import { renderPostCard, PORTRAIT } from "./charts.mjs";
import { renderRainbowVideo, renderLineVideo, renderCubeVideo, renderScaleVideo } from "./video.mjs";

// Card types we can animate today: the rainbow hero, any line/area card, the
// money-cube card, and the S&P scale card. bar/donut/stack/model stay static PNG.
// opts.portrait renders the supported cards at 4:5 for mobile feeds (cube/bar/etc
// aren't portrait-ready yet, so they stay landscape).
export async function buildMedia(post, stats, { video = false, out = "bot-preview.mp4", portrait = false } = {}) {
  const type = post.card?.type;
  if (video && (type === "rainbow" || type === "line" || type === "cube" || type === "scale")) {
    try {
      const spec = { ...post.card.spec, date: stats.date };
      const dims = portrait && type !== "cube" ? PORTRAIT : {}; // cube layout isn't portrait-ready yet
      const path = type === "rainbow" ? await renderRainbowVideo({ price: stats.price, out, dims })
        : type === "cube" ? await renderCubeVideo({ spec, out })
        : type === "scale" ? await renderScaleVideo({ spec, out, dims })
        : await renderLineVideo({ spec, out, dims });
      return { path, mediaType: "video/mp4", kind: "video", portrait };
    } catch (e) {
      console.error("video render failed → PNG fallback:", e.message);
    }
  }
  return { data: renderPostCard(post, stats, { portrait }), mediaType: "image/png", kind: "image", portrait };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// X's media endpoint throws transient 5xx/429s (we've seen 503s on video upload);
// those are worth retrying rather than letting them downgrade the post to a PNG.
export const isTransient = e => {
  const c = Number(e?.code ?? e?.status);
  return c === 429 || (c >= 500 && c < 600);
};

// Upload media, retrying on transient errors with exponential backoff.
export async function uploadWithRetry(client, data, mediaType, { tries = 4, baseMs = 2000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await client.v2.uploadMedia(data, { media_type: mediaType });
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === tries - 1) throw e;
      const wait = baseMs * 2 ** i;
      console.error(`media upload attempt ${i + 1}/${tries} failed (code ${e.code ?? e.status ?? "?"}) — retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

// Upload media + tweet. Retries the (video) upload on transient X errors; only if
// it still fails does it fall back to the PNG card so a post always goes out.
export async function postWithMedia(client, post, stats, media, opts = {}) {
  try {
    const id = await uploadWithRetry(client, media.path ?? media.data, media.mediaType,
      { tries: media.kind === "video" ? 4 : 2, ...opts });
    const res = await client.v2.tweet({ text: post.text, media: { media_ids: [id] } });
    return res?.data?.id;
  } catch (e) {
    if (media.kind !== "video") throw e;
    console.error("video upload failed after retries → posting PNG instead:", e.message);
    const png = renderPostCard(post, stats, { portrait: media.portrait });
    const id = await uploadWithRetry(client, png, "image/png", { tries: 3, ...opts });
    const res = await client.v2.tweet({ text: post.text, media: { media_ids: [id] } });
    return res?.data?.id;
  }
}
