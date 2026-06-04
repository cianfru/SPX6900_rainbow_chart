import { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
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

const CATS = [
  { key: "diamond", label: "Diamond", c: "#22d3ee", note: "longest held" },
  { key: "gold", label: "Gold", c: "#f59e0b", note: "" },
  { key: "silver", label: "Silver", c: "#cbd5e1", note: "" },
  { key: "bronze", label: "Bronze", c: "#d97706", note: "" },
  { key: "wood", label: "Wood", c: "#7c5e48", note: "newest" },
];

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

function extract(data) {
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

// Convert the raw breakdown into token amounts (handles amounts / fractions / percentages),
// expressed against TOTAL supply. The five tiers cover only the top ~1,000 wallets, so the
// remainder is an "unclassified" tail of smaller holders.
function parseSupply(raw) {
  const vals = extract(raw);
  if (!vals) return null;
  const sum5 = CATS.reduce((s, { key }) => s + (vals[key] || 0), 0);
  if (sum5 <= 0) return null;
  const scale = sum5 <= 1.5 ? SUPPLY : sum5 <= 150 ? SUPPLY / 100 : 1;
  const tokens = {};
  CATS.forEach(({ key }) => { tokens[key] = (vals[key] || 0) * scale; });
  const classified = CATS.reduce((s, { key }) => s + tokens[key], 0);
  const unclassified = Math.max(0, SUPPLY - classified);
  return {
    tokens, classified, unclassified, diamondTokens: tokens.diamond,
    diamondShareSupply: tokens.diamond / SUPPLY,           // of total supply (~61%)
    diamondShareClassified: tokens.diamond / classified,   // of age-classified supply (~86%, matches Holderscan)
  };
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

// CSS conic-gradient donut with a transparent hole + centered label.
function Donut({ segments, size, centerTop, centerBottom }) {
  let acc = 0;
  const parts = [];
  for (let i = 0; i < segments.length; i++) {
    const from = acc;
    acc += segments[i].pct;
    parts.push(`${segments[i].c} ${from}% ${acc}%`);
  }
  const stops = parts.join(", ");
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `conic-gradient(${stops})`,
        WebkitMask: "radial-gradient(circle, transparent 56%, #000 57%)",
        mask: "radial-gradient(circle, transparent 56%, #000 57%)",
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: size * 0.18, fontWeight: 700, color: "#22d3ee", lineHeight: 1 }}>{centerTop}</div>
        <div style={{ fontFamily: SANS, fontSize: size * 0.07, color: "#94a3b8", marginTop: 4 }}>{centerBottom}</div>
      </div>
    </div>
  );
}

