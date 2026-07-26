import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const ACC = "#22d3ee";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Liveliness: <span style={{ fontFamily: MONO, color: ACC }}>{d.liveliness.toFixed(3)}</span></div>
      {Number.isFinite(d.dormancy) && <div style={{ color: "#94a3b8" }}>moved coins held ~{Math.round(d.dormancy)}d</div>}
    </TipBox>
  );
}

// Liveliness — cumulative coin-days destroyed ÷ created. Rises when long-held coins move
// (distribution), falls when the base sits tight (accumulation). From the FIFO per-lot engine.
export default function LivelinessChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN).map(r => ({ ts: Date.parse(r.d), liveliness: r.liveliness, dormancy: r.dormancy }))
      .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.liveliness) && r.liveliness > 0).sort((a, b) => a.ts - b.ts),
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
    const lo = Math.max(0, Math.min(...vis.map(r => r.liveliness)) - 0.02);
    const hi = Math.min(1, Math.max(...vis.map(r => r.liveliness)) + 0.02);
    const back = all[Math.max(0, all.length - 14)];
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [lo, hi], cur: all.at(-1), rising: all.at(-1).liveliness > back.liveliness + 0.002 };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet — this fills in as the reconstruction runs.</div>;

  const cur = view.cur;
  const state = view.rising ? "old coins waking up — distribution" : "coins sitting tight — accumulation";

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Are long-held SPX6900 coins waking up, or is the base sitting tight?" accent={ACC}>
        Every coin builds up <strong style={{ color: "#e2e8f0" }}>coin-days</strong> as it sits still; spending it destroys them. Liveliness is the share of all coin-days ever built up that have been spent.
        It <strong style={{ color: ACC }}>rises</strong> when old coins move (distribution) and <strong style={{ color: ACC }}>falls</strong> when holders accumulate and refuse to move. A slow conviction read, not a signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="liveliness now" value={cur.liveliness.toFixed(3)} color={ACC} sub={state} />
        {Number.isFinite(cur.dormancy) && <Metric label="dormancy" value={`${Math.round(cur.dormancy)}d`} color="#e2e8f0" sub="avg age of moved coins" />}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={ACC} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="lvfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACC} stopOpacity={0.32} />
                <stop offset="100%" stopColor={ACC} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view.yDomain} allowDataOverflow tickFormatter={v => v.toFixed(2)}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="liveliness" stroke={ACC} strokeWidth={2.6} fill="url(#lvfill)" dot={false} isAnimationActive={false} name="Liveliness" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: ACC }}>Liveliness</strong> — cumulative coin-days destroyed ÷ coin-days ever created, reconstructed on-chain from each lot&apos;s age when spent.
        Falling = holders accumulating and holding; rising = older coins changing hands. A conviction position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
