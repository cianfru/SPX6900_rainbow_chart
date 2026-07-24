import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const BANDS = [
  { key: "a0", label: "0–1m", c: "#f87171" },
  { key: "a1", label: "1–3m", c: "#fb923c" },
  { key: "a2", label: "3–6m", c: "#fbbf24" },
  { key: "a3", label: "6–12m", c: "#38bdf8" },
  { key: "a4", label: "1y+", c: "#818cf8" },
];
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {BANDS.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{d[b.key].toFixed(1)}%</span></div>
      ))}
    </TipBox>
  );
}

// Project Aeon — Holder Age / HODL waves. Each of the 3,333 tokens coloured by how long
// since it last changed hands. Warm (fresh) at the bottom, cool (long-held) on top.
export default function AeonHodlChart({ isMobile }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const all = useMemo(() => (data.series || [])
    .filter(r => Array.isArray(r.age) && r.age.length === 5 && r.owners > 0)
    .map(r => ({ ts: Date.parse(r.d), a0: r.age[0], a1: r.age[1], a2: r.age[2], a3: r.age[3], a4: r.age[4] }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts), [data]);
  if (all.length < 2) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = all.at(-1);
  const step = Math.max(1, Math.round(all.length / 6));
  const xTicks = all.filter((_, i) => i % step === 0 || i === all.length - 1).map(r => r.ts);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How long has each AEON been sitting with its owner?" accent={BANDS[4].c}>
        Every token coloured by <strong style={{ color: "#e2e8f0" }}>time since it last changed hands</strong> — warm (bottom) = freshly traded, cool (top) = held over a year.
        The collection started <strong style={{ color: "#f87171" }}>all fresh</strong> at the Nov-2023 mint and has matured: <strong style={{ color: "#818cf8" }}>{cur.a4.toFixed(0)}% now sits in the 1-year+ tier</strong>.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="held 1 year+" value={cur.a4.toFixed(1) + "%"} color={BANDS[4].c} sub="long-held" />
        <Metric label="held under 1 month" value={cur.a0.toFixed(1) + "%"} color={BANDS[0].c} sub="freshly traded" />
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
        <AreaChart data={all} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => v + "%"}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          {BANDS.map(b => (
            <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
              fill={b.c} fillOpacity={0.82} dot={false} isAnimationActive={false} name={b.label} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: BANDS[4].c }}>Holder age</strong> — the {data.supply?.toLocaleString?.() || "3,333"} AEON split by how long each has been held. Reconstructed on-chain from the transfer log. A holding-behaviour read, not a signal.
      </div>
    </div>
  );
}
