// Choose the media for a post: an animated mp4 for rainbow cards (when video is
// on), else the static PNG. Falls back to PNG if the video render fails. Kept
// separate from charts.mjs so the Vercel OG function never pulls in ffmpeg.
import { renderPostCard, PORTRAIT, isPortraitCard, isVideoCard } from "./charts.mjs";
import { dimsForAR } from "./card-format.mjs";
import { renderRainbowVideo, renderLineVideo, renderCubeVideo, renderScaleVideo, renderCostBasisVideo } from "./video.mjs";

// We animate only where motion is the message — the S&P scale zoom-out and the
// cube stack (isVideoCard). Charts post as static images. opts.portrait renders
// the supported cards at 4:5 for mobile feeds (cube isn't portrait-ready yet).
// opts.ar = an owner-picked aspect-ratio preset key (control panel) for STATIC
// image cards; it wins over portrait and renders the card at that ratio.
export async function buildMedia(post, stats, { video = false, out = "bot-preview.mp4", portrait = false, ar = null } = {}) {
  const type = post.card?.type;
  const anim = post.card?.animate; // per-post opt-in for non-video-type cards (e.g. the cycle line card)
  if (video && (isVideoCard(type) || anim)) {
    try {
      const spec = { ...post.card.spec, date: stats.date };
      const dims = portrait && isPortraitCard(type) ? PORTRAIT : {}; // cube/etc aren't portrait-ready yet
      const path = type === "rainbow" ? await renderRainbowVideo({ price: stats.price, out, dims })
        : type === "cube" ? await renderCubeVideo({ spec, out })
        : type === "scale" ? await renderScaleVideo({ spec, out, dims })
        : type === "costbasis" ? await renderCostBasisVideo({ out, dims })
        : await renderLineVideo({ spec, out, dims, revealFromX: anim?.revealFromX });
      return { path, mediaType: "video/mp4", kind: "video", portrait };
    } catch (e) {
      console.error("video render failed → PNG fallback:", e.message);
    }
  }
  const arDims = ar ? dimsForAR(ar) : null;
  const imgOpts = arDims ? { dims: arDims } : { portrait };
  return { data: renderPostCard(post, stats, imgOpts), mediaType: "image/png", kind: "image", portrait };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// X's media endpoint throws transient 5xx/429s (we've seen 503s on video upload);
// those are worth retrying rather than letting them downgrade the post to a PNG.
export const isTransient = e => {
  const c = Number(e?.code ?? e?.status);
  return c === 429 || (c >= 500 && c < 600);
};

// Upload media, retrying on transient errors with exponential backoff.
// Video goes through the v1.1 chunked upload endpoint: X's v2 media endpoint
// reliably 503s on video for our app tier (images upload fine on v2), and the
// v1.1 chunked path is the battle-tested one. The resulting media_id attaches to
// a v2 tweet either way. Images stay on v2 since that already works.
export async function uploadWithRetry(client, data, mediaType, { tries = 4, baseMs = 2000 } = {}) {
  const upload = () => mediaType === "video/mp4"
    ? client.v1.uploadMedia(data, { mimeType: mediaType })
    : client.v2.uploadMedia(data, { media_type: mediaType });
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await upload();
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