function McBar({ label, value, max, color }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "#cbd5e1" }}>{label}</span>
        <span style={{ fontFamily: MONO, color: "#f1f5f9", fontWeight: 700 }}>{fUsd(value)}</span>
      </div>
      <div style={{ height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 6, boxShadow: `0 0 12px ${color}66` }} />
      </div>
    </div>
  );
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

  const [history, setHistory] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/history.json")
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setHistory(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, []);

  const hist = useMemo(() => {
    if (!history) return [];
    const rows = [];
    for (const rec of history) {
      const ps = parseSupply(rec.sup);
      if (!ps) continue;
      rows.push({
        ts: new Date(rec.d).getTime(), date: rec.d,
        diamond: ps.diamondShareClassified * 100,
        effMc: (rec.p || 0) * (SUPPLY - ps.diamondTokens),
      });
    }
    return rows;
  }, [history]);

  const model = useMemo(() => {
    const ps = raw ? parseSupply(raw) : null;
    if (!ps) return null;
    const shareC = {};
    CATS.forEach(({ key }) => { shareC[key] = ps.tokens[key] / ps.classified; });
    return {
      shareC,
      diamondShare: ps.diamondShareClassified,      // matches Holderscan (86%)
      diamondPctTotal: ps.diamondShareSupply,        // of total supply (~61%)
      longTermShare: (ps.tokens.diamond + ps.tokens.gold) / ps.classified,
      classifiedPctTotal: ps.classified / SUPPLY,
      diamondTokens: ps.diamondTokens,
    };
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

  const { shareC, diamondShare, diamondPctTotal, longTermShare, classifiedPctTotal, diamondTokens } = model;
  const diamondValue = price * diamondTokens;
  const effFloatTokens = SUPPLY - diamondTokens;
  const effMc = price * effFloatTokens;
  const nominalMc = price * SUPPLY;
  const segments = CATS.map(({ key, c }) => ({ c, pct: shareC[key] * 100 })).filter(s => s.pct > 0);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 18 : 40, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <Readout label="DIAMOND SUPPLY" value={(diamondShare * 100).toFixed(0) + "%"} color="#22d3ee" sub={`${fUsd(diamondValue)} · held longest`} isMobile={isMobile} />
        <Readout label="EFFECTIVE FLOAT" value={fNum(effFloatTokens) + " SPX"} color="#cbd5e1" sub="supply − diamond" isMobile={isMobile} />
        <Readout label="EFFECTIVE MARKET CAP" value={fUsd(effMc)} color="#4ade80" sub={`vs ${fUsd(nominalMc)} nominal`} isMobile={isMobile} />
      </div>

      <div style={{ display: "flex", gap: isMobile ? 24 : 56, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <Donut segments={segments} size={isMobile ? 188 : 220}
          centerTop={(diamondShare * 100).toFixed(1) + "%"} centerBottom="diamond" />
        <div style={{ width: isMobile ? "100%" : 360, maxWidth: 420 }}>
          <McBar label="Effective market cap" value={effMc} max={nominalMc} color="#4ade80" />
          <McBar label="Nominal market cap" value={nominalMc} max={nominalMc} color="#64748b" />
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
            If diamond hands never sell, the tradeable valuation is the green bar — a {((1 - effMc / nominalMc) * 100).toFixed(0)}% &ldquo;scarcity discount&rdquo; to nominal.
          </div>
        </div>
      </div>

      {/* tier legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px 20px", flexWrap: "wrap", marginTop: 22 }}>
        {CATS.map(({ key, label, c, note }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
            {label} <span style={{ fontFamily: MONO, color: "#94a3b8" }}>{(shareC[key] * 100).toFixed(1)}%</span>
            {note && <span style={{ color: "#64748b", fontSize: 11.5 }}>· {note}</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 780, margin: "22px auto 0", fontFamily: SANS, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, textAlign: "center" }}>
        Supply grouped by holding time (Holderscan, FIFO).
        <strong style={{ color: "#22d3ee" }}> Diamond {(diamondShare * 100).toFixed(0)}%</strong> ({fUsd(diamondValue)}) — share of the
        age-classified supply (top ~{(classifiedPctTotal * 100).toFixed(0)}% of total), matching Holderscan. Long-term (Diamond+Gold) = {(longTermShare * 100).toFixed(0)}%.
        Treating diamonds as <em>removed from float</em> ({(diamondPctTotal * 100).toFixed(0)}% of total supply) leaves an effective
        float of {fNum(effFloatTokens)} SPX → {fUsd(effMc)} effective cap. Snapshot, not financial advice.
      </div>

      {/* Diamond-supply history (grows as daily snapshots accumulate) */}
      <div style={{ maxWidth: 980, margin: "34px auto 0" }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#cbd5e1", letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
          Diamond supply over time
        </div>
        {hist.length >= 2 ? (
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
            <AreaChart data={hist} margin={{ top: 8, right: isMobile ? 10 : 24, bottom: 18, left: isMobile ? 0 : 8 }}>
              <defs>
                <linearGradient id="diaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                tickFormatter={ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30} />
              <YAxis tickFormatter={v => v.toFixed(0) + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 38 : 46} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 10, fontFamily: SANS }}
                labelFormatter={ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                formatter={v => [v.toFixed(1) + "%", "Diamond"]} />
              <Area dataKey="diamond" stroke="#22d3ee" strokeWidth={2.2} fill="url(#diaFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 13, color: "#64748b", padding: "24px 0", lineHeight: 1.6 }}>
            Tracking has started — a daily snapshot is recorded automatically.
            The time-series will appear here once a couple of days have accumulated.
          </div>
        )}
      </div>
    </div>
  );
}
