import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot,
} from "recharts";
import { buildRallyCycles, buildFireSaleRallies, buildCycleStrategy } from "./models.js";
import { SANS, MONO, MAX_W, TipBox, ViewTabs } from "./chart-ui.jsx";

const fMon = d => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMult = x => (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1)) + "×";

function CycleTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value != null);
  if (rows.length === 0) return null;
  return (
    <TipBox title={<>Day {label} after low</>} style={{ padding: "10px 14px" }}>
      {rows.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: MONO, fontSize: 12.5 }}>
          {p.name}: {fMult(p.value)} <span style={{ color: "#94a3b8" }}>(+{Math.round((p.value - 1) * 100).toLocaleString()}%)</span>
        </div>
      ))}
    </TipBox>
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

export default function RallyChart({ series, m, isMobile, initialView }) {
  const [anchor, setAnchor] = useState(() => ["cycle", "firesale"].includes(initialView) ? initialView : "cycle"); // "cycle" = correction bottoms, "firesale" = Fire Sale band lows
  const cycles = useMemo(
    () => (anchor === "firesale"
      ? buildFireSaleRallies(series, m, { minGain: 0.3 })
      // Only MAJOR corrections (60%+) start a new cycle, so long climbs aren't
      // chopped into many short truncated rallies; a tiny minPeakPrice keeps the
      // launch-era cycles (2024) that a 5¢ floor was silently dropping.
      : buildRallyCycles(series, { minDepth: 0.6, minPeakPrice: 0.001, minGain: 0.3 })),
    [series, m, anchor],
  );

  const { rows, maxDay, maxMult } = useMemo(() => {
    const dayset = new Set();
    cycles.forEach(c => c.points.forEach(p => dayset.add(p.day)));
    const days = [...dayset].sort((a, b) => a - b);
    const maps = cycles.map(c => {
      const map = new Map();
      c.points.forEach(p => map.set(p.day, p.gain));
      return map;
    });
    // Plot the MULTIPLE from the low (1 + gain), so the launch cycle's ~163× and
    // the current ~1.8× are comparable on a LOG axis (a % axis can't show 0% at
    // day 0, and a linear one buries the small cycles under the launch mega-runs).
    const r = days.map(day => {
      const row = { day };
      cycles.forEach((c, i) => {
        row["e" + i] = maps[i].has(day) ? maps[i].get(day) + 1 : null;
      });
      return row;
    });
    const maxD = days.length ? days[days.length - 1] : 0;
    const maxM = cycles.reduce((mx, c) => Math.max(mx, c.maxGain + 1), 1);
    return { rows: r, maxDay: maxD, maxMult: maxM };
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
    <ViewTabs tabs={[["cycle", "Cycle bottoms"], ["firesale", "Fire Sale band"]]} value={anchor} onChange={setAnchor} />
  );

  if (cycles.length === 0) {
    return (
      <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        {anchorToggle}
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 13, color: "#64748b", padding: "40px 0", lineHeight: 1.6 }}>
          {anchor === "firesale"
            ? "No Fire Sale rallies yet, price hasn't entered the cheapest band, or hasn't rallied 30%+ from it."
            : "No completed rally cycles yet, a rally is recorded once price climbs at least 30% off a cycle bottom."}
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

      <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
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
            scale="log" domain={[1, Math.ceil(maxMult * 1.15)]} allowDataOverflow
            tickFormatter={v => fMult(v)}
            tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 46 : 58}
          />
          <Tooltip content={<CycleTip />} />
          {cycles.map((c, i) => (
            <Line
              key={i} dataKey={"e" + i} name={fMon(c.startDate) + (c.ongoing ? " (now)" : "")}
              type="linear" stroke={colorFor(i)} strokeWidth={c.ongoing ? 2.4 : 1.7}
              dot={false} connectNulls isAnimationActive={false}
            />
          ))}
          {cycles.map((c, i) => {
            const t = c.points[c.points.length - 1];
            return (
              <ReferenceDot
                key={"dot" + i} x={t.day} y={t.gain + 1} r={4}
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

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
        {anchor === "firesale"
          ? "Each line traces the climb (× from the low, log scale) after price entered the cheapest “Fire Sale” valuation band, vs. days since that low, i.e. how capitulation-band entries have paid off. Not financial advice."
          : "The mirror of the drawdown chart: each line traces the climb (× from the low, log scale) after a major cycle bottom, vs. days since that low. Log makes cycles of very different size comparable, note each recovery has run a smaller multiple than the last as SPX6900 matures. Not financial advice."}
      </div>

      {strategy && (
        <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#94a3b8",
            letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginBottom: 14,
          }}>
            Buy the {anchor === "firesale" ? "Fire Sale" : "dip"}, sell the peak, vs HODL
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
              <Line type="monotone" dataKey="hodl" name="HODL" stroke="#64748b" strokeWidth={1.7} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="strat" name="Strategy" stroke="#4ade80" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ fontFamily: SANS, fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
            Hindsight strategy with perfect timing (buy each low, sell each peak), compounded from {fMon(strategy.startDate)}, cash between cycles.
            Log scale. Illustrative only, not achievable in real time, and not financial advice.
          </div>
        </div>
      )}
    </div>
  );
}
