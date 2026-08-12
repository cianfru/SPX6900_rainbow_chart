import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const GRN = "#34d399", RED = "#fb7185";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const up = d.sopr >= 1;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>SOPR: <span style={{ fontFamily: MONO, color: up ? GRN : RED }}>{d.sopr.toFixed(3)}</span></div>
      <div style={{ color: "#94a3b8" }}>{up ? "coins moving at a profit" : "coins moving at a loss"}</div>
    </TipBox>
  );
}

// SOPR, Spent Output Profit Ratio. When coins move on-chain, are they sold at a profit
// (>1) or a loss (<1)? Realized value ÷ cost of the coins that moved, from the local FIFO
// per-lot engine. The classic oscillator around break-even 1.0. A behaviour position.
export default function SoprChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN).map(r => ({ ts: Date.parse(r.d), sopr: r.sopr }))
      .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.sopr) && r.sopr > 0).sort((a, b) => a.ts - b.ts),
    [live]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const lo = Math.max(0.4, Math.min(...vis.map(r => r.sopr)) - 0.05);
    const hi = Math.min(1.7, Math.max(...vis.map(r => r.sopr)) + 0.05);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [lo, hi], cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const cur = view.cur;
  const up = cur.sopr >= 1;
  const state = cur.sopr >= 1.02 ? "coins moving at a profit" : cur.sopr <= 0.98 ? "coins moving at a loss" : "moving near break-even";
  const zLabel = (txt, col, pos) => preview ? undefined : { value: txt, position: pos, fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="When SPX6900 coins move, are they being sold at a profit or a loss?" accent={GRN}>
        SOPR compares what moving coins are <strong style={{ color: "#e2e8f0" }}>worth now</strong> to <strong style={{ color: "#e2e8f0" }}>what they cost</strong>.
        Above <strong style={{ color: GRN }}>1</strong>, the coins changing hands are in profit; below <strong style={{ color: RED }}>1</strong>, they&apos;re moving at a loss, which clusters at the bottoms, where sellers capitulate cheap. A behaviour read, not a signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SOPR now" value={cur.sopr.toFixed(3)} color={up ? GRN : RED} sub={state} />
        <Metric label="break-even" value="1.00" color="#e2e8f0" sub="profit / loss line" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={GRN} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="soprline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRN} stopOpacity={0.9} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.9} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={1} y2={view.yDomain[1]} fill={GRN} fillOpacity={0.08} stroke="none" label={zLabel("selling at a profit", GRN, "insideTopRight")} />
            <ReferenceArea y1={view.yDomain[0]} y2={1} fill={RED} fillOpacity={0.08} stroke="none" label={zLabel("selling at a loss", RED, "insideBottomRight")} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view.yDomain} allowDataOverflow tickFormatter={v => v.toFixed(2)}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <ReferenceLine y={1} stroke="rgba(255,255,255,0.55)" strokeDasharray="5 5"
              label={preview ? undefined : { value: "break-even 1.0", position: "insideBottomLeft", fill: "#e2e8f0", fontSize: 10.5, fontFamily: MONO }} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="sopr" stroke="url(#soprline)" strokeWidth={1.8} fill="none" dot={false} isAnimationActive={false} name="SOPR" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>SOPR</strong>, realized value ÷ cost of the coins that moved each week, reconstructed on-chain from every lot&apos;s FIFO cost basis.
        Above 1 = holders selling in profit; below 1 = selling at a loss, which bottoms cluster around. A behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
