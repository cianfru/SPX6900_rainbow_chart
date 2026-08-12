import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { SUPPLY } from "./data.js";
import { loadHistory, loadPriceHistory } from "./history-data.js";
import { mvrvHistory } from "./mvrv-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain, ViewTabs } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const PRICE = "#38bdf8", COST = "#f59e0b", MVRV = "#a78bfa", FLOOR = "#34d399", DEEP = "#f87171";
const fPrice = p => (p < 1 ? "$" + p.toFixed(p < 0.01 ? 4 : 3) : "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const fPct = v => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const MODES = [["realized", "Realized price"], ["mvrv", "MVRV"], ["z", "MVRV Z-score"]];

function Tip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {mode === "realized" && <><div>Price: <span style={{ fontFamily: MONO, color: PRICE }}>{fPrice(d.price)}</span></div><div>Cost basis: <span style={{ fontFamily: MONO, color: COST }}>{fPrice(d.be)}</span></div><div>0.8× floor: <span style={{ fontFamily: MONO, color: FLOOR }}>{fPrice(d.f08)}</span></div><div>0.5× floor: <span style={{ fontFamily: MONO, color: DEEP }}>{fPrice(d.f05)}</span></div></>}
      {mode === "mvrv" && <div>MVRV: <span style={{ fontFamily: MONO, color: d.mvrv >= 1 ? "#4ade80" : "#f87171" }}>{d.mvrv.toFixed(2)}×</span> <span style={{ color: "#94a3b8" }}>(avg holder {fPct(d.mvrv - 1)})</span></div>}
      {mode === "z" && <div>MVRV Z: <span style={{ fontFamily: MONO, color: MVRV }}>{d.z.toFixed(2)}</span></div>}
    </TipBox>
  );
}

