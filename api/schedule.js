// JSON feed for the hidden control page: the list of cards available today and
// the deterministic auto-rotation pick for the next N days (so the gallery can
// label "next up" and show the upcoming schedule). Read-only; no secrets.
import { DEFAULT_RAW } from "../src/data.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds } from "../scripts/bot/posts.mjs";

const DAY = 86400000;

export default async function handler(req, res) {
  const days = Math.min(30, Math.max(1, parseInt(new URL(req.url, "http://x").searchParams.get("days") || "10", 10)));
  let ids = [], upcoming = [], texts = {}, media = {};
  try {
    const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
    const opts = {};
    try { opts.history = await fetchHistory(); } catch { /* bundled */ }
    try { opts.coins = await fetchMajors(); } catch { /* skip gated coin posts */ }
    const stats = computeStats(price, undefined, opts);
    ids = allIds(stats);
    // The exact tweet copy each card posts with (same builder the bot uses), plus
    // whether it posts as a video (rainbow + line cards) or a static image — same
    // rule as scripts/bot/media.mjs.
    const VIDEO = new Set(["rainbow", "line"]);
    for (const id of ids) {
      const p = buildPost(stats, new Date(), id);
      texts[id] = p.text;
      media[id] = VIDEO.has(p.card?.type) ? "video" : "image";
    }
    const base = new Date(); base.setUTCHours(13, 0, 0, 0); // the daily cron slot
    for (let i = 0; i < days; i++) {
      const d = new Date(base.getTime() + i * DAY);
      upcoming.push({ date: d.toISOString().slice(0, 10), id: buildPost(stats, d, null).id });
    }
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ ids, upcoming, texts, media, generatedAt: new Date().toISOString() });
}
