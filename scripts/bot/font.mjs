// Shared resvg font config. We bundle DejaVu Sans (the family the cards render
// with locally + in CI) so card text survives on runtimes that ship NO system
// fonts — notably Vercel's serverless /api/og, where every <text> came out blank.
//
// HOW (the non-obvious part, confirmed via /api/og?debug=font on the live fn):
// the resvg-js native binary on Vercel (Node 24 / Lambda) IGNORES `fontBuffers`
// — it rendered zero text pixels — but honors `fontFiles`. So we decode the
// font from base64 EMBEDDED in font-data.js (a JS import Vercel's bundler always
// traces — never lost to an includeFiles glob) into the writable temp dir, and
// point resvg at those files. Data comes from the bundle; resvg reads it by the
// path it respects. Works identically locally.
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { REGULAR_B64, BOLD_B64 } from "./font-data.js";
import { SERIF_REGULAR_B64, SERIF_BOLD_B64 } from "./font-data-serif.js";

let here = "";
try { here = dirname(fileURLToPath(import.meta.url)); } catch { /* bundled */ }
// Last-resort: read the on-disk .ttf if the embedded base64 is somehow empty.
const fromDisk = name => {
  for (const p of [here && join(here, name), join(process.cwd(), "scripts/bot", name)].filter(Boolean)) {
    try { return readFileSync(p); } catch { /* next */ }
  }
  return null;
};

// Materialize each weight to a writable temp file once per cold start and collect
// the paths for resvg's `fontFiles`.
const materialize = (b64, name) => {
  const buf = b64 ? Buffer.from(b64, "base64") : fromDisk(name);
  if (!buf) return null;
  try { const p = join(tmpdir(), name); writeFileSync(p, buf); return p; }
  catch { return null; }
};
const fontFiles = [
  materialize(REGULAR_B64, "DejaVuSans.ttf"),
  materialize(BOLD_B64, "DejaVuSans-Bold.ttf"),
  materialize(SERIF_REGULAR_B64, "DejaVuSerif.ttf"),
  materialize(SERIF_BOLD_B64, "DejaVuSerif-Bold.ttf"),
].filter(Boolean);

// ⭐ HOUSE TYPEFACE (2026-07-24): the cards render in DejaVu SERIF, not the default
// sans — an editorial serif that's visibly OURS and distinct from the generic-sans
// look every other crypto card (and the copycats) use. The cards all ask for the
// generic "sans-serif" family, so mapping that family to the serif restyles all
// ~60 cards from this one file — no per-card edits. DejaVu Sans stays bundled as a
// fallback (and for anything that explicitly asks for a sans family).
export const FONT = {
  loadSystemFonts: fontFiles.length === 0, // bundled files are enough → skip the system scan
  fontFiles,
  defaultFontFamily: "DejaVu Serif",
  serifFamily: "DejaVu Serif",
  sansSerifFamily: "DejaVu Serif", // generic "sans-serif" in the cards now → the house serif
};

// Diagnostics surfaced by /api/og?debug=font.
export const FONT_DIAG = {
  regularB64Len: REGULAR_B64?.length ?? 0,
  boldB64Len: BOLD_B64?.length ?? 0,
  fontFiles,
  loadSystemFonts: FONT.loadSystemFonts,
};
