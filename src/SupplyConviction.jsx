import { useState, useEffect, useMemo } from "react";
import { fetchSupplyBreakdown } from "./holderscan.js";
import { SUPPLY } from "./data.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;

const fUsd = n => {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};
const fNum = n => {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
};

// holding-duration tiers, longest-held first
const CATS = [
  { key: "diamond", label: "Diamond", c: "#22d3ee", note: "longest held" },
  { key: "gold", label: "Gold", c: "#f59e0b", note: "" },
  { key: "silver", label: "Silver", c: "#cbd5e1", note: "" },
  { key: "bronze", label: "Bronze", c: "#d97706", note: "" },
  { key: "wood", label: "Wood", c: "#7c5e48", note: "newest" },
];

// Pull a numeric value for a category from a loosely-shaped response.
function pick(obj, key) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key) {
      let v = obj[k];
      if (v && typeof v === "object") v = v.amount ?? v.supply ?? v.value ?? v.percentage ?? v.pct ?? null;
      const n = typeof v === "number" ? v : parseFloat(v);
      return isFinite(n) ? n : null;
    }
  }
  return null;
}

function Readout({ label, value, color, sub, isMobile }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#94a3b8", letterSpacing: 1.1 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 26 : 34, fontWeight: 700, color, textShadow: `0 0 20px ${color}44` }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11.5, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function extract(data) {
  // categories may live at the top level or nested under a wrapper
  const candidates = [data, data?.supply_breakdown, data?.breakdown, data?.data, data?.categories];
  for (const src of candidates) {
    const out = {};
    let found = 0;
    for (const { key } of CATS) {
      const v = pick(src, key);
      out[key] = v;
      if (v != null) found++;
    }
    if (found >= 3) return out;
  }
  return null;
}

export default function SupplyConviction({ price, isMobile }) {
  const [raw, setRaw] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    fetchSupplyBreakdown()
      .then(d => { if (!cancelled) { setRaw(d); setStatus("ok"); } })
      .catch(e => { if (!cancelled) setStatus(e.message || "failed"); });
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(() => {
    const vals = raw ? extract(raw) : null;
    if (!vals) return null;
    const total = CATS.reduce((s, { key }) => s + (vals[key] || 0), 0);
    if (total <= 0) return null;
    const share = {};
    CATS.forEach(({ key }) => { share[key] = (vals[key] || 0) / total; });
    const diamondShare = share.diamond;
    const longTermShare = share.diamond + share.gold; // held a long time
    const effFloatFrac = 1 - diamondShare;            // treat diamonds as removed
    return { vals, total, share, diamondShare, longTermShare, effFloatFrac };
  }, [raw]);

  if (status === "loading") return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading supply data…</div>;
  if (status !== "ok") return <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 40 }}>Couldn&apos;t load supply data: {status}</div>;
  if (!model) {
    return (
      <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 40 }}>
        Unexpected response shape. Keys: <span style={{ fontFamily: MONO, color: "#94a3b8" }}>{raw ? Object.keys(raw).join(", ") : "—"}</span>
      </div>
    );
  }

  const { share, diamondShare, longTermShare, effFloatFrac } = model;
  const effFloatTokens = SUPPLY * effFloatFrac;
  const effMc = price * effFloatTokens;
  const nominalMc = price * SUPPLY;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 20 : 48, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 }}>
        <Readout label="DIAMOND SUPPLY" value={(diamondShare * 100).toFixed(1) + "%"} color="#22d3ee" sub="removed from float" isMobile={isMobile} />
        <Readout label="EFFECTIVE FLOAT" value={fNum(effFloatTokens)} color="#cbd5e1" sub={(effFloatFrac * 100).toFixed(0) + "% of supply"} isMobile={isMobile} />
        <Readout label="EFFECTIVE MARKET CAP" value={fUsd(effMc)} color="#4ade80" sub={`vs ${fUsd(nominalMc)} nominal`} isMobile={isMobile} />
      </div>

      {/* Composition bar */}
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", height: 34, borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
          {CATS.map(({ key, c }) => (
            share[key] > 0 ? <div key={key} title={key} style={{ width: `${share[key] * 100}%`, background: c, opacity: 0.85 }} /> : null
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "10px 20px", flexWrap: "wrap", marginTop: 14 }}>
          {CATS.map(({ key, label, c, note }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
              {label} <span style={{ fontFamily: MONO, color: "#94a3b8" }}>{(share[key] * 100).toFixed(1)}%</span>
              {note && <span style={{ color: "#64748b", fontSize: 11.5 }}>· {note}</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "22px auto 0", fontFamily: SANS, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, textAlign: "center" }}>
        Supply grouped by how long it&apos;s been held (Holderscan, FIFO over the top ~1,000 wallets).
        <strong style={{ color: "#22d3ee" }}> Diamond</strong> hands ({(diamondShare * 100).toFixed(1)}%) are treated as
        <em> removed from circulating float</em> — the conviction-based scarcity analog to Bitcoin&apos;s halving, but driven by holders, not emission.
        Long-term (Diamond+Gold) = {(longTermShare * 100).toFixed(1)}%.
      </div>
      <div style={{ maxWidth: 760, margin: "10px auto 0", fontFamily: SANS, fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
        Effective market cap = price × (supply − diamond supply). Snapshot, not financial advice.
      </div>
    </div>
  );
}
