import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const A100 = "#fbbf24", A10 = "#f87171";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Top 100 wallets: <span style={{ fontFamily: MONO, color: A100 }}>{d.t100.toFixed(1)}%</span></div>
      <div>Top 10 wallets: <span style={{ fontFamily: MONO, color: A10 }}>{d.t10.toFixed(1)}%</span></div>
    </TipBox>
  );
}

// Holder concentration — the largest wallets' share of ETH-native supply over time
// (contracts/pools/CEX excluded). SPX has DECENTRALISED: the whales' grip loosened as
// the holder base grew. A distribution-of-ownership read, not a signal.
export default function HolderConcentrationChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN).map(r => ({ ts: Date.parse(r.d), t10: r.top10, t100: r.top100 })).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts),
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
    return { vis, xDomain: [x0, x1], xTicks, cur: all.at(-1), first: all[0] };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;
  const { cur, first } = view;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="top 100 wallets" value={cur.t100.toFixed(1) + "%"} color={A100} sub={`from ${first.t100.toFixed(0)}% at launch`} />
        <Metric label="top 10 wallets" value={cur.t10.toFixed(1) + "%"} color={A10} sub={`from ${first.t10.toFixed(0)}% at launch`} />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={A100} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="ccArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={A100} stopOpacity={0.28} />
                <stop offset="100%" stopColor={A100} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 75]} ticks={[0, 25, 50, 75]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="t100" stroke={A100} strokeWidth={2.8} fill="url(#ccArea)" dot={false} isAnimationActive={false} name="top 100" />
            <Line type="monotone" dataKey="t10" stroke={A10} strokeWidth={2.8} dot={false} isAnimationActive={false} name="top 10" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={A100} fill={A100} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: A100 }}>Holder concentration</strong> — the share of ETH-native supply held by the largest wallets (contracts, pools and exchanges excluded).
        Both lines have drifted down since launch: the float keeps spreading into more hands — SPX6900 is decentralising. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
