import { D0 } from "./data.js";
import { BAND_LABELS } from "./models.js";

// Emit a TradingView Pine Script v6 indicator that recreates the exact
// offset power-law rainbow bands from the live model fit.
export function generatePine(m) {
  const d0 = new Date(D0);
  const Y = d0.getUTCFullYear();
  const M = d0.getUTCMonth() + 1;
  const D = d0.getUTCDate();
  const num = x => Number(x).toFixed(8);

  const bandConsts = m.bands.map((o, i) => `o${i} = ${num(o)}`).join("\n");
  const bandPlots = m.bands
    .map((_, i) => `bp${i} = plot(f_band(o${i}), display = display.none, editable = false)`)
    .join("\n");
  const bandFills = BAND_LABELS
    .map((bl, i) => `fill(bp${i}, bp${i + 1}, color = color.new(${bl.c}, 55), title = "${bl.l}")`)
    .join("\n");

  return `//@version=6
indicator("SPX6900 Rainbow Valuation Bands", overlay = true)

// ════════════════════════════════════════════════════════════════
//  SPX6900 Rainbow Chart — offset power-law valuation bands
//  Generated from the live model fit at the SPX6900 Rainbow Chart site.
//
//  TIP: set your chart's price scale to LOGARITHMIC so the bands
//       fan out into the classic rainbow shape.
//
//  Model:  ln(price) = a · ln(t + t0) + b   (t = days since launch)
//  Launch: ${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}
//  Fit:    R^2 = ${m.r2.toFixed(3)}   sigma = ${m.std.toFixed(3)}
// ════════════════════════════════════════════════════════════════

D0 = timestamp("UTC", ${Y}, ${M}, ${D}, 0, 0)
a  = ${num(m.a)}
b  = ${num(m.b)}
t0 = ${num(m.t0)}

day      = math.max(1, math.round((time - D0) / 86400000) + 1)
lnCenter = a * math.log(day + t0) + b

f_band(off) => math.exp(lnCenter + off)

// residual-percentile band offsets (p2 … p99.5)
${bandConsts}

// hidden boundary lines + colored fills between them
${bandPlots}

${bandFills}

// model center (median fair value)
plot(math.exp(lnCenter), "Model Center", color = color.new(color.white, 35), linewidth = 1)
`;
}
