import { useState, useEffect } from "react";
import { fetchAllHolderscanData } from "./holderscan.js";
import { loadHistory, LIVE_DATA_DOWN } from "./history-data.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";


// Frosted-glass card style, matching App.jsx.
const glassCard = {
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
};

const fNum = n => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
};

const fUsd = n => {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(2);
};

const fPct = n => n != null ? (n * 100).toFixed(1) + "%" : "—";

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      padding: "16px 20px", borderRadius: 10, ...glassCard,
    }}>
      <div style={{
        fontFamily: SANS, fontSize: 12, fontWeight: 600, color: "#94a3b8",
        textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: color || "#f1f5f9", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DeltaBar({ label, value }) {
  const pos = value > 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontFamily: SANS, fontSize: 14, color: "#cbd5e1" }}>{label}</span>
      <span style={{
        fontFamily: MONO, fontSize: 14, fontWeight: 700,
        color: pos ? "#4ade80" : value < 0 ? "#f87171" : "#64748b",
      }}>
        {pos ? "+" : ""}{fNum(value)}
      </span>
    </div>
  );
}

function CategoryBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "#e2e8f0", textTransform: "capitalize" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#94a3b8" }}>{fNum(count)} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function TopHolderRow({ holder, index }) {
  const addr = holder.address;
  const short = addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "—";
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b", width: 28 }}>#{holder.rank || index + 1}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#cbd5e1" }}>{short}</span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, color: "#f1f5f9", fontWeight: 700 }}>
        {fNum(holder.amount)}
      </span>
    </div>
  );
}

