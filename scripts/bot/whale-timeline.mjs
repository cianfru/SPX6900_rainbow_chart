// Bot-side wrapper: the pure whale-field / spectrum math lives in src/whale-spectrum.js (shared with
// the interactive site chart so they can't drift). This adds the node-only file loaders on top.
import { readFileSync } from "node:fs";

export {
  balAt, weekOfDate, dateOfWeek, whalesAtWeek, whaleSpectrum, nrplPeaks,
  SPECTRUM_EDGES, SPECTRUM_LABELS,
} from "../../src/whale-spectrum.js";

export function loadTimeline() {
  try { return JSON.parse(readFileSync(new URL("../../public/spx-timeline.json", import.meta.url), "utf8")); }
  catch { return null; }
}
export function loadOnchainSeries() {
  try { return JSON.parse(readFileSync(new URL("../../public/onchain.json", import.meta.url), "utf8")); }
  catch { return null; }
}
