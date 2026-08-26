// HOLDER CHANGE BREAKDOWN — the daily change in how many wallets sit in each dollar bracket, so you can
// see whether the bigger wallets are accumulating, distributing, or sitting still. Built from the
// engine's `wealth` field (per-day wallet HEADCOUNT by USD tier, already in onchain.json) — deliberately
// headcount, not share of supply (a dollar band's supply share mostly just tracks the coin price).
// Tiers: [<$100, $100–1k, $1k–10k, $10k–100k, $100k+].
export const WEALTH_TIERS = [
  { key: "t0", label: "< $100", color: "#64748b", big: false },
  { key: "t1", label: "$100–1k", color: "#38bdf8", big: true },
  { key: "t2", label: "$1k–10k", color: "#22d3ee", big: true },
  { key: "t3", label: "$10k–100k", color: "#34d399", big: true },
  { key: "t4", label: "$100k+", color: "#f6a23c", big: true },
];

// One row per day (from the 2nd onward): the net change in each tier's wallet count + the share of
// wallets worth over $100. `wealth` is [c<100, c100-1k, c1k-10k, c10k-100k, c100k+].
export function holderChangeSeries(onchain) {
  const rows = (onchain || []).filter(r => r && Array.isArray(r.wealth) && r.wealth.length === 5 && r.d);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const w = rows[i].wealth, p = rows[i - 1].wealth;
    const total = w.reduce((s, x) => s + (x || 0), 0);
    const above100 = (w[1] || 0) + (w[2] || 0) + (w[3] || 0) + (w[4] || 0);
    out.push({
      ts: Date.parse(rows[i].d), d: rows[i].d,
      t0: (w[0] || 0) - (p[0] || 0), t1: (w[1] || 0) - (p[1] || 0), t2: (w[2] || 0) - (p[2] || 0),
      t3: (w[3] || 0) - (p[3] || 0), t4: (w[4] || 0) - (p[4] || 0),
      pctAbove100: total > 0 ? +(100 * above100 / total).toFixed(2) : null,
    });
  }
  return out.filter(r => Number.isFinite(r.ts));
}
