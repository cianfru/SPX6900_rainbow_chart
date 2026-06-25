// Render the power-law channel chart as a PNG card (SVG -> PNG via resvg, no
// browser). Shares the SVG generator with the social share image (api/og.js).
import { Resvg } from "@resvg/resvg-js";
import { channelSvg } from "../../src/channel-svg.js";
import { FONT } from "./font.mjs";

export function renderChannelCard(stats, opts = {}) {
  const w = opts.W ?? 1200;
  return new Resvg(channelSvg(stats.price, stats.date, { W: opts.W, H: opts.H }), { fitTo: { mode: "width", value: w }, font: FONT }).render().asPng();
}
