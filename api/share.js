// Per-chart share page. The app is a single-page app, so crawlers (X, Discord,
// Telegram, Slack) can't read per-chart Open Graph tags from the static index.html
// — every deep link would unfurl as the default rainbow. This tiny route serves the
// RIGHT OG meta for ?chart=<id> (image → the chart's matching card via /api/og) and
// then bounces humans to the app at /?chart=<id>. The share button links here.
//
// Catalog-driven: title/description/image are resolved from CHART_META, so every
// chart in the gallery (SPX, City, Project Aeon) gets a correct preview automatically
// — no hand-maintained list to fall out of date. Unknown/missing id → rainbow default.
import { CHART_META } from "../src/charts-catalog.js";

const SITE = "https://spx6900rainbow.xyz";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const REL = new Set(["BTC", "ETH", "SOL", "BASKET"]);

const DEFAULT = {
  t: "SPX6900 Rainbow Chart",
  d: "Logarithmic regression valuation bands for SPX6900 — plus on-chain, risk and relative-value charts.",
  img: `${SITE}/api/og`,
  app: `${SITE}/`,
};

function resolve(id, rel) {
  const meta = id && CHART_META[id];
  if (!meta) return DEFAULT;
  const isAeon = meta.group === "Project Aeon";
  // The card is the server-renderable proxy for the (React) chart. Aeon charts render
  // via ?aeon=<id>; SPX/City charts via their linked ?post=<card>; cardless charts fall
  // back to the rainbow. /api/og gracefully degrades to the rainbow on any miss.
  const img = isAeon
    ? `${SITE}/api/og?aeon=${encodeURIComponent(id)}`
    : meta.post ? `${SITE}/api/og?post=${encodeURIComponent(meta.post)}` : `${SITE}/api/og`;
  const q = `?chart=${encodeURIComponent(id)}${id === "relative" && rel && REL.has(rel) ? `&rel=${rel}` : ""}`;
  return {
    t: `${isAeon ? "Project AEON" : "SPX6900"} — ${meta.title}`,
    d: meta.desc || DEFAULT.d,
    img,
    app: `${SITE}/${q}`,
  };
}

export default function handler(req, res) {
  const params = new URL(req.url, SITE).searchParams;
  const id = params.get("chart") || params.get("tab");   // accept ?chart= (current) and legacy ?tab=
  const m = resolve(id, params.get("rel"));

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.t)}</title>
<meta name="description" content="${esc(m.d)}">
<meta property="og:title" content="${esc(m.t)}">
<meta property="og:description" content="${esc(m.d)}">
<meta property="og:image" content="${esc(m.img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(m.app)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.t)}">
<meta name="twitter:description" content="${esc(m.d)}">
<meta name="twitter:image" content="${esc(m.img)}">
<link rel="canonical" href="${esc(m.app)}">
</head><body style="background:#05050e;color:#cbd5e1;font-family:system-ui,sans-serif">
<!-- Humans are bounced to the app via JS. NO <meta http-equiv="refresh"> on purpose: some link
     unfurlers FOLLOW a 0-second meta-refresh to the app URL (/?chart=…) and read ITS Open Graph
     (the static index.html = default rainbow) instead of the per-chart OG above. Crawlers don't run
     JS, so they stay on this page and read the right card; JS-less humans get the noscript link. -->
<script>location.replace(${JSON.stringify(m.app)})</script>
<noscript><a href="${esc(m.app)}" style="color:#a78bfa">View the SPX6900 chart →</a></noscript>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).end(html);
}
