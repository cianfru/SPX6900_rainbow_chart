// Shared resvg font config. We bundle DejaVu Sans (the exact family the cards
// already render with locally and in CI — `fc-match sans-serif` resolves to it)
// so the SVG→PNG cards keep their text on runtimes that ship NO system fonts —
// notably the Vercel serverless /api/og endpoint, where every <text> was coming
// out blank (charts drew, words didn't). Passing the font as buffers means we
// don't depend on the host having any fonts installed; if the buffers somehow
// fail to load we fall back to scanning system fonts (local/CI still work).
import { readFileSync } from "node:fs";

const load = name => {
  try { return readFileSync(new URL(`./fonts/${name}`, import.meta.url)); }
  catch { return null; }
};
const fontBuffers = [load("DejaVuSans.ttf"), load("DejaVuSans-Bold.ttf")].filter(Boolean);

export const FONT = {
  loadSystemFonts: fontBuffers.length === 0, // bundled buffers are enough → skip the system scan
  fontBuffers,
  defaultFontFamily: "DejaVu Sans",
  sansSerifFamily: "DejaVu Sans", // the cards all use font-family="sans-serif"
};
