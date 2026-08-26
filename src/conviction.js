// CONVICTION SCORE (0–100) — a single supply-weighted "how sticky are the holders" reading, over time.
// Anchored like the metric HolderScan popularised: 0 ≈ full supply turnover in ~15 days, 100 = all
// supply diamond-held (90+ days). The difference is ours is fully REPRODUCIBLE — the weights are
// published here and the input is our own FIFO age reconstruction (onchain.json `age` bands), not a
// black box. Each age band is weighted by how "stuck" it is on a 15-day→90-day ramp: supply held 90+
// days counts fully (1.0), the 30–90d band gets partial credit, fresh (<30d) supply barely counts.
// Bands are [0–1m, 1–3m, 3–6m, 6–12m, 1y+] as a % of held supply (they sum to ~100).
export const CONVICTION_WEIGHTS = [0.05, 0.6, 1, 1, 1];

export function convictionOf(age) {
  if (!Array.isArray(age) || age.length !== 5) return null;
  let weighted = 0, tot = 0;
  for (let i = 0; i < 5; i++) { const v = Number(age[i]) || 0; weighted += v * CONVICTION_WEIGHTS[i]; tot += v; }
  if (tot <= 0) return null;
  return Math.max(0, Math.min(100, (weighted / tot) * 100));   // renormalise so it reads on a clean 0–100
}

// One row per day: { ts, d, score }. Feeds both the site chart and the X card.
export function convictionSeries(onchain) {
  return (onchain || [])
    .filter(r => r && Array.isArray(r.age) && r.age.length === 5)
    .map(r => ({ ts: Date.parse(r.d), d: r.d, score: convictionOf(r.age) }))
    .filter(r => Number.isFinite(r.ts) && r.score != null)
    .sort((a, b) => a.ts - b.ts);
}

// Plain-word zone for a score.
export function convictionZone(s) {
  if (s == null) return { label: "—", color: "#94a3b8" };
  if (s >= 80) return { label: "diamond-held", color: "#22d3ee" };
  if (s >= 60) return { label: "very sticky", color: "#34d399" };
  if (s >= 40) return { label: "firm", color: "#a3e635" };
  if (s >= 20) return { label: "loose", color: "#f6a23c" };
  return { label: "high turnover", color: "#fb7185" };
}
