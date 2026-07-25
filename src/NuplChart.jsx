import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { loadHistory, loadPriceHistory } from "./history-data.js";
import { mvrvHistory } from "./mvrv-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const ZONES = [
  [0.75, "euphoria", "#f87171"], [0.5, "belief", "#fb923c"], [0.25, "optimism", "#fbbf24"],
  [0, "hope", "#38bdf8"], [-Infinity, "capitulation", "#6366f1"],
];
const zoneOf = n => ZONES.find(z => n >= z[0]);

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload, [, label, col] = zoneOf(d.nupl);
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>NUPL: <span style={{ fontFamily: MONO, color: col }}>{d.nupl >= 0 ? "+" : ""}{d.nupl.toFixed(2)}</span> <span style={{ color: "#94a3b8" }}>({label})</span></div>
    </TipBox>
  );
}

// NUPL — Net Unrealized Profit/Loss = (market cap − realized cap)/market cap = 1 − 1/MVRV.
// Positive = holders in aggregate unrealized profit, negative = underwater. Classic
// sentiment oscillator. A valuation position, not a signal.
export default function NuplChart({ isMobile, preview = false }) {
  const [history, setHistory] = useState(null);
  // NUPL is 1 − 1/MVRV, so a bad price in the MVRV numerator lands here too.
  const [px, setPx] = useState(null);
  useEffect(() => {
    let off = false;
    loadHistory().then(d => { if (!off) setHistory(d); });
    loadPriceHistory().then(d => { if (!off) setPx(d); });
    return () => { off = true; };
  }, []);

  const all = useMemo(() => {
    if (!history) return null;
    return mvrvHistory(history, px).map(r => ({ ts: r.ts, nupl: 1 - 1 / (r.p / r.be) })).filter(r => Number.isFinite(r.ts) && Number.isFinite(r.nupl)).sort((a, b) => a.ts - b.ts);
  }, [history, px]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all && all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (!all || all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], xTicks, cur: all.at(-1) };
  }, [all, zoom]);

  if (all == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading on-chain data…</div>;
  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const cur = view.cur, [, zLabel, zCol] = zoneOf(cur.nupl);
  const zLbl = (a, b, txt, col) => preview ? undefined : { value: txt, position: "insideLeft", fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Are SPX6900 holders sitting on profit or loss right now?" accent="#6366f1">
        <strong style={{ color: "#e2e8f0" }}>NUPL</strong> (Net Unrealized Profit/Loss) compares what all the coins are worth <em>today</em> to what they were worth when they last moved.
        <strong style={{ color: "#4ade80" }}> Above 0</strong> = the average coin is in profit; <strong style={{ color: "#818cf8" }}>below 0</strong> = underwater. It swings from
        <strong style={{ color: "#f87171" }}> euphoria</strong> at tops to <strong style={{ color: "#818cf8" }}>capitulation</strong> at bottoms — a read on crowd sentiment, not a buy signal.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="NUPL" value={(cur.nupl >= 0 ? "+" : "") + cur.nupl.toFixed(2)} color={zCol} sub={zLabel} />
        <Metric label="holders" value={cur.nupl >= 0 ? "in profit" : "underwater"} color={cur.nupl >= 0 ? "#4ade80" : "#818cf8"} sub="unrealized" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#6366f1" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="nuplfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f8fafc" stopOpacity={0.14} /><stop offset="100%" stopColor="#f8fafc" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={0.75} y2={0.95} fill="#f87171" fillOpacity={0.14} stroke="none" label={zLbl(0.75, 0.95, "euphoria", "#fca5a5")} />
            <ReferenceArea y1={0.5} y2={0.75} fill="#fb923c" fillOpacity={0.13} stroke="none" label={zLbl(0.5, 0.75, "belief", "#fdba74")} />
            <ReferenceArea y1={0.25} y2={0.5} fill="#fbbf24" fillOpacity={0.12} stroke="none" label={zLbl(0.25, 0.5, "optimism", "#fcd34d")} />
            <ReferenceArea y1={0} y2={0.25} fill="#38bdf8" fillOpacity={0.12} stroke="none" label={zLbl(0, 0.25, "hope", "#7dd3fc")} />
            <ReferenceArea y1={-1} y2={0} fill="#6366f1" fillOpacity={0.14} stroke="none" label={zLbl(-1, 0, "capitulation", "#a5b4fc")} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[-1, 0.95]} ticks={[-1, -0.5, 0, 0.5]} allowDataOverflow
              tickFormatter={v => (v > 0 ? "+" : "") + v} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 50} />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="5 5" label={preview ? undefined : { value: "break-even", position: "insideBottomLeft", fill: "#94a3b8", fontSize: 10.5, fontFamily: MONO }} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="nupl" stroke="#f8fafc" strokeWidth={2.4} fill="url(#nuplfill)" dot={false} isAnimationActive={false} name="NUPL" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        NUPL = 1 − realized price ÷ price, from the on-chain cost basis. SPX is more volatile than Bitcoin, so it overshoots the classic zones — the axis is clipped at −1 for readability (its true low was deeper). A valuation position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
