/* global process */
// Dynamic social share image: a 1200x630 PNG of the SPX6900 chart. Defaults to
// the rainbow card; with ?tab=<id> it renders that tab's card using the SAME
// pipeline as the X bot (stats → post spec → resvg), so a shared deep link gets
// a matching preview. Always falls back to the rainbow card on any error.
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../src/data.js";
import { rainbowSvg } from "../src/rainbow-svg.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost } from "../scripts/bot/posts.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";
import { staticImageFor } from "../scripts/bot/card-format.mjs";
import { FONT, FONT_DIAG } from "../scripts/bot/font.mjs";

// Nav tab id -> the rotating post whose card best represents that tab.
const TAB_POST = {
  rainbow: "valuation", channel: "channel", risk: "risk", drawdown: "drawdown", rally: "rally",
  spxbtc: "btc", btccycle: "cycle", relative: "majors",
  supply: "distribution", holders: "marketcap", model: "model",
};
// Posts that need the major-coin series fetched before computeStats.
const NEEDS_COINS = new Set(["btc", "majors", "majorcaps", "ytd"]);

const rainbowPng = price =>
  new Resvg(rainbowSvg(price), { fitTo: { mode: "width", value: 1200 }, font: FONT }).render().asPng();

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;

  // Font diagnostics: hit /api/og?debug=font to see what the live function has.
  // Renders a tiny "ABC123" three ways and counts lit pixels so we can tell
  // whether text draws at all on Vercel and via which font path.
  if (params.get("debug") === "font") {
    const testSvg = `<svg width="160" height="48" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="48" fill="#000"/><text x="6" y="34" font-size="30" font-family="sans-serif" fill="#fff">ABC123</text></svg>`;
    const litOf = fontOpt => {
      try {
        const px = new Resvg(testSvg, { font: fontOpt }).render().pixels;
        let lit = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i] > 40 || px[i + 1] > 40 || px[i + 2] > 40) lit++;
        return lit;
      } catch (e) { return `ERR ${e.message}`; }
    };
    const out = {
      ...FONT_DIAG, cwd: process.cwd(), node: process.version,
      test_activeFONT_litPixels: litOf(FONT),                       // the config the cards use (>0 = text draws)
      test_systemFonts_litPixels: litOf({ loadSystemFonts: true }), // any system font present? (0 on Vercel)
    };
    res.setHeader("Content-Type", "application/json");
    res.status(200).end(JSON.stringify(out, null, 2));
    return;
  }

  const tab = params.get("tab");
  // ?post=<id> renders that rotation card directly (used by the control gallery);
  // ?tab=<id> maps a site tab to its representative card (used by share links).
  const directPost = params.get("post");
  // ?portrait=1 renders the card in its true posted shape (4:5) — used by the
  // control gallery. Link-unfurl previews (?tab=) omit it and stay landscape.
  const portrait = params.get("portrait") === "1";
  const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;

  let png;
  try {
    const postId = directPost || TAB_POST[tab];
    if (!postId) {
      png = rainbowPng(price); // default share image (landscape)
    } else {
      const opts = {};
      try { opts.history = await fetchHistory(); } catch { /* fall back to bundled */ }
      if (NEEDS_COINS.has(postId)) { try { opts.coins = await fetchMajors(); } catch { /* skip */ } }
      const stats = computeStats(price, undefined, opts);
      const post = buildPost(stats, new Date(), postId);
      // Static-image cards (e.g. the Kraken promo) ARE a finished graphic — serve
      // the file directly at its native AR rather than rasterizing it here (which
      // would also risk a serverless fs miss). 302 → the public asset.
      const asset = post.id === postId && staticImageFor(post.card?.type);
      if (asset) {
        res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
        res.writeHead(302, { Location: asset });
        res.end();
        return;
      }
      // The control gallery (?post=) previews cards at their true posted size (3:2
      // landscape / 4:5 portrait). Share-link unfurls (?tab=) instead render 1.91:1
      // so X's link card doesn't crop the chart's axes off.
      const cardOpts = directPost ? { portrait } : { landscape: { W: 1200, H: 630 } };
      // buildPost falls back to rotation if the requested post lacks data; if so,
      // fall back to the rainbow card rather than show an unrelated chart.
      png = post.id === postId ? renderPostCard(post, stats, cardOpts) : rainbowPng(price);
    }
  } catch {
    png = rainbowPng(price);
  }

  res.setHeader("Content-Type", "image/png");
  // Console previews (?post=) stay fresh for card dev; share images (default /
  // ?tab=) cache hard so crawler/unfurl re-fetches are served from the CDN
  // instead of re-rendering the PNG — a social preview being an hour stale is fine.
  res.setHeader("Cache-Control", directPost
    ? "s-maxage=60, stale-while-revalidate=300"
    : "s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).end(png);
}
