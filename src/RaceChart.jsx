import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { LIVE_DATA_DOWN } from "./history-data.js";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomResetButton } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const DAY = 86400000;
const tsOf = d => new Date(d).getTime();
const yearOf = t => new Date(t).getUTCFullYear();
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMult = v => (v >= 100 ? Math.round(v) + "×" : v >= 10 ? v.toFixed(1) + "×" : v.toFixed(2) + "×");
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round((v - 1) * 100).toLocaleString()}%`;
const WINDOWS = [["launch", "Since launch"], ["12m", "12 months"], ["ytd", "YTD"]];

// nearest-price lookup over a {date,price} series (binary search). Returns null
// BEFORE the series' first data point — never clamps the start — so a peer whose
// history doesn't reach back to the window start draws a gap instead of a fake
// flat line. `.first` exposes that first timestamp. The recent end still clamps to
// the last known price (today).
function lookupFn(arr) {
  const m = arr.map(p => ({ ts: tsOf(p.date), price: p.price })).sort((a, b) => a.ts - b.ts);
  const fn = target => {
    if (!m.length) return null;
    if (target < m[0].ts) return null;
    if (target >= m[m.length - 1].ts) return m[m.length - 1].price;
    let lo = 0, hi = m.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (m[mid].ts < target) lo = mid + 1; else hi = mid - 1; }
    const a = m[Math.max(0, lo - 1)], b = m[Math.min(m.length - 1, lo)];
    if (a.ts === b.ts || b.ts === a.ts) return a.price;
    // log-linear interpolation — a straight line on the log axis between anchors,
    // so sampling on a fine grid renders smooth (not blocky) between sparse points.
    const f = (target - a.ts) / (b.ts - a.ts);
    return Math.exp(Math.log(a.price) + (Math.log(b.price) - Math.log(a.price)) * f);
  };
  fn.first = m.length ? m[0].ts : Infinity;
  return fn;
}

function Tip({ active, payload, coins, spxColor }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [{ key: "spx", label: "SPX6900", color: spxColor }, ...coins].filter(r => d[r.key] != null);
  rows.sort((a, b) => d[b.key] - d[a.key]);
  return (
    <TipBox>
      <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>{new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
      {rows.map(r => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: r.color, fontWeight: r.key === "spx" ? 700 : 500 }}>{r.label}</span>
          <span style={{ fontFamily: MONO, color: d[r.key] >= 1 ? "#4ade80" : "#f87171" }}>{fMult(d[r.key])} <span style={{ color: "#64748b" }}>{fPct(d[r.key])}</span></span>
        </div>
      ))}
    </TipBox>
  );
}

// Rebased performance race: SPX6900 vs a basket, every line starting at 1× on the
// window's start date, on a LOG axis so a 500× SPX and a 3× peer both read clearly.
export default function RaceChart({ series, isMobile, fetchCoins, coins, basketLabel, preview = false }) {
  const [coinData, setCoinData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [win, setWin] = useState("launch");
  // [x0,x1] drag-selected window (overrides the toggle)
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp } = useDragZoom(
    (a, b) => series.filter(r => { const t = tsOf(r.date); return t >= a && t <= b; }).length >= 2);
  const [hidden, setHidden] = useState(() => new Set()); // deselected peers
  const toggle = key => setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  useEffect(() => {
    let live = true;
    fetchCoins()
      .then(d => { if (live) { setCoinData(d); setStatus("ok"); } })
      .catch(e => { if (live) { setCoinData(null); setStatus(e.message || "error"); } });
    return () => { live = false; };
  }, [fetchCoins]);

  const { rows, xDomain, xTicks, fmtX, yDomain, yTicks, standings } = useMemo(() => {
    if (!coinData) return { rows: [], xDomain: [0, 1], xTicks: [], fmtX: t => t, yDomain: [0.5, 2], yTicks: [1], standings: [] };
    const now = tsOf(series.at(-1).date);
    const winStart = win === "ytd" ? Date.UTC(yearOf(now), 0, 1)
      : win === "12m" ? now - 365 * DAY
      : tsOf(series[0].date);
    // A drag-selected zoom window overrides the toggle; everything rebases to its start.
    const [startTs, endTs] = zoom ?? [winStart, now];
    const spxL = lookupFn(series);
    const coinL = Object.fromEntries(coins.map(c => [c.key, coinData[c.key] ? lookupFn(coinData[c.key]) : null]));
    const t0 = Math.max(startTs, spxL.first);
    // Sample on a fine (daily) grid instead of the sparse weekly source dates, so
    // the lines render smooth and rich rather than blocky. ~1 point/day, capped.
    const step = Math.max(DAY, Math.ceil((endTs - t0) / (900 * DAY)) * DAY);
    const grid = [];
    for (let t = t0; t < endTs; t += step) grid.push(t);
    grid.push(endTs);
    // Rebase each line to the window start — or, if a peer's history begins later,
    // to ITS first available date (so it starts at 1× where its data actually
    // begins, rather than clamping to a flat 1× across the gap).
    const baseTs = { spx: t0 }, base = { spx: spxL(t0) };
    for (const c of coins) {
      const L = coinL[c.key];
      if (!L) { base[c.key] = null; baseTs[c.key] = Infinity; continue; }
      const eff = Math.max(t0, L.first);
      baseTs[c.key] = eff; base[c.key] = L(eff);
    }
    const rows = grid.map(t => {
      const sp = spxL(t);
      const row = { ts: t, spx: (sp != null && base.spx) ? sp / base.spx : null };
      for (const c of coins) {
        const L = coinL[c.key], b = base[c.key];
        const v = (L && b && t >= baseTs[c.key]) ? L(t) : null;
        row[c.key] = (v != null && b) ? v / b : null;
      }
      return row;
    });
    // Scale to the VISIBLE lines only (SPX + peers not toggled off).
    const visKeys = ["spx", ...coins.filter(c => !hidden.has(c.key)).map(c => c.key)];
    let yMin = Infinity, yMax = -Infinity;
    for (const r of rows) for (const k of visKeys) if (r[k] != null) { if (r[k] < yMin) yMin = r[k]; if (r[k] > yMax) yMax = r[k]; }
    if (!Number.isFinite(yMin)) { yMin = 0.5; yMax = 2; }
    const spanDays = (endTs - t0) / DAY, monthly = spanDays <= 560;
    const xTicks = [];
    if (monthly) {
      let t = Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), 1);
      while (t <= endTs) { if (t >= t0) xTicks.push(t); const dd = new Date(t); t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1); }
    } else {
      for (let yr = yearOf(t0); yr <= yearOf(endTs); yr++) { const d = Date.UTC(yr, 0, 1); if (d >= t0 && d <= endTs) xTicks.push(d); }
    }
    const allYTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const last = rows.at(-1) || {};
    const standings = [{ key: "spx", label: "SPX6900", color: "#ffffff", v: last.spx }, ...coins.filter(c => !hidden.has(c.key)).map(c => ({ ...c, v: last[c.key] }))]
      .filter(s => s.v != null).sort((a, b) => b.v - a.v);
    return {
      rows, xDomain: [t0, endTs], xTicks, fmtX: monthly ? fShort : (t => String(yearOf(t))),
      yDomain: [yMin * 0.8, yMax * 1.25], yTicks: allYTicks.filter(v => v >= yMin * 0.8 && v <= yMax * 1.25), standings,
    };
  }, [coinData, series, win, coins, zoom, hidden]);

  const spxColor = "#ffffff";
  const spxV = standings.find(s => s.key === "spx")?.v;
  const spxRank = standings.findIndex(s => s.key === "spx") + 1;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
        {WINDOWS.map(([id, lbl]) => (
          <button key={id} onClick={() => { setWin(id); setZoom(null); }} className={`neon-pill${win === id && !zoom ? " active" : ""}`}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, color: win === id && !zoom ? "#f8fafc" : "#94a3b8", "--glow": "#22d3ee" }}>{lbl}</button>
        ))}
        {zoom && <ZoomResetButton onReset={() => setZoom(null)} fontSize={13} padding="7px 14px" />}
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
      {status !== "ok" && status !== "loading" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 60 }}>{LIVE_DATA_DOWN}</div>}

      {status === "ok" && (
        <>
          <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#64748b", marginBottom: 8 }}>
            {zoom ? "Rebased to the selected window's start." : "Drag across the chart to zoom into any period."}
          </div>
          <div style={{ position: "relative" }}>
            {!preview && <ChartZoomHint />}
            <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
              <ComposedChart data={rows} margin={{ top: 10, right: isMobile ? 14 : 32, bottom: 24, left: isMobile ? 0 : 12 }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                style={{ cursor: "crosshair", userSelect: "none" }}>
                <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="ts" type="number" domain={xDomain} ticks={xTicks} scale="time" allowDataOverflow
                  tickFormatter={fmtX}
                  tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
                <YAxis type="number" scale="log" domain={yDomain} ticks={yTicks} allowDataOverflow
                  tickFormatter={v => v + "×"}
                  tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
                <ReferenceLine y={1} stroke="rgba(148,163,184,0.6)" strokeDasharray="5 5"
                  label={{ value: "start 1×", position: "insideBottomRight", fill: "#94a3b8", fontSize: 11, fontFamily: MONO }} />
                <Tooltip content={<Tip coins={coins} spxColor={spxColor} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
                {coins.filter(c => !hidden.has(c.key)).map(c => (
                  <Line key={c.key} dataKey={c.key} stroke={c.color} strokeWidth={1.5} dot={false} isAnimationActive={false} name={c.label} connectNulls />
                ))}
                <Line dataKey="spx" stroke={spxColor} strokeWidth={2.2} dot={false} isAnimationActive={false} name="SPX6900" connectNulls />
                {selL != null && selR != null && selL !== selR && (
                  <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* legend — click a peer to show / hide it */}
      {status === "ok" && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "#f1f5f9", padding: "5px 6px" }}>
            <span style={{ width: 16, height: 3, borderRadius: 2, background: spxColor }} />SPX6900
          </span>
          {coins.map(c => {
            const off = hidden.has(c.key);
            return (
              <button key={c.key} onClick={() => toggle(c.key)} className="pill" title={off ? `Show ${c.label}` : `Hide ${c.label}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 11px", borderRadius: 8,
                  fontFamily: SANS, fontSize: 13, fontWeight: 600, background: "transparent",
                  border: `1px solid ${off ? "transparent" : c.color + "55"}`, "--glow": c.color,
                  color: off ? "#64748b" : "#e2e8f0", opacity: off ? 0.6 : 1,
                }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: off ? "#475569" : c.color }} />
                <span style={{ textDecoration: off ? "line-through" : "none" }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 14, lineHeight: 1.65, maxWidth: 880, marginInline: "auto" }}>
        A clean same-start race: every line begins at <strong style={{ color: "#cbd5e1" }}>1×</strong> on the window&apos;s first day, so you read pure relative
        performance. Log axis, so SPX6900&apos;s big run and the peers stay legible together. <strong style={{ color: "#cbd5e1" }}>Click a coin in the legend to show/hide it</strong>, drag to zoom, or switch the window above. Not financial advice.
      </div>
    </div>
  );
}
