import { useState, useEffect } from "react";
import { loadOnchain, loadHistory, loadWhales } from "./history-data.js";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { SUPPLY } from "./data.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

// Holder analytics, entirely from OUR OWN on-chain FIFO reconstruction (public/onchain.json, daily)
// + the whale snapshot (whales.json) + the multi-chain headcount (history.json). This used to proxy
// HolderScan; that subscription is retired, so everything here is now reproducible from data we bank
// ourselves — holder count, realized (break-even) price, gini, concentration, supply in profit, the
// wealth ladder, holding-age bands and the top wallets. ETH-native unless labelled otherwise.

const glassCard = {
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 30px rgba(0,0,0,0.35)",
};

const fNum = n => {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
};
const fUsd = n => {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  if (abs >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
};

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ padding: "16px 20px", borderRadius: 10, ...glassCard }}>
      <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: color || "#f1f5f9", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Bar({ label, count, total, color, note }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{label}{note && <span style={{ color: "#64748b", fontWeight: 400 }}> · {note}</span>}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: "#94a3b8" }}>{fNum(count)} ({pct.toFixed(1)}%)</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function TopHolderRow({ holder, index }) {
  const addr = holder.a;
  const short = addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "—";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: "#64748b", width: 28 }}>#{index + 1}</span>
        <a href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 13, color: "#cbd5e1", textDecoration: "none" }}>{short}</a>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, color: "#f1f5f9", fontWeight: 700 }}>{fNum(holder.bal)}</span>
    </div>
  );
}

const SectionHeader = () => (
  <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: "#cbd5e1", marginBottom: 14, letterSpacing: 1.2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 12 }}>
    <span style={{ background: "linear-gradient(90deg, #6366f1, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Holder Analytics</span>
    <span style={{ fontSize: 12, color: "#475569", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>on-chain · FIFO reconstruction</span>
  </div>
);

const WEALTH = ["< $100", "$100 – $1K", "$1K – $10K", "$10K – $100K", "$100K +"];
const AGE = ["0–1m", "1–3m", "3–6m", "6–12m", "1y+"];
const AGE_C = ["#f87171", "#fb923c", "#fbbf24", "#38bdf8", "#22d3ee"];

export default function HolderscanDashboard() {
  const [oc, setOc] = useState(null);
  const [snap, setSnap] = useState(null);
  const [whales, setWhales] = useState(null);

  useEffect(() => {
    let live = true;
    loadOnchain().then(d => { if (live) setOc((d && d.length ? d : SPX_ONCHAIN).at(-1) ?? null); });
    loadHistory().then(h => { if (live && h?.length) setSnap(h[h.length - 1]); });
    loadWhales().then(w => { if (live && w?.wallets?.length) setWhales(w.wallets); });
    return () => { live = false; };
  }, []);

  if (!oc) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "32px auto 0" }}>
        <SectionHeader />
        <div style={{ padding: 24, fontFamily: SANS, fontSize: 14, color: "#64748b", textAlign: "center" }}>Loading holder data…</div>
      </div>
    );
  }

  const ethH = oc.holders ?? snap?.holders ?? null;
  const totalH = [ethH, snap?.holdersBase, snap?.holdersSol].reduce((s, n) => s + (n || 0), 0) || null;
  const held = oc.heldTokens || 0;
  const dia90 = Array.isArray(oc.age) ? (oc.age[2] + oc.age[3] + oc.age[4]) : null; // held >90d, % of held

  return (
    <div style={{ maxWidth: MAX_W, margin: "40px auto 0" }}>
      <SectionHeader />

      {/* headline stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 12, marginBottom: 16 }}>
        {totalH != null && <StatCard label="Total Holders" value={fNum(totalH)} sub={`ETH ${fNum(ethH)}${snap?.holdersBase ? ` · Base ${fNum(snap.holdersBase)}` : ""}${snap?.holdersSol ? ` · Sol ${fNum(snap.holdersSol)}` : ""}`} />}
        {oc.rp != null && <StatCard label="Realized Price" value={fUsd(oc.rp)} sub="avg on-chain cost basis" />}
        {oc.mvrv != null && <StatCard label="MVRV" value={oc.mvrv.toFixed(2) + "×"} sub={oc.mvrv < 1 ? "holders underwater" : "holders in profit"} color={oc.mvrv < 1 ? "#f87171" : "#4ade80"} />}
        {oc.sip != null && <StatCard label="Supply in Profit" value={oc.sip.toFixed(0) + "%"} sub="held above cost basis" color={oc.sip >= 50 ? "#4ade80" : "#f59e0b"} />}
        {oc.gini != null && <StatCard label="Gini Index" value={oc.gini.toFixed(3)} sub="0 = equal · 1 = concentrated" color={oc.gini > 0.95 ? "#f87171" : "#f59e0b"} />}
        {oc.top100 != null && <StatCard label="Top-100 Share" value={oc.top100.toFixed(1) + "%"} sub={`top-10 ${oc.top10?.toFixed(1)}%`} />}
        {dia90 != null && <StatCard label="Diamond Hands" value={dia90.toFixed(0) + "%"} sub="held 90 days+" color="#22d3ee" />}
        {held > 0 && <StatCard label="Held Supply" value={fNum(held) + " SPX"} sub={`${(held / SUPPLY * 100).toFixed(0)}% of total · self-custody`} />}
      </div>

      {/* detail panels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14 }}>
        {/* wealth ladder */}
        {Array.isArray(oc.wealth) && (
          <div style={{ padding: "20px 22px", borderRadius: 10, ...glassCard }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Wallets by Value Held</div>
            {oc.wealth.map((count, i) => (
              <Bar key={i} label={WEALTH[i]} count={count} total={oc.wealth.reduce((a, b) => a + b, 0)} color={["#6366f1", "#22c55e", "#06b6d4", "#3b82f6", "#f59e0b"][i]} />
            ))}
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 6 }}>Wallet count per USD bracket at today&apos;s price.</div>
          </div>
        )}

        {/* holding age */}
        {Array.isArray(oc.age) && (
          <div style={{ padding: "20px 22px", borderRadius: 10, ...glassCard }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Supply by Holding Age</div>
            {oc.age.map((pct, i) => (
              <Bar key={i} label={AGE[i]} count={(pct / 100) * held} total={held} color={AGE_C[i]} note={`${pct.toFixed(1)}%`} />
            ))}
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 6 }}>Share of held supply by time since it last moved (HODL waves).</div>
          </div>
        )}

        {/* top wallets */}
        {whales && (
          <div style={{ padding: "20px 22px", borderRadius: 10, ...glassCard }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Top 10 Wallets · SPX held</div>
            {whales.slice(0, 10).map((h, i) => <TopHolderRow key={h.a || i} holder={h} index={i} />)}
            <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 8 }}>Largest self-custody holders — exchanges, LP and the bridge excluded.</div>
          </div>
        )}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 18 }}>
        On-chain, ETH-native, reconstructed daily (FIFO). Concentration and holder counts exclude tagged CEX/LP/bridge addresses. Not financial advice.
      </div>
    </div>
  );
}
