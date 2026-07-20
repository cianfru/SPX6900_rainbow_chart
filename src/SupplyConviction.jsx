import { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fetchSupplyBreakdown } from "./holderscan.js";
import { SUPPLY } from "./data.js";
import { loadHistory, loadOnchain, LIVE_DATA_DOWN } from "./history-data.js";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";


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
    loadHistory().then(d => { if (!cancelled) setHistory(d); });
    return () => { cancelled = true; };
  }, []);

  // FIFO on-chain reconstruction (launch → last extract) — carries the SAME diamond number
  // (held >90d = age bands 3-6m + 6-12m + 1y+) back to launch, reconciling with HolderScan
  // to within ±0.7pp. Back-fills the pre-HolderScan history so the trend shows the full
  // 0%→~87% maturation, while HolderScan's own daily points drive everything since ~2026-06.
  const [onchain, setOnchain] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled) setOnchain(d || SPX_ONCHAIN); });
    return () => { cancelled = true; };
  }, []);

  const hist = useMemo(() => {
    if (!history) return [];
    const hs = [];
    for (const rec of history) {
      const ps = parseSupply(rec.sup);
      if (!ps) continue;
      hs.push({ ts: new Date(rec.d).getTime(), date: rec.d, diamond: ps.diamondShareClassified * 100 });
    }
    hs.sort((a, b) => a.ts - b.ts);
    if (!hs.length) return hs;
    const seamTs = hs[0].ts;
    const backbone = (onchain || [])
      .filter(r => Array.isArray(r.age) && r.age.length === 5)
      .map(r => ({ ts: new Date(r.d).getTime(), date: r.d, diamond: r.age[2] + r.age[3] + r.age[4] }))
      .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.diamond) && r.ts < seamTs)
      .sort((a, b) => a.ts - b.ts);
    return [...backbone, ...hs];
  }, [history, onchain]);

  // Live breakdown, or — when the live proxy is down — the newest banked daily
  // snapshot from history.json (same fields, at most a day old).
  const lastSnap = useMemo(() => {
    if (!history) return null;
    for (let i = history.length - 1; i >= 0; i--) if (history[i]?.sup) return history[i];
    return null;
  }, [history]);
  const liveDown = status !== "ok" && status !== "loading";

  const model = useMemo(() => {
    const live = raw ? parseSupply(raw) : null;
    const ps = live || (lastSnap ? parseSupply(lastSnap.sup) : null);
    if (!ps) return null;
    const fromSnapshot = !live;
    // Everything on the HolderScan basis: shares of the TRACKED holders (the top
    // ~1,000 wallets HolderScan classifies by holding age — exchanges & LP pools
    // excluded). So the five tiers sum to 100% and diamond reads ~87%.
    const shareOfClassified = {};
    CATS.forEach(({ key }) => { shareOfClassified[key] = ps.classified > 0 ? ps.tokens[key] / ps.classified : 0; });
    return {
      shareOfClassified,
      diamondPctClassified: ps.diamondShareClassified, // ~87% (HolderScan basis)
      diamondTokens: ps.diamondTokens,
      classifiedTokens: ps.classified,
      fromSnapshot,
    };
  }, [raw, lastSnap]);
  const usingSnapshot = !!model?.fromSnapshot;

  // Diamond % barely moves day to day, so an "auto" domain + whole-number ticks
  // collapses every label to "87%". Pad the domain around the real min/max and
  // pick enough decimals that adjacent ticks read as distinct values.
  const yAxis = useMemo(() => {
    if (hist.length < 2) return { domain: ["auto", "auto"], fmt: v => v.toFixed(1) + "%" };
    const vals = hist.map(h => h.diamond);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = hi - lo;
    const pad = Math.max(range * 0.25, 0.05); // floor keeps a flat series from looking like a line on the axis
    const span = range + pad * 2;
    const decimals = span >= 8 ? 0 : span >= 0.8 ? 1 : 2;
    return {
      domain: [lo - pad, hi + pad],
      fmt: v => v.toFixed(decimals) + "%",
    };
  }, [hist]);

  // While live is loading — or live failed and we're still waiting to learn
  // whether a banked snapshot can stand in — keep showing the loader.
  if (status === "loading" || (liveDown && history === null)) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading supply data…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 40 }}>{LIVE_DATA_DOWN}</div>;

  const { shareOfClassified, diamondPctClassified, diamondTokens } = model;
  const diamondPct = diamondPctClassified * 100;
  const diamondValue = price * diamondTokens;
  const segments = CATS.map(({ key, c }) => ({ c, pct: shareOfClassified[key] * 100 })).filter(s => s.pct > 0);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {usingSnapshot && (
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#fbbf24", marginBottom: 16 }}>
          Live holder feed unavailable — showing the last daily snapshot ({lastSnap.d}).
        </div>
      )}
      <div style={{ display: "flex", gap: isMobile ? 18 : 40, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <Readout label="DIAMOND HANDS" value={diamondPct.toFixed(0) + "%"} color="#22d3ee" sub="of tracked holders · held 90 days+" isMobile={isMobile} />
        <Readout label="DIAMOND SUPPLY" value={fNum(diamondTokens) + " SPX"} color="#cbd5e1" sub={fUsd(diamondValue)} isMobile={isMobile} />
        <Readout label="TRACKING BASIS" value="~1,000" color="#4ade80" sub="top wallets · CEX & LP excluded" isMobile={isMobile} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <Donut segments={segments} size={isMobile ? 200 : 240}
          centerTop={diamondPct.toFixed(0) + "%"} centerBottom="diamond hands" />
      </div>

      {/* tier legend (share of tracked holders) */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px 20px", flexWrap: "wrap", marginTop: 22 }}>
        {CATS.map(({ key, label, c, note }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
            {label} <span style={{ fontFamily: MONO, color: "#94a3b8" }}>{(shareOfClassified[key] * 100).toFixed(1)}%</span>
            {note && <span style={{ color: "#64748b", fontSize: 11.5 }}>· {note}</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 800, margin: "22px auto 0", fontFamily: SANS, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, textAlign: "center" }}>
        The real holder base grouped by how long it&apos;s been held (HolderScan tracks the top ~1,000 wallets by holding age — exchanges and LP pools excluded).
        <strong style={{ color: "#22d3ee" }}> {diamondPct.toFixed(0)}% of tracked holders</strong> are diamond hands — they&apos;ve held for over 90 days ({fNum(diamondTokens)} SPX · {fUsd(diamondValue)}).
        The chart below shows the share climbing as more wallets cross the 90-day line. Snapshot, not financial advice.
      </div>

      {/* Diamond-supply history (grows as daily snapshots accumulate) */}
      <div style={{ maxWidth: 980, margin: "34px auto 0" }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#cbd5e1", letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
          Diamond hands over time · share of tracked holders
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
              <YAxis tickFormatter={yAxis.fmt} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 52} domain={yAxis.domain} allowDecimals />
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