const SectionHeader = () => (
  <div style={{
    fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#cbd5e1", marginBottom: 14,
    letterSpacing: 1.2, textTransform: "uppercase",
    display: "flex", alignItems: "center", gap: 12,
  }}>
    <span style={{
      background: "linear-gradient(90deg, #6366f1, #3b82f6)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    }}>Holder Analytics</span>
    <span style={{ fontSize: 12, color: "#475569", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
      powered by Holderscan
    </span>
  </div>
);

export default function HolderscanDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [snap, setSnap] = useState(null); // last banked daily snapshot, error fallback

  useEffect(() => {
    fetchAllHolderscanData()
      .then(d => {
        const allNull = !d.deltas && !d.breakdowns && !d.stats && !d.pnl && !d.topHolders;
        if (allNull) setError(LIVE_DATA_DOWN);
        else setData(d);
        setLoading(false);
      })
      .catch(() => { setError(LIVE_DATA_DOWN); setLoading(false); });
  }, []);

  // When live analytics are down, surface the essentials from the newest daily
  // snapshot so the page isn't empty.
  useEffect(() => {
    if (!error) return;
    let live = true;
    loadHistory().then(h => { if (live && h.length) setSnap(h[h.length - 1]); });
    return () => { live = false; };
  }, [error]);

  if (loading) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
        <SectionHeader />
        <div style={{ padding: "24px", fontFamily: SANS, fontSize: 14, color: "#64748b", textAlign: "center" }}>
          Loading holder data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
        <SectionHeader />
        <div style={{
          padding: "16px 20px",
          background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)",
          borderRadius: 8, fontFamily: SANS, fontSize: 14, color: "#fbbf24",
        }}>
          {error}
          {snap && (
            <div style={{ marginTop: 8, color: "#cbd5e1" }}>
              Last daily snapshot ({snap.d}): <strong>{fNum(snap.holders)}</strong> holders
              {snap.be > 0 && <> · avg cost basis <strong>{fUsd(snap.be)}</strong></>}
              {/* diamond-hands % dropped: HolderScan's opaque tier (61% of supply) conflicts with the
                  transparent FIFO age bands the On-Chain charts now use (53% held 1y+). See HODL Waves. */}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { deltas, breakdowns, stats, pnl, topHolders } = data;
  const totalHolders = breakdowns?.total_holders;

  const categoryColors = {
    whale: "#f59e0b",
    dolphin: "#3b82f6",
    fish: "#06b6d4",
    crab: "#22c55e",
    shrimp: "#6366f1",
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "40px auto 0" }}>
      <SectionHeader />

      {/* Top stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 12, marginBottom: 16 }}>
        {totalHolders != null && (
          <StatCard label="Total Holders" value={fNum(totalHolders)} />
        )}
        {pnl?.break_even_price != null && (
          <StatCard label="Break-Even Price" value={fUsd(pnl.break_even_price)} sub="avg holder entry" />
        )}
        {stats?.gini != null && (
          <StatCard label="Gini Index" value={stats.gini.toFixed(3)} sub="0 = equal · 1 = concentrated" color={stats.gini > 0.95 ? "#f87171" : stats.gini > 0.9 ? "#f59e0b" : "#4ade80"} />
        )}
        {stats?.hhi != null && (
          <StatCard label="HHI" value={fNum(Math.round(stats.hhi))} sub={stats.hhi < 100 ? "Low concentration" : stats.hhi < 1000 ? "Moderate" : "High concentration"} />
        )}
        {pnl?.unrealized_pnl_total != null && (
          <StatCard label="Unrealized P&L" value={fUsd(pnl.unrealized_pnl_total)} color={pnl.unrealized_pnl_total >= 0 ? "#4ade80" : "#f87171"} />
        )}
        {pnl?.realized_pnl_total != null && (
          <StatCard label="Realized P&L" value={fUsd(pnl.realized_pnl_total)} color={pnl.realized_pnl_total >= 0 ? "#4ade80" : "#f87171"} />
        )}
        {stats?.median_holder_position != null && (
          <StatCard label="Median Position" value={"#" + fNum(stats.median_holder_position)} sub="rank at 50% supply" />
        )}
        {stats?.retention_rate != null && (
          <StatCard label="Retention Rate" value={fPct(stats.retention_rate)} />
        )}
      </div>

      {/* Detail panels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14 }}>
        {/* Holder Changes */}
        {deltas && (
          <div style={{
            padding: "20px 22px", borderRadius: 10, ...glassCard,
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 14,
            }}>
              Holder Changes
            </div>
            <DeltaBar label="1 hour" value={deltas["1hour"]} />
            <DeltaBar label="4 hours" value={deltas["4hours"]} />
            <DeltaBar label="24 hours" value={deltas["1day"]} />
            <DeltaBar label="7 days" value={deltas["7days"]} />
            <DeltaBar label="14 days" value={deltas["14days"]} />
            <DeltaBar label="30 days" value={deltas["30days"]} />
          </div>
        )}

        {/* Distribution */}
        {breakdowns?.categories && (
          <div style={{
            padding: "20px 22px", borderRadius: 10, ...glassCard,
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 14,
            }}>
              Holder Distribution
            </div>
            {Object.entries(breakdowns.categories).reverse().map(([cat, count]) => (
              <CategoryBar key={cat} label={cat} count={count} total={totalHolders} color={categoryColors[cat] || "#94a3b8"} />
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, letterSpacing: 0.8 }}>BY VALUE HELD</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                {[
                  [">$10", breakdowns.holders_over_10_usd],
                  [">$100", breakdowns.holders_over_100_usd],
                  [">$1K", breakdowns.holders_over_1000_usd],
                  [">$10K", breakdowns.holders_over_10000_usd],
                  [">$100K", breakdowns.holders_over_100k_usd],
                  [">$1M", breakdowns.holders_over_1m_usd],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13 }}>
                    <span style={{ color: "#94a3b8" }}>{label}</span>
                    <span style={{ color: "#f1f5f9", fontWeight: 700, fontFamily: MONO }}>{fNum(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Holders */}
        {topHolders && topHolders.length > 0 && (
          <div style={{
            padding: "20px 22px", borderRadius: 10, ...glassCard,
          }}>
            <div style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
            }}>
              Top 10 Holders
            </div>
            {topHolders.map((h, i) => (
              <TopHolderRow key={h.address || i} holder={h} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
