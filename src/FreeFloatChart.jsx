import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const YEL = "#fbbf24", DIM = "#94a3b8";
const DAY = 86400000;
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Free float: <span style={{ fontFamily: MONO, color: YEL }}>{d.ff.toFixed(1)}%</span></div>
      <div style={{ color: "#94a3b8" }}>dormant &gt;6mo: {(100 - d.ff).toFixed(1)}%</div>
    </TipBox>
  );
}

// Free Float — the share of SPX6900 supply that's actually LIQUID (changed hands in the
// last 6 months), from the on-chain HODL age bands. Falls from ~100% at launch as coins
// mature into strong hands. Definition stated; reproducible from Ethereum transfers.
export default function FreeFloatChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setLive(d); }); return () => { off = true; }; }, []);

  const all = useMemo(() => {
    const src = (live || SPX_ONCHAIN).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
    const rows = src.map(r => ({ ts: Date.parse(r.d), ff: 100 - (r.age[3] + r.age[4]) })).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
    if (rows.length >= 10) { // exponential decay trend: log(ff) = a + b·day
      const t0 = rows[0].ts, x = rows.map(r => (r.ts - t0) / DAY), y = rows.map(r => Math.log(Math.max(r.ff, 1))), n = rows.length;
      const sx = x.reduce((s, v) => s + v, 0), sy = y.reduce((s, v) => s + v, 0);
      const sxx = x.reduce((s, v) => s + v * v, 0), sxy = x.reduce((s, v, i) => s + v * y[i], 0);
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
      for (const r of rows) r.trend = Math.exp(a + b * ((r.ts - t0) / DAY));
    }
    return rows;
  }, [live]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], xTicks, cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const cur = view.cur;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="free float" value={cur.ff.toFixed(1) + "%"} color={YEL} sub="liquid — moved in 6mo" />
        <Metric label="dormant" value={(100 - cur.ff).toFixed(1) + "%"} color={DIM} sub="hasn't moved in 6mo" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={YEL} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="fffill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YEL} stopOpacity={0.32} />
                <stop offset="100%" stopColor={YEL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[Math.max(0, Math.floor((Math.min(...view.vis.map(r => r.ff)) - 8) / 10) * 10), 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Line type="monotone" dataKey="trend" stroke={DIM} strokeWidth={1.6} strokeDasharray="7 6" strokeOpacity={0.65} dot={false} isAnimationActive={false} name="exp. trend" />
            <Area type="monotone" dataKey="ff" stroke={YEL} strokeWidth={2.6} fill="url(#fffill)" dot={false} isAnimationActive={false} name="free float" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={YEL} fill={YEL} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: YEL }}>Free float</strong> — the share of supply that changed hands in the last 6 months, from the on-chain HODL age bands (public Ethereum transfers).
        It fell from ~100% at launch as coins matured into strong hands — the &ldquo;supply squeeze&rdquo;. Fully reproducible; a holder-behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
