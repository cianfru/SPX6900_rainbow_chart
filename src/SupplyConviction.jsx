import { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SUPPLY } from "./data.js";
import { loadOnchain } from "./history-data.js";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { SANS, MONO, MAX_W } from "./chart-ui.jsx";

// Holder conviction, the held supply split by HOLDING AGE, entirely from our own FIFO on-chain
// reconstruction (public/onchain.json, daily). This used to read HolderScan's proprietary
// wood→diamond tiers (top ~1,000 wallets); HolderScan is retired, so the five tiers are now the five
// HODL age bands, and "diamond hands" = held >90 days = 3-6m + 6-12m + 1y+ (the reproducible number,
// ~61% of total supply). Exchanges, LP and the bridge are excluded upstream, so it's real holders.

const fUsd = n => {
  if (n == null || !isFinite(n)) return "-";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};
const fNum = n => {
  if (n == null || !isFinite(n)) return "-";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
};

// Ordered longest-held → newest (matches the donut + legend). Each maps to a HODL age band index.
const CATS = [
  { key: "diamond", ageIdx: 4, label: "Diamond", c: "#22d3ee", note: "1y+" },
  { key: "gold", ageIdx: 3, label: "Gold", c: "#f59e0b", note: "6-12m" },
  { key: "silver", ageIdx: 2, label: "Silver", c: "#cbd5e1", note: "3-6m" },
  { key: "bronze", ageIdx: 1, label: "Bronze", c: "#d97706", note: "1-3m" },
  { key: "wood", ageIdx: 0, label: "Wood", c: "#7c5e48", note: "0-1m" },
];

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
  const [onchain, setOnchain] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled) setOnchain(d || SPX_ONCHAIN); });
    return () => { cancelled = true; };
  }, []);

  const src = onchain || SPX_ONCHAIN;

  // >90d diamond share of held supply over the full history (age bands 3-6m + 6-12m + 1y+).
  const hist = useMemo(() => src
    .filter(r => Array.isArray(r.age) && r.age.length === 5)
    .map(r => ({ ts: new Date(r.d).getTime(), date: r.d, diamond: r.age[2] + r.age[3] + r.age[4] }))
    .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.diamond))
    .sort((a, b) => a.ts - b.ts), [src]);

  // Latest snapshot: the five age bands as shares of held supply + the >90d diamond number.
  const model = useMemo(() => {
    const last = src.filter(r => Array.isArray(r.age) && r.age.length === 5 && r.heldTokens > 0).at(-1);
    if (!last) return null;
    const held = last.heldTokens;
    const shareOfHeld = {};
    CATS.forEach(({ key, ageIdx }) => { shareOfHeld[key] = (last.age[ageIdx] || 0) / 100; });
    const dia90 = (last.age[2] + last.age[3] + last.age[4]) / 100; // held >90d, share of held
    return { shareOfHeld, dia90Pct: dia90, diamondTokens: dia90 * held, heldTokens: held, snapDate: last.d };
  }, [src]);

  const yAxis = useMemo(() => {
    if (hist.length < 2) return { domain: ["auto", "auto"], fmt: v => v.toFixed(1) + "%" };
    const vals = hist.map(h => h.diamond);
    const lo = Math.min(...vals), hi = Math.max(...vals), range = hi - lo;
    const pad = Math.max(range * 0.1, 0.5);
    const span = range + pad * 2;
    const decimals = span >= 8 ? 0 : span >= 0.8 ? 1 : 2;
    return { domain: [Math.max(0, lo - pad), hi + pad], fmt: v => v.toFixed(decimals) + "%" };
  }, [hist]);

  if (!onchain && !SPX_ONCHAIN.length) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading supply data…</div>;
  if (!model) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>On-chain data is being rebuilt, check back after the next refresh.</div>;

  const { shareOfHeld, dia90Pct, diamondTokens } = model;
  const diamondPct = dia90Pct * 100;
  const diamondValue = price * diamondTokens;
  const diamondOfTotal = (diamondTokens / SUPPLY) * 100;
  const segments = CATS.map(({ key, c }) => ({ c, pct: shareOfHeld[key] * 100 })).filter(s => s.pct > 0);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 18 : 40, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
        <Readout label="DIAMOND HANDS" value={diamondPct.toFixed(0) + "%"} color="#22d3ee" sub="of held supply · held 90 days+" isMobile={isMobile} />
        <Readout label="DIAMOND SUPPLY" value={fNum(diamondTokens) + " SPX"} color="#cbd5e1" sub={`${fUsd(diamondValue)} · ${diamondOfTotal.toFixed(0)}% of total`} isMobile={isMobile} />
        <Readout label="BASIS" value="on-chain" color="#4ade80" sub="FIFO · CEX, LP & bridge excluded" isMobile={isMobile} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <Donut segments={segments} size={isMobile ? 200 : 240}
          centerTop={diamondPct.toFixed(0) + "%"} centerBottom="diamond hands" />
      </div>

      {/* tier legend (share of held supply, by holding age) */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px 20px", flexWrap: "wrap", marginTop: 22 }}>
        {CATS.map(({ key, label, c, note }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
            {label} <span style={{ fontFamily: MONO, color: "#94a3b8" }}>{(shareOfHeld[key] * 100).toFixed(1)}%</span>
            {note && <span style={{ color: "#64748b", fontSize: 11.5 }}>· {note}</span>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 800, margin: "22px auto 0", fontFamily: SANS, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, textAlign: "center" }}>
        The real holder base grouped by how long each coin has been held, reconstructed on-chain (FIFO), exchanges and LP pools excluded.
        <strong style={{ color: "#22d3ee" }}> {diamondPct.toFixed(0)}% of held supply</strong> are diamond hands, held for over 90 days ({fNum(diamondTokens)} SPX · {fUsd(diamondValue)}, {diamondOfTotal.toFixed(0)}% of all supply).
        The chart below shows the share climbing as more supply crosses the 90-day line. Not financial advice.
      </div>

      {/* Diamond-supply history (full FIFO reconstruction, launch → today) */}
      <div style={{ maxWidth: 980, margin: "34px auto 0" }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#cbd5e1", letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>
          Diamond hands over time · share of held supply
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
                tickFormatter={ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30} />
              <YAxis tickFormatter={yAxis.fmt} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 52} domain={yAxis.domain} allowDecimals />
              <Tooltip
                contentStyle={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 10, fontFamily: SANS }}
                labelFormatter={ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                formatter={v => [v.toFixed(1) + "%", "Held 90d+"]} />
              <Area dataKey="diamond" stroke="#22d3ee" strokeWidth={2.2} fill="url(#diaFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 13, color: "#64748b", padding: "24px 0", lineHeight: 1.6 }}>
            The time-series will appear here once the on-chain reconstruction has data.
          </div>
        )}
      </div>
    </div>
  );
}
