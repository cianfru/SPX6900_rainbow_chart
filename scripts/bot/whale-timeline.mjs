// Reconstruct the whale mosaic AT ANY PAST WEEK, from the city time-machine data (spx-timeline.json,
// per-wallet weekly balances, ETH). Shared by the "Whales Then vs Now" card and the cycle video.
//
// The mosaic's whole idea: every ≥100k-SPX wallet is one square, coloured by its recent net flow
// (green accumulating, red distributing). Here we compute that field for a HISTORICAL week — the whale
// SET at that week (balance ≥ threshold) and each one's flow = balance(week) − balance(week − 4), i.e.
// the ~30-day net at that moment. So we can freeze the whale mood at the top, at a capitulation, or now.
//
// HONESTY: a balance falling = the wallet REDUCED (sold, moved or split) — never asserted as "sold".
// Ethereum only (the timeline is the ETH holder replay); the multi-chain live mosaic is a separate view.
import { readFileSync } from "node:fs";

export function loadTimeline() {
  try { return JSON.parse(readFileSync(new URL("../../public/spx-timeline.json", import.meta.url), "utf8")); }
  catch { return null; }
}
export function loadOnchainSeries() {
  try { return JSON.parse(readFileSync(new URL("../../public/onchain.json", import.meta.url), "utf8")); }
  catch { return null; }
}

// balance of a wallet at week W (sparse change-points p:[[weekIdx,bal]] carry forward the last value).
export function balAt(wallet, week) {
  let b = 0;
  for (const [i, v] of wallet.p) { if (i <= week) b = v; else break; }
  return b;
}

// map a YYYY-MM-DD to the nearest timeline week index (clamped to the valid range).
export function weekOfDate(tl, date) {
  const w0 = Date.parse(tl.week0), t = Date.parse(date);
  if (!Number.isFinite(w0) || !Number.isFinite(t)) return tl.n - 1;
  return Math.max(0, Math.min(tl.n - 1, Math.round((t - w0) / (7 * 86400000))));
}
export function dateOfWeek(tl, week) {
  const w0 = Date.parse(tl.week0);
  return new Date(w0 + week * 7 * 86400000).toISOString().slice(0, 10);
}

// The whale field at week W: [{a, bal, net}] for wallets ≥ minBal at W, net = 4-week balance change.
// Sorted biggest-buyer → biggest-seller so the mosaic reads as a green→red gradient.
export function whalesAtWeek(tl, week, { minBal = 1e5, flowWeeks = 4 } = {}) {
  const rows = [];
  for (const w of tl.wallets) {
    const bal = balAt(w, week);
    if (bal < minBal) continue;
    const net = bal - balAt(w, Math.max(0, week - flowWeeks));
    rows.push({ a: w.a, bal, net });
  }
  const dust = r => Math.max(1000, r.bal * 0.005);
  let buy = 0, sell = 0, flat = 0;
  for (const r of rows) { const d = dust(r); if (r.net > d) buy++; else if (r.net < -d) sell++; else flat++; }
  rows.sort((a, b) => b.net - a.net);
  return { rows, buy, sell, flat, total: rows.length };
}

// SPECTRUM ANALYZER — bucket the whale field at week W into 10 size cohorts (small → mega), each with
// its buy / flat / sell composition. Rendered as 10 vertical bars (green from the bottom = % buying,
// red from the top = % selling), it reads like an audio spectrum; scrubbed through the time machine
// the bars dance. Size bands are fixed + log-ish so "which size cohort is doing what" is legible.
export const SPECTRUM_EDGES = [1e5, 2e5, 3.5e5, 6e5, 1e6, 1.75e6, 3e6, 5e6, 9e6, 16e6, Infinity];
export const SPECTRUM_LABELS = ["100k", "200k", "350k", "600k", "1M", "1.75M", "3M", "5M", "9M", "16M+"];
export function whaleSpectrum(tl, week, { flowWeeks = 4 } = {}) {
  const { rows } = whalesAtWeek(tl, week, { flowWeeks });
  const cohorts = SPECTRUM_LABELS.map((label, i) => ({ label, lo: SPECTRUM_EDGES[i], hi: SPECTRUM_EDGES[i + 1], buy: 0, sell: 0, flat: 0, total: 0 }));
  for (const r of rows) {
    let ci = -1;
    for (let i = 0; i < cohorts.length; i++) { if (r.bal >= SPECTRUM_EDGES[i] && r.bal < SPECTRUM_EDGES[i + 1]) { ci = i; break; } }
    if (ci < 0) continue;
    const c = cohorts[ci], dust = Math.max(1000, r.bal * 0.005);
    c.total++;
    if (r.net > dust) c.buy++; else if (r.net < -dust) c.sell++; else c.flat++;
  }
  return cohorts;
}

// Pick the euphoria (biggest realized-PROFIT spike) and capitulation (biggest realized-LOSS spike)
// dates from the on-chain NRPL series — objective cycle markers, not eyeballed price. Returns the
// dates + their timeline week indices.
export function nrplPeaks(onchain, tl) {
  const rows = (onchain || []).filter(r => r.nrpl != null && r.d);
  if (!rows.length) return null;
  const peak = key => rows.reduce((best, r) => ((r[key] || 0) > (best?.[key] || 0) ? r : best), null);
  const euph = peak("nrplProfit"), cap = peak("nrplLoss");
  return {
    euphoria: euph ? { date: euph.d, week: weekOfDate(tl, euph.d), usd: euph.nrplProfit } : null,
    capitulation: cap ? { date: cap.d, week: weekOfDate(tl, cap.d), usd: cap.nrplLoss } : null,
  };
}
