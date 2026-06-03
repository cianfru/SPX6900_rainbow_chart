import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { buildDrawdownSeries } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fD = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fPct = v => (v * 100).toFixed(1) + "%";

function DDTip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1",
    }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {new Date(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div>Drawdown: <span style={{ fontFamily: MONO, fontWeight: 700, color: "#f87171" }}>{fPct(d.dd)}</span></div>
      <div>Price: <span style={{ fontFamily: MONO }}>${d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2)}</span></div>
    </div>
  );
}

export default function DrawdownChart({ series, isMobile }) {
  const data = useMemo(() => buildDrawdownSeries(series), [series]);
  const cur = data[data.length - 1];
  const maxDD = useMemo(() => data.reduce((m, d) => Math.min(m, d.dd), 0), [data]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 24 : 56, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>FROM ATH</div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 34 : 46, fontWeight: 700, color: "#f87171", textShadow: "0 0 22px rgba(248,113,113,0.4)" }}>
            {fPct(cur.dd)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>MAX DRAWDOWN</div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 34 : 46, fontWeight: 700, color: "#fbbf24" }}>
            {fPct(maxDD)}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 360 : 520}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 12 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <defs>
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#dc2626" stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={fD} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            minTickGap={isMobile ? 40 : 30}
          />
          <YAxis
            domain={[Math.min(-1, Math.floor(maxDD * 10) / 10), 0]}
            tickFormatter={v => (v * 100).toFixed(0) + "%"}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52}
          />
          <Tooltip content={<DDTip />} />
          <Area dataKey="dd" stroke="#f87171" strokeWidth={2} fill="url(#ddFill)" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
        How far SPX6900 sits below its running all-time high. 0% = new ATH. Big drawdowns have historically been accumulation zones — but past isn&apos;t prophecy.
      </div>
    </div>
  );
}
