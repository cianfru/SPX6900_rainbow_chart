// Render the rainbow chart as a 1200x630 PNG card (SVG -> PNG via resvg, no
// browser). Shares the SVG generator with the social share image (api/og.js).
import { Resvg } from "@resvg/resvg-js";
import { rainbowSvg } from "../../src/rainbow-svg.js";

export function renderRainbowCard(stats) {
  return new Resvg(rainbowSvg(stats.price, stats.date), { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
