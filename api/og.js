// Dynamic social share image: a 1200x630 PNG of the SPX6900 chart. Defaults to
// the rainbow card; with ?tab=<id> it renders that tab's card using the SAME
// pipeline as the X bot (stats → post spec → resvg), so a shared deep link gets
// a matching preview. Always falls back to the rainbow card on any error.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../src/data.js";
import { rainbowSvg } from "../src/rainbow-svg.js";
import { fetchLivePrice, fetchMajors, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost } from "../scripts/bot/posts.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";

// Nav tab id -> the rotating post whose card best represents that tab.
const TAB_POST = {
  rainbow: "valuation", risk: "risk", drawdown: "drawdown", rally: "rally",
  spxbtc: "btc", btccycle: "cycle", relative: "majors",
  supply: "distribution", holders: "marketcap", model: "model",
};
// Posts that need the major-coin series fetched before computeStats.
const NEEDS_COINS = new Set(["btc", "majors"]);

const rainbowPng = price =>
  new Resvg(rainbowSvg(price), { fitTo: { mode: "width", value: 1200 } }).render().asPng();

export default async function handler(req, res) {
  const tab = new URL(req.url, "http://x").searchParams.get("tab");
  const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;

  let png;
  try {
    const postId = TAB_POST[tab];
    if (!postId || postId === "valuation") {
      png = rainbowPng(price); // rainbow / default / unknown tab
    } else {
      const opts = {};
      if (NEEDS_COINS.has(postId)) { try { opts.coins = await fetchMajors(); } catch { /* skip */ } }
      const stats = computeStats(price, undefined, opts);
      const post = buildPost(stats, new Date(), postId);
      // buildPost falls back to rotation if the requested post lacks data; if so,
      // fall back to the rainbow card rather than show an unrelated chart.
      png = post.id === postId ? renderPostCard(post, stats) : rainbowPng(price);
    }
  } catch {
    png = rainbowPng(price);
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).end(png);
}
