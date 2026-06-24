// Shared resvg font config. We bundle DejaVu Sans (the exact family the cards
// already render with locally and in CI — `fc-match sans-serif` resolves to it)
// so the SVG→PNG cards keep their text on runtimes that ship NO system fonts —
// notably the Vercel serverless /api/og endpoint, where every <text> was coming
// out blank (charts drew, words didn't).
//
// The font is loaded from base64 EMBEDDED in font-data.js (a normal JS import,
// which Vercel's bundler traces into the function) rather than read off disk —
// a filesystem .ttf was being silently dropped by the includeFiles glob, leaving
// resvg with no font at all. The on-disk .ttf are still read as a fallback for
// any context where the generated module might be stale.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { REGULAR_B64, BOLD_B64 } from "./font-data.js";

let here = "";
try { here = dirname(fileURLToPath(import.meta.url)); } catch { /* bundled */ }
const fromDisk = name => {
  for (const p of [here && join(here, name), join(process.cwd(), "scripts/bot", name)].filter(Boolean)) {
    try { return readFileSync(p); } catch { /* next */ }
  }
  return null;
};
// Prefer the embedded base64 (always bundled); fall back to the on-disk .ttf.
const decode = (b64, file) => (b64 ? Buffer.from(b64, "base64") : fromDisk(file));
const fontBuffers = [decode(REGULAR_B64, "DejaVuSans.ttf"), decode(BOLD_B64, "DejaVuSans-Bold.ttf")].filter(Boolean);

export const FONT = {
  loadSystemFonts: fontBuffers.length === 0, // bundled buffers are enough → skip the system scan
  fontBuffers,
  defaultFontFamily: "DejaVu Sans",
  sansSerifFamily: "DejaVu Sans", // the cards all use font-family="sans-serif"
};

// Diagnostics surfaced by /api/og?debug=font, so we can see what the Vercel
// function actually has (the embedded base64 was lost / empty? buffers decoded?).
export const FONT_DIAG = {
  regularB64Len: REGULAR_B64?.length ?? 0,
  boldB64Len: BOLD_B64?.length ?? 0,
  fontBuffers: fontBuffers.length,
  buffer0Bytes: fontBuffers[0]?.length ?? 0,
  loadSystemFonts: FONT.loadSystemFonts,
};
