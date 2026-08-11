// The mockup's per-group cursor palette — rainbow bands in the agreed order
// (b2,b6,b4,b8,b0,b3,b7,b5). Shared by the terminal nav and the chart page so a
// group's colour is identical wherever it appears.
import { CHART_GROUPS, AEON_GROUPS, CITY_GROUPS } from "./charts-catalog.js";

export const GCOL = ["#1f8fe0", "#f0a915", "#37d067", "#e5342f", "#5b2a86", "#12c2c2", "#f2621b", "#c7d21f"];

// Each cascade section indexes its own groups from 0 (same as the nav), so a group's
// colour is GCOL[indexWithinItsSection]. City keeps its own catalog accent.
const IDX = {};
[CHART_GROUPS, AEON_GROUPS].forEach(gs => gs.forEach((g, i) => { IDX[g.title] = GCOL[i % GCOL.length]; }));
CITY_GROUPS.forEach(g => { IDX[g.title] = g.color; });

export const gcolFor = (group) => IDX[group] || "#4ee79a";