// On-chain valuation from the daily HolderScan snapshots: price vs the crowd's
// realized price (avg cost basis), MVRV (price ÷ cost), and its Z-score.
export default function OnchainValueChart({ isMobile, preview = false, initialView }) {
  const [history, setHistory] = useState(null);
  // The dense CI-cleaned price series. Without it the numerator comes from the bundled
  // CoinGecko export, which is mis-levelled through the 2026 drawdown and draws an 87%
  // spike and a vertical cliff into March.
  const [px, setPx] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadHistory().then(d => { if (!cancelled) setHistory(d); });
    loadPriceHistory().then(d => { if (!cancelled) setPx(d); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => {
    if (!history) return null;
    const rows = mvrvHistory(history, px).map(r => ({ ts: r.ts, price: r.p, be: r.be, f08: r.be * 0.8, f05: r.be * 0.5, mvrv: r.p / r.be, mcap: r.p * SUPPLY, rcap: r.be * SUPPLY }));
    if (rows.length) {
      const mc = rows.map(r => r.mcap), mean = mc.reduce((s, x) => s + x, 0) / mc.length;
      const std = Math.sqrt(mc.reduce((s, x) => s + (x - mean) ** 2, 0) / mc.length) || 1;
      for (const r of rows) r.z = (r.mcap - r.rcap) / std;
    }
    return rows;
  }, [history, px]);

  const [mode, setMode] = useState(() => ["realized", "mvrv", "z"].includes(initialView) ? initialView : "realized");
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all && all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!all || all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const keys = mode === "realized" ? ["price", "be", "f05"] : mode === "mvrv" ? ["mvrv"] : ["z"];
    let yMin = Infinity, yMax = -Infinity;
    for (const r of vis) for (const k of keys) { if (r[k] < yMin) yMin = r[k]; if (r[k] > yMax) yMax = r[k]; }
    if (mode === "mvrv") { yMin = Math.min(yMin, 0.9); yMax = Math.max(yMax, 1.1); }
    if (mode === "z") { const a = Math.max(Math.abs(yMin), Math.abs(yMax), 0.5); yMin = -a; yMax = a; }
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const cur = all.at(-1);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: mode === "realized" ? [yMin * 0.85, yMax * 1.15] : mode === "z" ? [yMin, yMax] : [yMin * 0.95, yMax * 1.05], cur };
  }, [all, zoom, mode]);

  if (all == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading on-chain data…</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain history yet, daily cost-basis snapshots started recently; this fills in as it accumulates.</div>;

  const cur = view.cur;
  const mvrvLabel = cur.mvrv >= 1.5 ? "hot" : cur.mvrv >= 1 ? "in profit" : "underwater";
  const zLabel = cur.z >= 0.5 ? "stretched" : cur.z <= -0.5 ? "cheap" : "fair";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is the average SPX6900 holder up or down on what they paid?" accent="#a78bfa">
        <strong style={{ color: "#f59e0b" }}>Realized price</strong> is the crowd's average on-chain cost basis. Price above it = holders in profit; below = underwater.
        <strong style={{ color: "#a78bfa" }}> MVRV</strong> is just price ÷ that cost (1× = break-even, high = frothy). The floor bands (0.5×/0.8×) are where price has historically found support. A valuation position, not a signal.
      </Explain>
      <ViewTabs tabs={MODES} value={mode} onChange={setMode} />

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="price" value={fPrice(cur.price)} color={PRICE} sub="live" />
        <Metric label="realized price" value={fPrice(cur.be)} color={COST} sub="avg cost basis" />
        <Metric label={mode === "z" ? "MVRV Z" : "MVRV"} value={mode === "z" ? cur.z.toFixed(2) : cur.mvrv.toFixed(2) + "×"} color={cur.mvrv >= 1 ? "#4ade80" : "#f87171"} sub={mode === "z" ? zLabel : mvrvLabel} />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale={mode === "realized" ? "log" : "auto"} domain={view.yDomain} allowDataOverflow
              tickFormatter={mode === "realized" ? (v => fPrice(v)) : mode === "mvrv" ? (v => v.toFixed(2) + "×") : (v => v.toFixed(1))}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
            {mode === "mvrv" && <ReferenceLine y={1} stroke="#4ade80" strokeWidth={1.6} strokeOpacity={0.85} label={{ value: "break-even 1×", position: "insideBottomRight", fill: "#4ade80", fontSize: 11, fontFamily: MONO }} />}
            {mode === "z" && <ReferenceLine y={0} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 5" />}
            <Tooltip content={<Tip mode={mode} />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {mode === "realized" && <>
              <Line type="monotone" dataKey="f08" stroke={FLOOR} strokeWidth={1.4} strokeDasharray="6 6" strokeOpacity={0.8} dot={false} isAnimationActive={false} name="0.8× floor" />
              <Line type="monotone" dataKey="f05" stroke={DEEP} strokeWidth={1.4} strokeDasharray="4 7" strokeOpacity={0.75} dot={false} isAnimationActive={false} name="0.5× floor" />
              <Line type="monotone" dataKey="be" stroke={COST} strokeWidth={2.4} dot={false} isAnimationActive={false} name="realized price" />
              <Line type="monotone" dataKey="price" stroke={PRICE} strokeWidth={2.4} dot={false} isAnimationActive={false} name="price" />
            </>}
            {mode === "mvrv" && <Line type="monotone" dataKey="mvrv" stroke={MVRV} strokeWidth={2.6} dot={false} isAnimationActive={false} name="MVRV" />}
            {mode === "z" && <Line type="monotone" dataKey="z" stroke="#22d3ee" strokeWidth={2.6} dot={false} isAnimationActive={false} name="MVRV Z" />}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        On-chain valuation from the crowd&apos;s <strong style={{ color: COST }}>realized price</strong> (avg cost basis).
        <strong style={{ color: "#cbd5e1" }}> Realized price</strong>: price vs cost basis, above = holders in profit; the <strong style={{ color: FLOOR }}>0.8×</strong>/<strong style={{ color: DEEP }}>0.5×</strong> bands are the historical floor zone.
        <strong style={{ color: "#cbd5e1" }}> MVRV</strong>: price ÷ cost (1× = break-even, high = frothy). <strong style={{ color: "#cbd5e1" }}>Z-score</strong>: MVRV normalized.
        Cost basis reconstructed on-chain from launch; live HolderScan snapshots extend the tail. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
