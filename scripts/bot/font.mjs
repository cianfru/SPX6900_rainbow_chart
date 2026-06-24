// Shared resvg font config. We bundle DejaVu Sans (the exact family the cards
// already render with locally and in CI — `fc-match sans-serif` resolves to it)
// so the SVG→PNG cards keep their text on runtimes that ship NO system fonts —
// notably the Vercel serverless /api/og endpoint, where every <text> was coming
// out blank (charts drew, words didn't). Passing the font as buffers means we
// don't depend on the host having any fonts installed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// Resolve the bundled .ttf two ways, because Vercel may bundle this module and
// move it: (1) next to this file (local + CI, unbundled), and (2) under the
// deployment root via vercel.json includeFiles (where process.cwd() points).
// The fonts live FLAT in scripts/bot/ (next to the logo PNGs) — a nested
// scripts/bot/fonts/ subdir was silently dropped by Vercel's includeFiles while
// the flat logo files bundled fine, so every <text> rendered blank on /api/og.
let here = "";
try { here = dirname(fileURLToPath(import.meta.url)); } catch { /* bundled */ }
const candidates = name => [
  here && join(here, name),
  join(process.cwd(), "scripts/bot", name),
].filter(Boolean);
const load = name => {
  for (const p of candidates(name)) { try { return readFileSync(p); } catch { /* next */ } }
  return null;
};
const fontBuffers = [load("DejaVuSans.ttf"), load("DejaVuSans-Bold.ttf")].filter(Boolean);

export const FONT = {
  loadSystemFonts: fontBuffers.length === 0, // bundled buffers are enough → skip the system scan
  fontBuffers,
  defaultFontFamily: "DejaVu Sans",
  sansSerifFamily: "DejaVu Sans", // the cards all use font-family="sans-serif"
};
