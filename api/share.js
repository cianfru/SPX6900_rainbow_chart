// Per-tab share page. The app is a single-page app, so crawlers (X, Discord,
// Telegram) can't see per-tab Open Graph tags from index.html. This tiny route
// serves the right OG meta for ?tab=<id> (image -> /api/og?tab=<id>) and then
// bounces humans to the app at /?tab=<id>. Share these /share?tab=<id> links.
const SITE = "https://spx6900rainbow.xyz";

// title + description per tab. Anything not listed falls back to "rainbow".
const TABS = {
  rainbow: { t: "SPX6900 Rainbow Chart", d: "Logarithmic regression valuation bands for SPX6900." },
  risk: { t: "SPX6900 Valuation Risk", d: "How stretched SPX6900 is vs its long-run trend, on a 0–1 scale." },
  drawdown: { t: "SPX6900 Drawdown", d: "How far SPX6900 sits below its all-time high, across every cycle." },
  rally: { t: "SPX6900 Rally", d: "SPX6900's climb from each capitulation low." },
  spxbtc: { t: "SPX6900 priced in Bitcoin", d: "SPX6900 valued in sats and its relative strength vs BTC." },
  btccycle: { t: "SPX6900 — What if it ran Bitcoin's cycle?", d: "An idealized 4-year halving cycle mapped onto SPX6900's own rainbow bands." },
  relative: { t: "SPX6900 vs the majors", d: "SPX6900's relative strength against BTC, ETH and SOL." },
  supply: { t: "SPX6900 Holder Supply", d: "SPX6900 supply by holder conviction tier — diamond to wood." },
  holders: { t: "SPX6900 Holders", d: "On-chain holder flow, cost basis and concentration for SPX6900." },
  model: { t: "SPX6900 Model Fit", d: "How well the log-regression fits SPX6900: residuals, R² and the percentile bands behind the rainbow." },
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const REL = new Set(["BTC", "ETH", "SOL", "BASKET"]);

export default function handler(req, res) {
  const params = new URL(req.url, SITE).searchParams;
  const tab = params.get("tab"), rel = params.get("rel");
  const known = tab && TABS[tab] && tab !== "rainbow" ? tab : null;
  const meta = TABS[known] || TABS.rainbow;
  const img = `${SITE}/api/og${known ? `?tab=${encodeURIComponent(known)}` : ""}`;
  // The Relative tab's sub-view (rel) doesn't change the card, but carry it
  // through to the app so the deep link lands on the right comparison.
  const appQs = known
    ? `?tab=${encodeURIComponent(known)}${known === "relative" && rel && REL.has(rel) ? `&rel=${rel}` : ""}`
    : "";
  const app = `${SITE}/${appQs}`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.t)}</title>
<meta name="description" content="${esc(meta.d)}">
<meta property="og:title" content="${esc(meta.t)}">
<meta property="og:description" content="${esc(meta.d)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(app)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.t)}">
<meta name="twitter:description" content="${esc(meta.d)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${esc(app)}">
<meta http-equiv="refresh" content="0; url=${esc(app)}">
</head><body style="background:#05050e;color:#cbd5e1;font-family:system-ui,sans-serif">
<script>location.replace(${JSON.stringify(app)})</script>
<noscript><a href="${esc(app)}" style="color:#a78bfa">View the SPX6900 chart →</a></noscript>
</body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).end(html);
}
