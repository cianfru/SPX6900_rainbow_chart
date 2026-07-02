// Render the rainbow chart as a 1200x630 PNG card (SVG -> PNG via resvg, no
// browser). Shares the SVG generator with the social share image (api/og.js).
import { Resvg } from "@resvg/resvg-js";
import { rainbowSvg } from "../../src/rainbow-svg.js";
import { FONT } from "./font.mjs";

export function renderRainbowCard(stats, opts = {}) {
  const w = opts.W ?? 1200;
  return new Resvg(rainbowSvg(stats.price, stats.date, { W: opts.W, H: opts.H, series: stats.drawn }), { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
}
