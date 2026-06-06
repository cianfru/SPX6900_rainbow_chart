import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot,
} from "recharts";
import { buildRallyCycles, buildFireSaleRallies, buildCycleStrategy } from "./models.js";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const fMon = d => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";

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

export default function RallyChart({ series, m, isMobile }) {
  const [anchor, setAnchor] = useState("cycle"); // "cycle" = correction bottoms, "firesale" = Fire Sale band lows
  const cycles = useMemo(
    () => (anchor === "firesale"
      ? buildFireSaleRallies(series, m, { minGain: 0.3 })
      : buildRallyCycles(series, { minDepth: 0.4, minPeakPrice: 0.05, minGain: 0.3 })),
    [series, m, anchor],
  );

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

  const strategy = useMemo(() => buildCycleStrategy(series, cycles), [series, cycles]);

  const ongoing = cycles.find(c => c.ongoing);
  // Gain from the most recent cycle bottom up to the latest price.
  const currentGain = useMemo(() => {
    if (cycles.length === 0 || !series.length) return 0;
    const last = cycles[cycles.length - 1];
    return series[series.length - 1].price / last.lowPrice - 1;
  }, [cycles, series]);

  const anchorToggle = (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
      {[["cycle", "Cycle bottoms"], ["firesale", "Fire Sale band"]].map(([id, label]) => (
        <button key={id} onClick={() => setAnchor(id)} style={{
          fontFamily: SANS, fontSize: isMobile ? 12 : 13, fontWeight: 600, padding: "7px 14px",
          borderRadius: 8, cursor: "pointer", transition: "all 0.18s ease",
          color: anchor === id ? "#020208" : "#cbd5e1",
          background: anchor === id ? "#4ade80" : "rgba(255,255,255,0.05)",
          border: `1px solid ${anchor === id ? "#4ade80" : "rgba(255,255,255,0.12)"}`,
          boxShadow: anchor === id ? "0 0 16px rgba(74,222,128,0.4)" : "none",
        }}>{label}</button>
      ))}
    </div>
  );

  if (cycles.length === 0) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {anchorToggle}
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 13, color: "#64748b", padding: "40px 0", lineHeight: 1.6 }}>
          {anchor === "firesale"
            ? "No Fire Sale rallies yet — price hasn't entered the cheapest band, or hasn't rallied 30%+ from it."
            : "No completed rally cycles yet — a rally is recorded once price climbs at least 30% off a cycle bottom."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {anchorToggle}
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
            label={{ value: anchor === "firesale" ? "Days since Fire Sale low" : "Days since cycle low", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 12, fontFamily: SANS }}
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
        {anchor === "firesale"
          ? "Each line traces how far price climbed after entering the cheapest “Fire Sale” valuation band, vs. days since that low — i.e. how capitulation-band entries have paid off. Not financial advice."
          : "The mirror of the drawdown chart: each line traces how far price climbed after a cycle bottom, vs. days since that low. Use it to compare the size and pace of recoveries across cycles. Not financial advice."}
      </div>

      {strategy && (
        <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8",
            letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 14,
          }}>
            Buy the {anchor === "firesale" ? "Fire Sale" : "dip"}, sell the peak — vs HODL
          </div>

          <div style={{ display: "flex", gap: isMobile ? 24 : 52, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <Readout label="STRATEGY" value={fMult(1 + strategy.stratRet)} color="#4ade80" isMobile={isMobile} />
            <Readout label="HODL" value={fMult(1 + strategy.hodlRet)} color="#94a3b8" isMobile={isMobile} />
            <Readout label="EDGE" value={fMult((1 + strategy.stratRet) / (1 + strategy.hodlRet))} color="#22d3ee" isMobile={isMobile} />
          </div>

          <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
            <LineChart data={strategy.rows} margin={{ top: 8, right: isMobile ? 14 : 30, bottom: 8, left: isMobile ? 0 : 12 }}>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]}
                tickFormatter={ts => fMon(ts)}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 44 : 34}
              />
              <YAxis
                scale="log" domain={["auto", "auto"]} allowDataOverflow
                tickFormatter={v => fMult(v)}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 60}
              />
              <Tooltip
                contentStyle={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(74,222,128,0.4)", borderRadius: 10, fontFamily: SANS }}
                labelFormatter={ts => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                formatter={(v, name) => [fMult(v), name]}
              />
              <Line dataKey="hodl" name="HODL" stroke="#64748b" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="strat" name="Strategy" stroke="#4ade80" strokeWidth={2.4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
            Hindsight strategy with perfect timing (buy each low, sell each peak), compounded from {fMon(strategy.startDate)}, cash between cycles.
            Log scale. Illustrative only — not achievable in real time, and not financial advice.
          </div>
        </div>
      )}
    </div>
  );
}
