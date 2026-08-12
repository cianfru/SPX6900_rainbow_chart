import { useMemo, useState, useEffect } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { AEON_ONCHAIN } from "./aeon-onchain.js";
import { loadAeon } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, Explain } from "./chart-ui.jsx";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div><span style={{ color: "#fbbf24" }}>Top 50</span>: <span style={{ fontFamily: MONO }}>{d.top50.toFixed(1)}%</span></div>
      <div><span style={{ color: "#fb7185" }}>Top 10</span>: <span style={{ fontFamily: MONO }}>{d.top10.toFixed(1)}%</span></div>
    </TipBox>
  );
}

// Project Aeon, concentration: the top-10 / top-50 owners' share of the 3,333 supply.
export default function AeonConcentrationChart({ isMobile }) {
  const [data, setData] = useState(AEON_ONCHAIN);
  useEffect(() => { let c = false; loadAeon().then(d => { if (!c && d) setData(d); }); return () => { c = true; }; }, []);
  const all = useMemo(() => (data.series || [])
    .filter(r => r.owners > 0 && Number.isFinite(r.top10))
    .map(r => ({ ts: Date.parse(r.d), top10: r.top10, top50: r.top50 }))
    .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts), [data]);
  if (all.length < 2) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = all.at(-1);
  const ymax = Math.min(100, Math.max(...all.map(r => r.top50)) * 1.2);
  const step = Math.max(1, Math.round(all.length / 6));
  const xTicks = all.filter((_, i) => i % step === 0 || i === all.length - 1).map(r => r.ts);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is the collection whale-captured or spread out?" accent="#fbbf24">
        The share of the 3,333 supply held by the <strong style={{ color: "#fb7185" }}>10 largest</strong> and <strong style={{ color: "#fbbf24" }}>50 largest</strong> wallets, over time.
        Lower = more distributed. Today the top 10 hold <strong style={{ color: "#fb7185" }}>{cur.top10.toFixed(0)}%</strong>, the top 50 <strong style={{ color: "#fbbf24" }}>{cur.top50.toFixed(0)}%</strong>.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="top 10 wallets" value={cur.top10.toFixed(1) + "%"} color="#fb7185" />
        <Metric label="top 50 wallets" value={cur.top50.toFixed(1) + "%"} color="#fbbf24" />
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
        <AreaChart data={all} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}>
          <defs>
            <linearGradient id="aeonC50" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} /><stop offset="100%" stopColor="#fbbf24" stopOpacity={0.04} /></linearGradient>
            <linearGradient id="aeonC10" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb7185" stopOpacity={0.4} /><stop offset="100%" stopColor="#fb7185" stopOpacity={0.05} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} ticks={xTicks} scale="time"
            tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
          <YAxis type="number" domain={[0, ymax]} tickFormatter={v => v.toFixed(0) + "%"}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
          <Area type="monotone" dataKey="top50" stroke="#fbbf24" strokeWidth={1.5} fill="url(#aeonC50)" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="top10" stroke="#fb7185" strokeWidth={1.5} fill="url(#aeonC10)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#fbbf24" }}>Concentration</strong>, the largest wallets' share of the collection over time. Reconstructed on-chain from every transfer.
      </div>
    </div>
  );
}
