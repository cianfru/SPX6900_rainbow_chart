// JSON feed for the hidden control page: the list of cards available today and
// the deterministic auto-rotation pick for the next N days (so the gallery can
// label "next up" and show the upcoming schedule). Read-only; no secrets.
import { DEFAULT_RAW } from "../src/data.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost, allIds, OG_ONLY, editableCopy } from "../scripts/bot/posts.mjs";
import { isPortraitCard, isVideoCard } from "../scripts/bot/card-format.mjs";

const DAY = 86400000;

export default async function handler(req, res) {
  const days = Math.min(30, Math.max(1, parseInt(new URL(req.url, "http://x").searchParams.get("days") || "10", 10)));
  let ids; const upcoming = [], texts = {}, media = {}, orient = {};
  try {
    const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
    const opts = {};
    try { opts.history = await fetchHistory(); } catch { /* bundled */ }
    try { opts.coins = await fetchMajors(); } catch { /* skip gated coin posts */ }
    const stats = computeStats(price, undefined, opts);
    ids = allIds(stats).filter(id => !OG_ONLY.has(id)); // hide og-only cards (drawdown) from the console
    // The exact tweet copy each card posts with (same builder the bot uses), plus
    // whether it posts as a video or a static image, and at 4:5 portrait or
    // landscape — read from the shared card-format source of truth.
    for (const id of ids) {
      const p = buildPost(stats, new Date(), id);
      const type = p.card?.type;
      texts[id] = p.text;
      media[id] = (isVideoCard(type) || p.card?.animate) ? "video" : "image";
      orient[id] = isPortraitCard(type) ? "portrait" : "landscape";
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
  // Cards whose copy is owner-editable: their default template + the live token
  // values, so the control panel can edit + preview. Populated by buildPost above.
  const editable = (() => { try { return editableCopy(); } catch { return {}; } })();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ ids, upcoming, texts, media, orient, editable, generatedAt: new Date().toISOString() });
}
