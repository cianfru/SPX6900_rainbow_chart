// Dynamic social share image: a 1200x630 PNG of the SPX6900 chart. Defaults to
// the rainbow card; with ?tab=<id> it renders that tab's card using the SAME
// pipeline as the X bot (stats → post spec → resvg), so a shared deep link gets
// a matching preview. Always falls back to the rainbow card on any error.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_RAW } from "../src/data.js";
import { rainbowSvg } from "../src/rainbow-svg.js";
import { fetchLivePrice, fetchMajors, fetchHistory, computeStats } from "../scripts/bot/stats.mjs";
import { buildPost } from "../scripts/bot/posts.mjs";
import { renderPostCard } from "../scripts/bot/charts.mjs";
import { staticImageFor, dimsForAR } from "../scripts/bot/card-format.mjs";
import { renderStudioCard } from "../scripts/bot/studio-card.mjs";
import { FONT, FONT_DIAG } from "../scripts/bot/font.mjs";
import { renderAeonFloorCard } from "../scripts/bot/aeon-floor-card.mjs";
import { renderAeonHodlCard } from "../scripts/bot/aeon-hodl-card.mjs";
import { renderAeonOwnersCard, renderAeonConcentrationCard, renderAeonBehaviourCard } from "../scripts/bot/aeon-cards.mjs";
import { renderAeonSkylineCard } from "../scripts/bot/aeon-skyline-card.mjs";
import { renderAeonSpxOscCard } from "../scripts/bot/aeon-spx-osc-card.mjs";
import { renderAeonRarityPriceCard } from "../scripts/bot/aeon-rarity-price-card.mjs";
import { renderAeonWhalesCard } from "../scripts/bot/aeon-whales-card.mjs";
import { renderAeonTradersCard, renderAeonValuationCard, renderAeonTraitsCard } from "../scripts/bot/aeon-market-cards.mjs";

// Project Aeon cards render from the committed aeon-*.json (not stats), all at 1:1. ?aeon=<id>.
const readAeon = p => { try { return JSON.parse(readFileSync(join(process.cwd(), p), "utf8")); } catch { return null; } };

// Card Studio sources — each pulls a time-series from onchain.json (the same data the charts plot).
// The studio (control panel) crops to a window + adds a custom title/subtitle. Add a source = one row.
const D = r => Date.parse(r.d);
export const STUDIO = {
  price:      { label: "SPX price",            unit: "$", color: "#a78bfa", log: true, get: oc => oc.filter(r => r.spot > 0).map(r => ({ ts: D(r), v: r.spot })) },
  mvrv:       { label: "MVRV",                 unit: "×", color: "#38bdf8", get: oc => oc.filter(r => r.mvrv > 0).map(r => ({ ts: D(r), v: r.mvrv })) },
  rprice:     { label: "Realized price",       unit: "$", color: "#f59e0b", log: true, get: oc => oc.filter(r => r.rp > 0).map(r => ({ ts: D(r), v: r.rp })) },
  sip:        { label: "Supply in profit",     unit: "%", color: "#4ade80", get: oc => oc.filter(r => Number.isFinite(r.sip)).map(r => ({ ts: D(r), v: r.sip })) },
  holders:    { label: "Holders",              unit: "",  color: "#22d3ee", get: oc => oc.filter(r => r.holders > 0).map(r => ({ ts: D(r), v: r.holders })) },
  conc:       { label: "Top-100 share",        unit: "%", color: "#fb7185", get: oc => oc.filter(r => r.top100 > 0).map(r => ({ ts: D(r), v: r.top100 })) },
  nupl:       { label: "NUPL",                 unit: "",  color: "#818cf8", get: oc => oc.filter(r => r.mvrv > 0).map(r => ({ ts: D(r), v: 1 - 1 / r.mvrv })) },
  sopr:       { label: "SOPR",                 unit: "",  color: "#34d399", get: oc => oc.filter(r => Number.isFinite(r.sopr) && r.sopr > 0).map(r => ({ ts: D(r), v: r.sopr })) },
  nrpl:       { label: "Net realized P/L",     unit: "$", color: "#f472b6", get: oc => oc.filter(r => Number.isFinite(r.nrpl)).map(r => ({ ts: D(r), v: r.nrpl })) },
  liveliness: { label: "Liveliness",           unit: "",  color: "#a3e635", get: oc => oc.filter(r => Number.isFinite(r.liveliness)).map(r => ({ ts: D(r), v: r.liveliness })) },
  age1y:      { label: "Held 1 year+",         unit: "%", color: "#818cf8", get: oc => oc.filter(r => Array.isArray(r.age)).map(r => ({ ts: D(r), v: r.age[4] })) },
  gini:       { label: "Gini (concentration)", unit: "",  color: "#94a3b8", get: oc => oc.filter(r => r.gini > 0).map(r => ({ ts: D(r), v: r.gini })) },
};
const SQ = { W: 1080, H: 1080 };
const AEON_CARD = {
  aeonfloor: () => { const s = readAeon("public/aeon-sales.json"); return s && renderAeonFloorCard(s, SQ); },
  aeonskyline: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonSkylineCard(d, SQ); },
  aeontraders: () => { const d = readAeon("public/aeon-traders.json"); return d && renderAeonTradersCard(d, SQ); },
  aeonvaluation: () => { const d = readAeon("public/aeon-market.json"); return d && renderAeonValuationCard(d, SQ); },
  aeontraits: () => { const d = readAeon("public/aeon-market.json"); return d && renderAeonTraitsCard(d, SQ); },
  aeonhodl: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonHodlCard(d, SQ); },
  aeonowners: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonOwnersCard(d, SQ); },
  aeonconcentration: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonConcentrationCard(d, SQ); },
  aeonbehaviour: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonBehaviourCard(d, SQ); },
  aeonspxosc: () => { const d = readAeon("public/aeon-market.json"); return d && renderAeonSpxOscCard(d, SQ); },
  aeonrarityprice: () => { const d = readAeon("public/aeon-market.json"); return d && renderAeonRarityPriceCard(d, SQ); },
  aeonwhales: () => { const d = readAeon("public/aeon-onchain.json"); return d && renderAeonWhalesCard(d, SQ); },
};

