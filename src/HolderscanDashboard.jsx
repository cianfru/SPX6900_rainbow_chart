import { useState, useEffect } from "react";
import { fetchAllHolderscanData } from "./holderscan.js";

const mono = "'JetBrains Mono', monospace";
const sans = "'Inter', system-ui, sans-serif";

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
      padding: "10px 14px", background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
    }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: color || "#f1f5f9" }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: mono, fontSize: 9, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DeltaBar({ label, value }) {
  const pos = value > 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: "#94a3b8" }}>{label}</span>
      <span style={{
        fontFamily: mono, fontSize: 10, fontWeight: 600,
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
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: "#cbd5e1", textTransform: "capitalize" }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "#94a3b8" }}>{fNum(count)} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function TopHolderRow({ holder, index }) {
  const addr = holder.address;
  const short = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—";
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: "#475569", width: 18 }}>#{holder.rank || index + 1}</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "#94a3b8" }}>{short}</span>
      </div>
      <span style={{ fontFamily: mono, fontSize: 10, color: "#e2e8f0", fontWeight: 600 }}>
        {fNum(holder.amount)}
      </span>
    </div>
  );
}

export default function HolderscanDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAllHolderscanData()
      .then(d => {
        const allNull = !d.deltas && !d.breakdowns && !d.stats && !d.pnl && !d.topHolders;
        if (allNull) setError("All endpoints returned empty — check server-side API key");
        else setData(d);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{
        maxWidth: 1200, margin: "20px auto 0", padding: "20px",
        fontFamily: mono, fontSize: 11, color: "#64748b", textAlign: "center",
      }}>
        Loading holder data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        maxWidth: 1200, margin: "20px auto 0", padding: "12px 16px",
        background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 8, fontFamily: mono, fontSize: 11, color: "#f87171",
      }}>
        Holderscan: {error}
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
    <div style={{ maxWidth: 1200, margin: "24px auto 0" }}>
      <div style={{
        fontFamily: mono, fontSize: 12, color: "#94a3b8", marginBottom: 10,
        letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          background: "linear-gradient(90deg, #6366f1, #3b82f6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Holder Analytics</span>
        <span style={{ fontSize: 9, color: "#475569", fontWeight: 400 }}>powered by Holderscan</span>
      </div>

      {/* Top stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        {totalHolders != null && (
          <StatCard label="Total Holders" value={fNum(totalHolders)} />
        )}
        {pnl?.break_even_price != null && (
          <StatCard label="Break-Even Price" value={fUsd(pnl.break_even_price)} sub="avg holder entry" />
        )}
        {stats?.gini != null && (
          <StatCard label="Gini Index" value={stats.gini.toFixed(3)} sub="0=equal, 1=concentrated" color={stats.gini > 0.95 ? "#f87171" : stats.gini > 0.9 ? "#f59e0b" : "#4ade80"} />
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {/* Holder Changes */}
        {deltas && (
          <div style={{
            padding: "14px 16px", background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
          }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
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
            padding: "14px 16px", background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
          }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Holder Distribution
            </div>
            {Object.entries(breakdowns.categories).reverse().map(([cat, count]) => (
              <CategoryBar key={cat} label={cat} count={count} total={totalHolders} color={categoryColors[cat] || "#94a3b8"} />
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: "#475569", marginBottom: 4 }}>BY VALUE HELD</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                {[
                  [">$10", breakdowns.holders_over_10_usd],
                  [">$100", breakdowns.holders_over_100_usd],
                  [">$1K", breakdowns.holders_over_1000_usd],
                  [">$10K", breakdowns.holders_over_10000_usd],
                  [">$100K", breakdowns.holders_over_100k_usd],
                  [">$1M", breakdowns.holders_over_1m_usd],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10 }}>
                    <span style={{ color: "#94a3b8" }}>{label}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fNum(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Holders */}
        {topHolders && topHolders.length > 0 && (
          <div style={{
            padding: "14px 16px", background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
          }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
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
