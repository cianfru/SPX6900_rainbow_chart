// Choose the media for a post: an animated mp4 for rainbow cards (when video is
// on), else the static PNG. Falls back to PNG if the video render fails. Kept
// separate from charts.mjs so the Vercel OG function never pulls in ffmpeg.
import { renderPostCard } from "./charts.mjs";
import { renderRainbowVideo, renderLineVideo } from "./video.mjs";

// Card types we can animate today: the rainbow hero + any line/area card.
// bar/donut/stack/model stay static PNG (no animator yet).
export async function buildMedia(post, stats, { video = false, out = "bot-preview.mp4" } = {}) {
  const type = post.card?.type;
  if (video && (type === "rainbow" || type === "line")) {
    try {
      const path = type === "rainbow"
        ? await renderRainbowVideo({ price: stats.price, out })
        : await renderLineVideo({ spec: { ...post.card.spec, date: stats.date }, out });
      return { path, mediaType: "video/mp4", kind: "video" };
    } catch (e) {
      console.error("video render failed → PNG fallback:", e.message);
    }
  }
  return { data: renderPostCard(post, stats), mediaType: "image/png", kind: "image" };
}

// Upload media + tweet. If a video upload fails, fall back to the PNG card so a
// post still goes out. Returns the tweet id.
export async function postWithMedia(client, post, stats, media) {
  try {
    const id = await client.v2.uploadMedia(media.path ?? media.data, { media_type: media.mediaType });
    const res = await client.v2.tweet({ text: post.text, media: { media_ids: [id] } });
    return res?.data?.id;
  } catch (e) {
    if (media.kind !== "video") throw e;
    console.error("video upload failed → posting PNG instead:", e.message);
    const png = renderPostCard(post, stats);
    const id = await client.v2.uploadMedia(png, { media_type: "image/png" });
    const res = await client.v2.tweet({ text: post.text, media: { media_ids: [id] } });
    return res?.data?.id;
  }
}