// Nav tab id -> the rotating post whose card best represents that tab.
const TAB_POST = {
  rainbow: "valuation", channel: "channel", riskcolor: "riskcolor", risklevels: "risklevels",
  riskheat: "riskheat", runningroi: "runningroi", risk: "risk", drawdown: "drawdown", rally: "rally",
  spxbtc: "btc", btccycle: "cycle", relative: "majors",
  supply: "distribution", holders: "marketcap", model: "model",
};
// Posts that need the major-coin series fetched before computeStats.
const NEEDS_COINS = new Set(["btc", "majors", "majorcaps", "ytd"]);

const rainbowPng = (price, series) =>
  new Resvg(rainbowSvg(price, undefined, { series }), { fitTo: { mode: "width", value: 1200 }, font: FONT }).render().asPng();

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

  // ?studio=<src>&from=<ms>&to=<ms>&title=&sub=&ar=&log= — the Card Studio renderer. Plots the
  // chosen on-chain series cropped to a window with a custom title/subtitle, in the house card style.
  const studioSrc = params.get("studio");
  if (studioSrc && STUDIO[studioSrc]) {
    try {
      const oc = readAeon("public/onchain.json") || [];
      const src = STUDIO[studioSrc];
      let pts = src.get(oc).filter(p => Number.isFinite(p.ts) && Number.isFinite(p.v)).sort((a, b) => a.ts - b.ts);
      const from = Number(params.get("from")) || (pts[0]?.ts ?? 0), to = Number(params.get("to")) || (pts.at(-1)?.ts ?? 0);
      pts = pts.filter(p => p.ts >= from && p.ts <= to);
      const dims = dimsForAR(params.get("ar")) || { W: 1200, H: 630 };
      const card = renderStudioCard({
        points: pts, title: (params.get("title") || "").slice(0, 90), subtitle: (params.get("sub") || "").slice(0, 150),
        unit: src.unit, color: src.color, label: src.label,
        log: params.has("log") ? params.get("log") === "1" : !!src.log,
        W: dims.W, H: dims.H,
      });
      if (card) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        res.status(200).end(card);
        return;
      }
    } catch { /* fall through to the rainbow default */ }
  }

  // ?aeon=<id> — render a Project Aeon card from the committed aeon-*.json.
  const aeonId = params.get("aeon");
  if (aeonId && AEON_CARD[aeonId]) {
    try {
      const card = AEON_CARD[aeonId]();
      if (card) {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
        res.status(200).end(card);
        return;
      }
    } catch { /* fall through to default */ }
  }

  const tab = params.get("tab");
  // ?post=<id> renders that rotation card directly (used by the control gallery);
  // ?tab=<id> maps a site tab to its representative card (used by share links).
  const directPost = params.get("post");
  // ?portrait=1 renders the card in its true posted shape (4:5) — used by the
  // control gallery. Link-unfurl previews (?tab=) omit it and stay landscape.
  const portrait = params.get("portrait") === "1";
  // ?thumb=1 — a gallery preview thumbnail: render the post's card landscape
  // (1200x630) and cache it HARD (like a share image), so the /charts gallery's
  // tiles serve from the CDN instead of re-rendering on every visit.
  const thumb = params.get("thumb") === "1";
  const price = (await fetchLivePrice())?.price ?? DEFAULT_RAW.at(-1).price;
  // Bundled history extended to today (snapshot + candles) so the drawn line runs
  // to the live dot instead of freezing at the last bundled date. fetchHistory
  // falls back to the bundled set internally, so this never throws.
  const history = await fetchHistory();

  let png;
  try {
    const postId = directPost || TAB_POST[tab];
    if (!postId) {
      png = rainbowPng(price, history); // default share image (landscape)
    } else {
      const opts = { history };
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
      // landscape / 4:5 portrait). ?ar=<preset> overrides it so the panel can preview
      // an aspect-ratio choice. Share-link unfurls (?tab=) render 1.91:1 so X's link
      // card doesn't crop the chart's axes off.
      const arDims = dimsForAR(params.get("ar"));
      const cardOpts = directPost
        ? (arDims ? { dims: arDims } : (thumb ? { landscape: { W: 1200, H: 630 } } : { portrait }))
        : { landscape: { W: 1200, H: 630 } };
      // buildPost falls back to rotation if the requested post lacks data; if so,
      // fall back to the rainbow card rather than show an unrelated chart.
      png = post.id === postId ? renderPostCard(post, stats, cardOpts) : rainbowPng(price, history);
    }
  } catch {
    png = rainbowPng(price, history);
  }

  res.setHeader("Content-Type", "image/png");
  // Console previews (?post=) stay fresh for card dev — short TTL so the control
  // panel reflects a new deploy within seconds (was 60s + 5min stale, which made
  // card tweaks look like they "weren't deploying"). Share images (default /
  // ?tab=) cache hard so crawler/unfurl re-fetches come from the CDN.
  res.setHeader("Cache-Control", (directPost && !thumb)
    ? "s-maxage=10, stale-while-revalidate=20"
    : "s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).end(png);
}
