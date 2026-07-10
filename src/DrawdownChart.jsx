import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot,
} from "recharts";
import { buildDrawdownCycles, buildDrawdownSeries } from "./models.js";
import { ATH } from "./data.js";
import { SANS, MONO, MAX_W, TipBox } from "./chart-ui.jsx";

const fMon = d => new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const yearOf = t => new Date(t).getUTCFullYear();

function CycleTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value != null);
  if (rows.length === 0) return null;
  return (
    <TipBox title={<>Day {label} after peak</>} style={{ padding: "10px 14px" }}>
      {rows.map((p, i) => (
        <div key={i} style={{ color: p.color, fontFamily: MONO, fontSize: 12.5 }}>
          {p.name}: {p.value.toFixed(1)}%
        </div>
      ))}
    </TipBox>
  );
}

function UnderwaterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Price: <span style={{ fontFamily: MONO, color: "#38bdf8" }}>{fPrice(d.price)}</span></div>
      <div>From ATH: <span style={{ fontFamily: MONO, fontWeight: 700, color: d.dd < -0.5 ? "#f87171" : "#fbbf24" }}>{d.dd.toFixed(1)}%</span></div>
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

export default function DrawdownChart({ series, isMobile }) {
  const [mode, setMode] = useState("underwater"); // "underwater" = from-ATH over time; "cycle" = per-correction

  const cycles = useMemo(() => buildDrawdownCycles(series, { minDepth: 0.4, minPeakPrice: 0.05 }), [series]);

  const { rows, maxDay, minPct } = useMemo(() => {
    const dayset = new Set();
    cycles.forEach(c => c.points.forEach(p => dayset.add(p.day)));
    const days = [...dayset].sort((a, b) => a - b);
    const maps = cycles.map(c => { const m = new Map(); c.points.forEach(p => m.set(p.day, p.dd)); return m; });
    const r = days.map(day => {
      const row = { day };
      cycles.forEach((c, i) => { row["e" + i] = maps[i].has(day) ? maps[i].get(day) * 100 : null; });
      return row;
    });
    return { rows: r, maxDay: days.length ? days.at(-1) : 0, minPct: cycles.reduce((mn, c) => Math.min(mn, c.minDD * 100), 0) };
  }, [cycles]);

  // Continuous "underwater" curve: % below the running all-time high at every date.
  const uw = useMemo(() => {
    const s = buildDrawdownSeries(series, ATH);
    const rows = s.map(r => ({ ts: r.ts, price: r.price, dd: r.dd * 100 }));
    let pMin = Infinity, pMax = -Infinity, dMin = 0;
    for (const r of rows) { if (r.price < pMin) pMin = r.price; if (r.price > pMax) pMax = r.price; if (r.dd < dMin) dMin = r.dd; }
    const xTicks = [];
    if (rows.length) for (let y = yearOf(rows[0].ts); y <= yearOf(rows.at(-1).ts); y++) { const t = Date.UTC(y, 0, 1); if (t >= rows[0].ts && t <= rows.at(-1).ts) xTicks.push(t); }
    return { rows, xDomain: [rows[0]?.ts ?? 0, rows.at(-1)?.ts ?? 1], xTicks, pDomain: [pMin * 0.7, pMax * 1.4], dDomain: [Math.floor(dMin / 10) * 10, 0] };
  }, [series]);

  const colorFor = i => {
    if (cycles[i].ongoing) return "#ffffff";
    const n = cycles.length;
    return `hsl(${265 - (n > 1 ? i / (n - 1) : 0) * 265}, 75%, 62%)`;
  };

  const ongoing = cycles.find(c => c.ongoing);
  const currentDD = useMemo(() => {
    if (!series.length) return 0;
    const ath = series.reduce((m, s) => Math.max(m, s.price), 0);
    return series[series.length - 1].price / ath - 1;
  }, [series]);
  const worstDD = useMemo(() => series.length ? Math.min(...uw.rows.map(r => r.dd)) / 100 : 0, [uw, series]);

  const pTicks = [0.0001, 0.001, 0.01, 0.1, 1, 10].filter(v => v >= uw.pDomain[0] && v <= uw.pDomain[1]);

  const toggle = (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
      {[["underwater", "Underwater (from ATH)"], ["cycle", "By cycle"]].map(([id, label]) => {
        const active = mode === id, c = "#f87171";
        return (
          <button key={id} className="pill" onClick={() => setMode(id)} style={{
            fontFamily: SANS, fontSize: isMobile ? 12 : 13, fontWeight: 600, padding: "8px 14px",
            borderRadius: 9, cursor: "pointer", background: "transparent",
            border: `1px solid ${active ? c + "cc" : "transparent"}`, boxShadow: active ? `0 0 14px ${c}55` : "none",
            color: active ? "#f8fafc" : "#94a3b8", "--glow": c,
          }}>{label}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 28 : 56, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Readout label="CURRENT DRAWDOWN" value={(currentDD * 100).toFixed(0) + "%"} color="#f87171" isMobile={isMobile} />
        {mode === "underwater"
          ? <Readout label="DEEPEST EVER" value={(worstDD * 100).toFixed(0) + "%"} color="#fbbf24" isMobile={isMobile} />
          : ongoing && <Readout label="DEEPEST THIS CYCLE" value={(ongoing.minDD * 100).toFixed(0) + "%"} color="#fbbf24" isMobile={isMobile} />}
      </div>

      {toggle}

      {mode === "underwater" ? (
        <ResponsiveContainer width="100%" height={isMobile ? 380 : 540}>
          <ComposedChart data={uw.rows} margin={{ top: 10, right: isMobile ? 6 : 18, bottom: 24, left: isMobile ? 0 : 12 }}>
            <defs>
              <linearGradient id="uwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.55" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={uw.xDomain} ticks={uw.xTicks} scale="time" allowDataOverflow
              tickFormatter={t => String(yearOf(t))} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis yAxisId="dd" type="number" domain={uw.dDomain} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#f87171", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52} />
            <YAxis yAxisId="price" orientation="right" type="number" scale="log" domain={uw.pDomain} ticks={pTicks} allowDataOverflow
              tickFormatter={v => (v < 1 ? "$" + v : "$" + v.toLocaleString())} tick={{ fill: "#38bdf8", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<UnderwaterTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area yAxisId="dd" type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1.4} fill="url(#uwFill)" isAnimationActive={false} name="drawdown from ATH" />
            <Line yAxisId="price" type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} name="price" />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 380 : 540}>
          <LineChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 28, left: isMobile ? 0 : 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="day" type="number" domain={[0, maxDay]} tickFormatter={v => v + "d"}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              label={{ value: "Days since ATH peak", position: "insideBottom", offset: -14, fill: "#64748b", fontSize: 12, fontFamily: SANS }} />
            <YAxis domain={[Math.floor(minPct / 10) * 10, 0]} tickFormatter={v => v + "%"}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52} />
            <Tooltip content={<CycleTip />} />
            {cycles.map((c, i) => (
              <Line key={i} dataKey={"e" + i} name={fMon(c.startDate) + (c.ongoing ? " (now)" : "")}
                type="monotone" stroke={colorFor(i)} strokeWidth={c.ongoing ? 2.4 : 1.7}
                dot={false} connectNulls isAnimationActive={false} />
            ))}
            {cycles.map((c, i) => {
              const t = c.points[c.points.length - 1];
              return (<ReferenceDot key={"dot" + i} x={t.day} y={t.dd * 100} r={4}
                fill={colorFor(i)} stroke="#020208" strokeWidth={1.5} ifOverflow="extendDomain" />);
            })}
          </LineChart>
        </ResponsiveContainer>
      )}

      {mode === "cycle" && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px 18px", flexWrap: "wrap", marginTop: 14 }}>
          {cycles.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 12.5, color: c.ongoing ? "#f1f5f9" : "#cbd5e1", fontWeight: c.ongoing ? 700 : 500 }}>
              <span style={{ width: 15, height: 3, background: colorFor(i), borderRadius: 2, display: "inline-block" }} />
              {fMon(c.startDate)} → low {fMon(c.lowDate)} · {(c.minDD * 100).toFixed(0)}%{c.ongoing ? " (ongoing)" : ""}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.6, maxWidth: 880, marginInline: "auto" }}>
        {mode === "underwater"
          ? <>How far price sits below its running <strong style={{ color: "#f87171" }}>all-time high</strong> at every date — the red “underwater” area — with <span style={{ color: "#38bdf8" }}>price</span> on the right. Deep, long red patches are the brutal drawdowns; back to 0% = a fresh ATH. Not financial advice.</>
          : <>Each line traces how far price fell after an all-time high, vs. days since that peak. The thesis: as SPX6900 matures, drawdowns get <em>shallower and longer</em> — flatter lines that stretch further right. Not financial advice.</>}
      </div>
    </div>
  );
}
