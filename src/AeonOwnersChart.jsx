import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const TIERS = [
  { key: "one", label: "1 token", c: "#2dd4bf" },
  { key: "small", label: "2–5", c: "#3b82f6" },
  { key: "mid", label: "6–10", c: "#a855f7" },
  { key: "whale", label: "11+", c: "#fb7185" },
];
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div style={{ marginBottom: 4 }}><span style={{ color: "#e2e8f0" }}>{d.owners} owners</span></div>
      {TIERS.slice().reverse().map(t => (
        <div key={t.key}><span style={{ color: t.c }}>{t.label}</span>: <span style={{ fontFamily: MONO }}>{d[t.key]}</span></div>
      ))}
    </TipBox>
  );
}

// Project Aeon, Owners over time, stacked by how many tokens each wallet holds.
export default function AeonOwnersChart({ isMobile }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const all = useMemo(() => (data.series || [])
    .filter(r => r.dist && r.owners > 0)
    .map(r => ({ ts: Date.parse(r.d), owners: r.owners, one: r.dist.one, small: r.dist.small, mid: r.dist.mid, whale: r.dist.whale }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts), [data]);
  if (all.length < 2) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = all.at(-1);
  const step = Math.max(1, Math.round(all.length / 6));
  const xTicks = all.filter((_, i) => i % step === 0 || i === all.length - 1).map(r => r.ts);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How has the holder base grown, and who holds?" accent="#2dd4bf">
        Distinct owners since the mint, split by <strong style={{ color: "#e2e8f0" }}>how many AEON each wallet holds</strong>.
        The base broadened into <strong style={{ color: "#2dd4bf" }}>{cur.one} single-token collectors</strong>, with a small tail of <strong style={{ color: "#fb7185" }}>{cur.whale} whales</strong> (11+).
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="total owners" value={cur.owners.toLocaleString()} color="#2dd4bf" />
        <Metric label="hold a single AEON" value={cur.one.toLocaleString()} color="#3b82f6" sub={`${(cur.one / cur.owners * 100).toFixed(0)}% of owners`} />
        <Metric label="whales (11+)" value={cur.whale} color="#fb7185" />
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <AreaChart data={all} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          {TIERS.map(t => (
            <Area key={t.key} type="monotone" dataKey={t.key} stackId="1" stroke={t.c} strokeWidth={0.5}
              fill={t.c} fillOpacity={0.85} dot={false} isAnimationActive={false} name={t.label} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#2dd4bf" }}>Owners over time</strong>, distinct current holders, banded by tokens held. Reconstructed on-chain from every transfer.
      </div>
    </div>
  );
}
