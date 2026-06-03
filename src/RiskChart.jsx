import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { buildRiskSeries, BAND_LABELS } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fD = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function RiskTip({ active, payload }) {
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
      <div>Risk: <span style={{ fontFamily: MONO, fontWeight: 700, color: "#f8fafc" }}>{d.risk.toFixed(3)}</span></div>
      <div>Price: <span style={{ fontFamily: MONO }}>${d.price < 1 ? d.price.toFixed(4) : d.price.toFixed(2)}</span></div>
    </div>
  );
}

export default function RiskChart({ series, m, isMobile }) {
  const data = useMemo(() => buildRiskSeries(m, series), [m, series]);
  const cur = data[data.length - 1];
  const zoneIdx = Math.min(8, Math.max(0, Math.floor(cur.risk * 9)));
  const zoneColor = BAND_LABELS[zoneIdx].c;
  const riskLabel = cur.risk < 0.33 ? "LOW RISK" : cur.risk < 0.66 ? "MEDIUM RISK" : "HIGH RISK";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{
          fontFamily: MONO, fontSize: isMobile ? 42 : 58, fontWeight: 700, lineHeight: 1,
          color: zoneColor, textShadow: `0 0 24px ${zoneColor}66`,
        }}>
          {cur.risk.toFixed(2)}
        </span>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>CURRENT RISK</div>
          <div style={{ fontFamily: SANS, fontSize: isMobile ? 16 : 20, fontWeight: 800, color: zoneColor }}>{riskLabel}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 560}>
        <ComposedChart data={data} margin={{ top: 10, right: isMobile ? 12 : 30, bottom: 24, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={fD} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            minTickGap={isMobile ? 40 : 30}
          />
          <YAxis
            domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 32 : 44}
          />
          {BAND_LABELS.map((b, i) => (
            <ReferenceArea key={i} y1={i / 9} y2={(i + 1) / 9} fill={b.c} fillOpacity={0.16} stroke="none" />
          ))}
          <Tooltip content={<RiskTip />} />
          <Line dataKey="risk" stroke="#ffffff" strokeWidth={2.2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
        Risk = how stretched price is above (red) or below (blue) the model, normalized 0–1 over SPX6900&apos;s history.
        Lower is historically cheaper. Not financial advice.
      </div>
    </div>
  );
}
