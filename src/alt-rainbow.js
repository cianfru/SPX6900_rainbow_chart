// SPX6900 vs the ALT MARKET — relative-strength over/under.
// Series = SPX ÷ TOTAL3ES (alt market ex-BTC/ETH/stables). PAST = the bundled TradingView
// TOTAL3ES × our dense SPX; FORWARD = the daily snapshot (history.json records carry live
// SPX `p` + a keyless-reconstructed `t3es`), so both card and site tick daily with no
// manual re-export. Because it's a RATIO, the bands are a LOG-LINEAR trend ± σ (z-score),
// NOT the age power-law: above trend = SPX stretched vs alts, below = cheap.
import { SPX_DAILY } from "./spx-daily.js";
import { TOTAL3ES } from "./total3es-history.js";

const DAY = 86400000;
const toTs = d => Date.parse(d + "T00:00:00Z");

// Bundle historical ratio: SPX daily × TOTAL3ES (TradingView export), joined by date.
function bundleRatio() {
  const alt = new Map(TOTAL3ES.map(([d, v]) => [d, v]));
  const out = [];
  for (const [d, px] of SPX_DAILY) { const a = alt.get(d); if (a > 0 && px > 0) out.push({ ts: toTs(d), d, ratio: px / a }); }
  return out.sort((x, y) => x.ts - y.ts);
}

// Full ratio series = bundle (past) + daily snapshots (forward). Snapshot records carry
// live SPX `p` and a keyless-reconstructed `t3es`; that reconstruction sits at a different
// LEVEL than TradingView's TOTAL3ES, so forward t3es is REBASED to the bundle's level at
// the seam (deterministic: seamT3es / first-forward-t3es) — only the real daily deltas
// carry through, no jump at the handoff. Same idea as the wallet-growth seam splice.
export function altRatioSeries(history = []) {
  const base = bundleRatio();
  if (!base.length) return base;
  const seamDate = base.at(-1).d, seamT3es = TOTAL3ES.at(-1)[1];
  const fwd = (history || []).filter(r => r && r.d > seamDate && r.p > 0 && r.t3es > 0).sort((a, b) => a.d < b.d ? -1 : 1);
  if (fwd.length) {
    const rebase = seamT3es / fwd[0].t3es; // anchor forward t3es to the TV level (deterministic)
    for (const r of fwd) base.push({ ts: toTs(r.d), d: r.d, ratio: r.p / (r.t3es * rebase) });
  }
  return base;
}

// Pure OLS + z-score fit over a ratio series (rebased to 1× at the start). Testable core.
export function fitRainbow(pts) {
  if (!pts || pts.length < 30) return null;
  const r0 = pts[0].ratio, t0 = pts[0].ts;
  const s = pts.map(p => ({ ts: p.ts, d: p.d, rr: p.ratio / r0, t: (p.ts - t0) / DAY }));
  const y = s.map(p => Math.log(p.rr)), x = s.map(p => p.t), n = s.length;
  const sT = x.reduce((a, v) => a + v, 0), sY = y.reduce((a, v) => a + v, 0);
  const sTT = x.reduce((a, v) => a + v * v, 0), sTY = x.reduce((a, v, i) => a + v * y[i], 0);
  const b = (n * sTY - sT * sY) / (n * sTT - sT * sT || 1);
  const a = (sY - b * sT) / n;
  const res = s.map((p, i) => y[i] - (a + b * p.t));
  // floor σ so a (near-)perfect fit yields z≈0 instead of 0/0 numerical noise.
  const sigma = Math.max(Math.sqrt(res.reduce((q, v) => q + v * v, 0) / n), 1e-6);
  const series = s.map((p, i) => ({ ts: p.ts, d: p.d, rr: p.rr, z: res[i] / sigma }));
  const cur = series.at(-1);
  return { series, fit: { a, b, sigma }, cur: { ...cur, label: zLabel(cur.z) } };
}

// history = the snapshot records (history.json) — { d, p, t3es } is all that's read.
export function buildAltRainbow(history = []) {
  return fitRainbow(altRatioSeries(history));
}

export function zLabel(z) {
  if (z >= 1.5) return "richly stretched vs alts";
  if (z >= 0.5) return "outperforming its trend vs alts";
  if (z > -0.5) return "in line with the alt market";
  if (z > -1.5) return "cheap vs alts";
  return "deeply cheap vs alts";
}

// Continuous 0..1 (blue→red) for a z in ±2.5σ, for colouring.
export const zToUnit = z => Math.max(0, Math.min(1, (z + 2.5) / 5));
