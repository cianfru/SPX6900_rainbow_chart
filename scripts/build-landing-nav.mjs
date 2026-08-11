// Generates the terminal landing's dropdown menu (public/landing-next.html) from the
// REAL charts catalog (src/charts-catalog.js), so the landing menu is always identical
// to the site's charts menu and can never drift again. Runs in `npm run build`
// (and standalone via `npm run build:landing-nav`).
//
// It replaces the block between the `@gen-menu start` / `@gen-menu end` markers with a
// generated NAV (groups + chart titles), DESC (title -> description) and window.__LEAFID
// ("SECTION|title" -> chart id, or "@/route" for a page) which drives per-chart navigation.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CHART_GROUPS, AEON_GROUPS, CITY_GROUPS } from "../src/charts-catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "public", "landing-next.html");

const nonDev = (g) => g.charts.filter((c) => !c.dev);

// CHARTS — the SPX charts gallery groups (Valuation, Performance, On-Chain, Cost Basis, …)
const charts = { label: "CHARTS", groups: CHART_GROUPS.map((g) => ({ g: g.title, items: nonDev(g).map((c) => c.title) })) };
// SPX_CITY — the city page itself + its charts (mirrors the site's flat City menu)
const cityCharts = (CITY_GROUPS[0]?.charts || []).filter((c) => !c.dev);
const city = { label: "SPX_CITY", groups: [{ g: CITY_GROUPS[0]?.title || "SPX City", items: ["SPX City", ...cityCharts.map((c) => c.title)] }] };
// PROJECT_AEON — the Aeon groups (Market, Holders, Rarity)
const aeon = { label: "PROJECT_AEON", groups: AEON_GROUPS.map((g) => ({ g: g.title, items: nonDev(g).map((c) => c.title) })) };

const NAV = [charts, city, aeon];

// title -> description (title-keyed, as the landing's descOf expects)
const DESC = {};
[...CHART_GROUPS, ...AEON_GROUPS, ...CITY_GROUPS].forEach((g) => nonDev(g).forEach((c) => { if (c.desc) DESC[c.title] = c.desc; }));

// "SECTION|title" -> chart id (or "@/route" for a top-level page). Drives per-leaf nav.
const LEAFID = {};
CHART_GROUPS.forEach((g) => nonDev(g).forEach((c) => { LEAFID[`CHARTS|${c.title}`] = c.id; }));
AEON_GROUPS.forEach((g) => nonDev(g).forEach((c) => { LEAFID[`PROJECT_AEON|${c.title}`] = c.id; }));
LEAFID["SPX_CITY|SPX City"] = "@/city";
cityCharts.forEach((c) => { LEAFID[`SPX_CITY|${c.title}`] = c.id; });

const block =
  `const NAV=${JSON.stringify(NAV)};\n` +
  `  const DESC=${JSON.stringify(DESC)};\n` +
  `  window.__LEAFID=${JSON.stringify(LEAFID)};`;

let html = readFileSync(FILE, "utf8");
const START = "/* @gen-menu start";
const END = "/* @gen-menu end */";
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s === -1 || e === -1) { console.error("build-landing-nav: @gen-menu markers not found in", FILE); process.exit(1); }
const startCommentEnd = html.indexOf("*/", s) + 2; // end of the start-marker comment
html = html.slice(0, startCommentEnd) + "\n  " + block + "\n  " + html.slice(e);
writeFileSync(FILE, html);

const nCharts = NAV.reduce((n, sec) => n + sec.groups.reduce((m, g) => m + g.items.length, 0), 0);
console.log(`build-landing-nav: synced ${NAV.length} sections, ${NAV[0].groups.length} chart groups, ${nCharts} menu items, ${Object.keys(LEAFID).length} wired leaves`);
