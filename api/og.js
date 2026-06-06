import React from "react";
import { ImageResponse } from "@vercel/og";
import { DEFAULT_RAW } from "../src/data.js";
import { buildModel, bandIndex, BAND_LABELS, dayN } from "../src/models.js";

export const config = { runtime: "edge" };

const POOL = "0x52c77b0cb827afbad022e6d6caf2c44452edbc39";

async function getPrice() {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/eth/pools/${POOL}`, { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.data?.attributes?.base_token_price_usd); if (p > 0) return p; }
  } catch { /* fall through */ }
  try {
    const r = await fetch("https://api.exchange.coinbase.com/products/SPX-USD/ticker", { headers: { Accept: "application/json" } });
    if (r.ok) { const j = await r.json(); const p = parseFloat(j?.price); if (p > 0) return p; }
  } catch { /* fall through */ }
  return null;
}

const fmtPrice = p => (p >= 1 ? "$" + p.toFixed(2) : "$" + p.toFixed(4));

export default async function handler() {
  const price = await getPrice();
  const model = buildModel(DEFAULT_RAW);

  let bandLabel = "—", bandColor = "#94a3b8", priceText = "—";
  if (price) {
    const bi = bandIndex(model, price, dayN(new Date().toISOString().slice(0, 10)));
    bandLabel = BAND_LABELS[bi].l;
    bandColor = BAND_LABELS[bi].c;
    priceText = fmtPrice(price);
  }

  const h = React.createElement;
  const el = h("div", {
    style: {
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#020208",
      backgroundImage: `radial-gradient(circle at 50% 18%, ${bandColor}22, transparent 60%)`,
    },
  },
    h("div", { style: { fontSize: 42, color: "#94a3b8", letterSpacing: 4, display: "flex" } }, "SPX6900 RAINBOW CHART"),
    h("div", { style: { fontSize: 150, fontWeight: 800, color: bandColor, marginTop: 18, display: "flex", textShadow: `0 0 40px ${bandColor}66` } }, priceText),
    h("div", { style: { fontSize: 88, fontWeight: 800, color: bandColor, marginTop: 4, display: "flex" } }, bandLabel),
    h("div", { style: { fontSize: 30, color: "#64748b", marginTop: 40, display: "flex" } }, "spx6900rainbow.xyz"),
  );

  return new ImageResponse(el, {
    width: 1200,
    height: 630,
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
  });
}
