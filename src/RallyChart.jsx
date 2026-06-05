import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot,
} from "recharts";
import { buildRallyCycles } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fMon = d => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function CycleTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value != null);
  if (rows.length === 0) return null;
  return (
    <div style={{
      background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1",
    }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>Day {label} after low</div>
      {rows.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: MONO, fontSize: 12.5 }}>
          {p.name}: +{p.value.toFixed(1)}%
        </div>
      ))}
    </div>
  );
}

function Readout({ label, value, color, isMobile }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 11 : 12, color: "#94a3b8", letterSpacing: 1.2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: isMobile ? 32 : 44, fontWeight: 700, color, textShadow: `0 0 22px ${color}55` }}>{value}</div>
    </div>
  );
}

export default function RallyChart({ series, isMobile }) {
  const cycles = useMemo(() => buildRallyCycles(series, { minDepth: 0.4, minPeakPrice: 0.05, minGain: 0.3 }), [series]);

  const { rows, maxDay, maxPct } = useMemo(() => {
    const dayset = new Set();
    cycles.forEach(c => c.points.forEach(p => dayset.add(p.day)));
    const days = [...dayset].sort((a, b) => a - b);
    const maps = cycles.map(c => {
      const map = new Map();
      c.points.forEach(p => map.set(p.day, p.gain));
      return map;
    });
    const r = days.map(day => {
      const row = { day };
      cycles.forEach((c, i) => {
        row["e" + i] = maps[i].has(day) ? maps[i].get(day) * 100 : null;
      });
      return row;
    });
    const maxD = days.length ? days[days.length - 1] : 0;
    const maxP = cycles.reduce((mx, c) => Math.max(mx, c.maxGain * 100), 0);
    return { rows: r, maxDay: maxD, maxPct: maxP };
  }, [cycles]);

  const colorFor = i => {
    if (cycles[i].ongoing) return "#ffffff";
    const n = cycles.length;
    const hue = 265 - (n > 1 ? i / (n - 1) : 0) * 265; // oldest violet → newest red
    return `hsl(${hue}, 75%, 62%)`;
  };

  const ongoing = cycles.find(c => c.ongoing);
  // Gain from the most recent cycle bottom up to the latest price.
  const currentGain = useMemo(() => {
    if (cycles.length === 0 || !series.length) return 0;
    const last = cycles[cycles.length - 1];
    return series[series.length - 1].price / last.lowPrice - 1;
  }, [cycles, series]);

  if (cycles.length === 0) {
    return (
      <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 13, color: "#64748b", padding: "40px 0", lineHeight: 1.6 }}>
        No completed rally cycles yet — a rally is recorded once price climbs at least 30% off a cycle bottom.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 28 : 56, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Readout label="CURRENT RALLY" value={"+" + (currentGain * 100).toFixed(0) + "%"} color="#4ade80" isMobile={isMobile} />
        {ongoing && <Readout label="PEAK THIS CYCLE" value={"+" + (ongoing.maxGain * 100).toFixed(0) + "%"} color="#22d3ee" isMobile={isMobile} />}
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 380 : 540}>
        <LineChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 28, left: isMobile ? 0 : 12 }}>
          <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" />
          <XAxis
            dataKey="day" type="number" domain={[0, maxDay]}
            tickFormatter={v => v + "d"}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
            label={{ value: "Days since cycle low", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 12, fontFamily: SANS }}
          />
          <YAxis
            domain={[0, Math.ceil(maxPct / 10) * 10]}
            tickFormatter={v => "+" + v + "%"}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58}
          />
          <Tooltip content={<CycleTip />} />
          {cycles.map((c, i) => (
            <Line
              key={i} dataKey={"e" + i} name={fMon(c.startDate) + (c.ongoing ? " (now)" : "")}
              type="monotone" stroke={colorFor(i)} strokeWidth={c.ongoing ? 3 : 2}
              dot={false} connectNulls isAnimationActive={false}
            />
          ))}
          {cycles.map((c, i) => {
            const t = c.points[c.points.length - 1];
            return (
              <ReferenceDot
                key={"dot" + i} x={t.day} y={t.gain * 100} r={4}
                fill={colorFor(i)} stroke="#020208" strokeWidth={1.5} ifOverflow="extendDomain"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", justifyContent: "center", gap: "8px 18px", flexWrap: "wrap", marginTop: 14 }}>
        {cycles.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 12.5, color: c.ongoing ? "#f1f5f9" : "#cbd5e1", fontWeight: c.ongoing ? 700 : 500 }}>
            <span style={{ width: 15, height: 3, background: colorFor(i), borderRadius: 2, display: "inline-block" }} />
            low {fMon(c.startDate)} → peak {fMon(c.peakDate)} · +{(c.maxGain * 100).toFixed(0)}%{c.ongoing ? " (ongoing)" : ""}
          </div>
        ))}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        The mirror of the drawdown chart: each line traces how far price climbed after a cycle bottom, vs. days since that low.
        Use it to compare the size and pace of recoveries across cycles. Not financial advice.
      </div>
    </div>
  );
}
