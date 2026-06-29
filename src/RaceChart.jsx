import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

const SANS = "'Space Grotesk', system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_W = 1400;
const tsOf = d => new Date(d).getTime();
const yearOf = t => new Date(t).getUTCFullYear();
const fMult = v => (v >= 100 ? Math.round(v) + "×" : v >= 10 ? v.toFixed(1) + "×" : v.toFixed(2) + "×");
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round((v - 1) * 100).toLocaleString()}%`;
const WINDOWS = [["launch", "Since launch"], ["12m", "12 months"], ["ytd", "YTD"]];

// nearest-price lookup over a {date,price} series (binary search)
function lookupFn(arr) {
  const m = arr.map(p => ({ ts: tsOf(p.date), price: p.price })).sort((a, b) => a.ts - b.ts);
  return target => {
    if (!m.length) return null;
    if (target <= m[0].ts) return m[0].price;
    if (target >= m[m.length - 1].ts) return m[m.length - 1].price;
    let lo = 0, hi = m.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (m[mid].ts < target) lo = mid + 1; else hi = mid - 1; }
    const a = m[Math.max(0, lo - 1)], b = m[Math.min(m.length - 1, lo)];
    return (target - a.ts) <= (b.ts - target) ? a.price : b.price;
  };
}

function Tip({ active, payload, coins, spxColor }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [{ key: "spx", label: "SPX6900", color: spxColor }, ...coins].filter(r => d[r.key] != null);
  rows.sort((a, b) => d[b.key] - d[a.key]);
  return (
    <div style={{ background: "rgba(4,4,12,0.97)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 16px", fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>{new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      {rows.map(r => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: r.color, fontWeight: r.key === "spx" ? 700 : 500 }}>{r.label}</span>
          <span style={{ fontFamily: MONO, color: d[r.key] >= 1 ? "#4ade80" : "#f87171" }}>{fMult(d[r.key])} <span style={{ color: "#64748b" }}>{fPct(d[r.key])}</span></span>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, color = "#f8fafc", sub }) {
  return (
    <div style={{ textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// Rebased performance race: SPX6900 vs a basket, every line starting at 1× on the
// window's start date, on a LOG axis so a 500× SPX and a 3× peer both read clearly.
export default function RaceChart({ series, isMobile, fetchCoins, coins, basketLabel }) {
  const [coinData, setCoinData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [win, setWin] = useState("launch");

  useEffect(() => {
    let live = true;
    fetchCoins()
      .then(d => { if (live) { setCoinData(d); setStatus("ok"); } })
      .catch(e => { if (live) { setCoinData(null); setStatus(e.message || "error"); } });
    return () => { live = false; };
  }, [fetchCoins]);

  const { rows, xDomain, xTicks, yDomain, yTicks, standings } = useMemo(() => {
    if (!coinData) return { rows: [], xDomain: [0, 1], xTicks: [], yDomain: [0.5, 2], yTicks: [1], standings: [] };
    const now = tsOf(series.at(-1).date);
    const startTs = win === "ytd" ? Date.UTC(yearOf(now), 0, 1)
      : win === "12m" ? now - 365 * 86400000
      : tsOf(series[0].date);
    const dates = series.filter(r => tsOf(r.date) >= startTs).map(r => tsOf(r.date));
    if (dates[0] > startTs && win !== "launch") dates.unshift(startTs);
    const spxL = lookupFn(series);
    const coinL = Object.fromEntries(coins.map(c => [c.key, coinData[c.key] ? lookupFn(coinData[c.key]) : null]));
    const t0 = dates[0];
    const base = { spx: spxL(t0) };
    for (const c of coins) base[c.key] = coinL[c.key] ? coinL[c.key](t0) : null;
    const rows = dates.map(t => {
      const row = { ts: t, spx: spxL(t) / base.spx };
      for (const c of coins) row[c.key] = coinL[c.key] ? coinL[c.key](t) / base[c.key] : null;
      return row;
    });
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) for (const k of ["spx", ...coins.map(c => c.key)]) if (r[k] != null) { if (r[k] < yMin) yMin = r[k]; if (r[k] > yMax) yMax = r[k]; }
    const xTicks = [];
    for (let yr = yearOf(t0); yr <= yearOf(now); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= t0 && d <= now) xTicks.push(d); }
    const allYTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const last = rows.at(-1) || {};
    const standings = [{ key: "spx", label: "SPX6900", color: "#ffffff", v: last.spx }, ...coins.map(c => ({ ...c, v: last[c.key] }))]
      .filter(s => s.v != null).sort((a, b) => b.v - a.v);
    return {
      rows, xDomain: [t0, now], xTicks,
      yDomain: [yMin * 0.8, yMax * 1.25], yTicks: allYTicks.filter(v => v >= yMin * 0.8 && v <= yMax * 1.25), standings,
    };
  }, [coinData, series, win, coins]);

  const spxColor = "#ffffff";
  const spxV = standings.find(s => s.key === "spx")?.v;
  const spxRank = standings.findIndex(s => s.key === "spx") + 1;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {WINDOWS.map(([id, lbl]) => (
          <button key={id} onClick={() => setWin(id)} className={`neon-pill${win === id ? " active" : ""}`}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, color: win === id ? "#f8fafc" : "#94a3b8", "--glow": "#22d3ee" }}>{lbl}</button>
        ))}
      </div>

      {status === "ok" && (
        <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <Metric label="SPX6900" value={spxV ? fMult(spxV) : "—"} color="#4ade80" sub={fPct(spxV ?? 1)} />
          <Metric label="rank" value={spxRank ? `#${spxRank}` : "—"} sub={`of ${standings.length} (${basketLabel})`} />
          {standings.filter(s => s.key !== "spx").slice(0, 1).map(s => (
            <Metric key={s.key} label="best peer" value={fMult(s.v)} color={s.color} sub={s.label} />
          ))}
        </div>
      )}

      {status === "loading" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading {basketLabel}…</div>}
      {status !== "ok" && status !== "loading" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 60 }}>Couldn&apos;t load data: {status}</div>}

      {status === "ok" && (
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
              tickFormatter={t => String(yearOf(t))}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
              tickFormatter={v => (v >= 1 ? v + "×" : v + "×")}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <ReferenceLine y={1} stroke="rgba(148,163,184,0.6)" strokeDasharray="5 5"
              label={{ value: "start 1×", position: "insideBottomRight", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
            <Tooltip content={<Tip coins={coins} spxColor={spxColor} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {coins.map(c => (
              <Line key={c.key} dataKey={c.key} stroke={c.color} strokeWidth={2} dot={false} isAnimationActive={false} name={c.label} connectNulls />
            ))}
            <Line dataKey="spx" stroke={spxColor} strokeWidth={3.2} dot={false} isAnimationActive={false} name="SPX6900" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* legend */}
      {status === "ok" && (
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
          {[{ key: "spx", label: "SPX6900", color: spxColor }, ...coins].map(c => (
            <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 13, color: "#cbd5e1" }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: c.color }} />{c.label}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        A clean same-start race: every line begins at <strong style={{ color: "#cbd5e1" }}>1×</strong> on the window&apos;s first day, so you read pure relative
        performance. Log axis, so SPX6900&apos;s big run and the peers stay legible together. Toggle the window above. Not financial advice.
      </div>
    </div>
  );
}
