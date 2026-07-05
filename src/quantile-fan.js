// Asymmetric quantile regression fan (à la Into the Cryptoverse's Bitcoin fan):
// for each percentile τ we fit an INDEPENDENT quadratic to log-price over ln(day)
// by minimising the pinball (quantile) loss, then MONOTONE-REARRANGE the fitted
// values at each date so the quantiles can't cross. Unlike the rainbow's symmetric
// offset bands, the quantiles bend on their own — the upper tail is fatter than the
// lower, and the fan converges forward (volatility compresses as the asset matures).
// SPX is young so the fit is noisy (same class of caveat as the rainbow); the value
// is a probabilistic FORWARD price cone.
import { dayN } from "./models.js";

export const QUANTILE_META = [
  { tau: 0.01, label: "1%", color: "#16a34a" },
  { tau: 0.10, label: "10%", color: "#22c55e" },
  { tau: 0.25, label: "25%", color: "#4ade80" },
  { tau: 0.50, label: "50%", color: "#cbd5e1" },
  { tau: 0.75, label: "75%", color: "#f9a8d4" },
  { tau: 0.95, label: "95%", color: "#ef4444" },
  { tau: 0.99, label: "99%", color: "#dc2626" },
];
const TAUS = QUANTILE_META.map(q => q.tau);

const pinball = (pts, tau, a, b, c) => {
  let s = 0;
  for (const p of pts) { const r = p.y - (a + b * p.u + c * p.u * p.u); s += r >= 0 ? tau * r : (tau - 1) * r; }
  return s;
};

// Nelder–Mead simplex minimiser for the convex 3-param pinball loss.
function fitOne(pts, tau) {
  const f = ([a, b, c]) => pinball(pts, tau, a, b, c);
  let s = [[Math.log(0.01), 1, 0], [Math.log(0.01) + 1, 1, 0], [Math.log(0.01), 1.2, 0], [Math.log(0.01), 1, 0.1]];
  for (let it = 0; it < 4000; it++) {
    const sv = s.map(x => [x, f(x)]).sort((p, q) => p[1] - q[1]);
    s = sv.map(p => p[0]);
    if (Math.abs(sv[3][1] - sv[0][1]) < 1e-9) break;
    const cen = [0, 1, 2].reduce((a, k) => a.map((v, i) => v + s[k][i] / 3), [0, 0, 0]);
    const w = s[3];
    const refl = cen.map((v, i) => v + (v - w[i])), fr = f(refl);
    if (fr < sv[0][1]) { const e = cen.map((v, i) => v + 2 * (v - w[i])); s[3] = f(e) < fr ? e : refl; }
    else if (fr < sv[2][1]) s[3] = refl;
    else { const con = cen.map((v, i) => v + 0.5 * (w[i] - v)); if (f(con) < sv[3][1]) s[3] = con; else s = s.map((x, k) => k === 0 ? x : x.map((v, i) => (v + s[0][i]) / 2)); }
  }
  return s.map(x => [x, f(x)]).sort((p, q) => p[1] - q[1])[0][0];
}

// Fit the 7 quantiles on a {date,price}[] series. Returns { taus, fits, baseDay, t0 }.
export function fitQuantileFan(series) {
  const s = series.filter(r => r.price > 0);
  const pts = s.map(r => ({ u: Math.log(Math.max(1, dayN(r.date))), y: Math.log(r.price) }));
  return { taus: TAUS, fits: TAUS.map(tau => fitOne(pts, tau)), baseDay: dayN(s[0].date), t0: new Date(s[0].date).getTime() };
}

// days-since-launch for a timestamp, consistent with the fit's dayN basis.
export const dayForTs = (fan, ts) => Math.max(1, fan.baseDay + (ts - fan.t0) / 86400000);

// monotone-rearranged quantile PRICES at a given day index.
export function quantilePricesAt(fits, day) {
  const u = Math.log(Math.max(1, day));
  return fits.map(([a, b, c]) => a + b * u + c * u * u).sort((a, b) => a - b).map(Math.exp);
}
