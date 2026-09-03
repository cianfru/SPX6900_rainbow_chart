import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { buildAltRainbow } from "./alt-rainbow.js";
import { loadHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const HOT = "#f87171", COOL = "#38bdf8", MID = "#cbd5e1";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const zoneOf = z => z >= 1 ? ["Overbought", HOT] : z <= -1 ? ["Cheap", COOL] : ["Fair", MID];

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload, [zone, col] = zoneOf(d.z);
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>vs alts: <span style={{ fontFamily: MONO, color: col }}>{zone}</span> <span style={{ color: "#94a3b8" }}>({d.z >= 0 ? "+" : ""}{d.z.toFixed(2)}σ)</span></div>
      <div style={{ color: "#94a3b8" }}>{d.rr.toFixed(0)}× the alt market since launch</div>
    </TipBox>
  );
}

// SPX vs the Alt Market, SPX ÷ TOTAL3ES (alt sector ex-BTC/ETH/stables), detrended into
// how far SPX sits above/below its OWN trend strength vs alts. 0 = fair, above = rich/
// overbought, below = cheap. A relative-valuation position, not a signal.
export default function AltMarketChart({ isMobile, preview = false }) {
  const [history, setHistory] = useState(null);
  useEffect(() => { let off = false; loadHistory().then(d => { if (!off) setHistory(d || []); }); return () => { off = true; }; }, []);
  const all = useMemo(() => {
    const R = buildAltRainbow(history || []);
    return R ? R.series.map(s => ({ ts: s.ts, z: s.z, rr: s.rr })) : [];
  }, [history]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const fullX = [all[0].ts, all.at(-1).ts];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const zs = vis.map(r => r.z), maxZ = Math.max(...zs, 1.2), minZ = Math.min(...zs, -1.2);
    const pad = 0.12 * (maxZ - minZ);
    const hi = maxZ + pad, lo = minZ - pad;
    const split = Math.max(0, Math.min(1, hi / (hi - lo))); // fraction from top where z=0 sits
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], yDomain: [lo, hi], xTicks, split, cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Alt-market data is loading…</div>;

  const cur = view.cur, [zone, zoneC] = zoneOf(cur.z);
  const zLabel = (v, txt, col) => preview ? undefined : { value: txt, position: "insideTopLeft", fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is SPX6900 rich or cheap versus the whole alt market?" accent="#38bdf8">
        SPX divided by the alt sector, every coin except Bitcoin, Ethereum and stablecoins, then detrended.
        <strong style={{ color: "#f87171" }}> Above the line</strong> = SPX is running hot vs alts; <strong style={{ color: "#38bdf8" }}>below</strong> = cheap vs alts. It's about relative strength versus the sector, not price. A position, not a signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="vs alt market" value={zone} color={zoneC} sub={`${cur.z >= 0 ? "+" : ""}${cur.z.toFixed(2)}σ from trend`} />
        <Metric label="since launch" value={`${cur.rr.toFixed(0)}×`} color="#a3e635" sub="the alt sector" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={COOL} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="altfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={HOT} stopOpacity={0.5} />
                <stop offset={view.split} stopColor={HOT} stopOpacity={0.12} />
                <stop offset={view.split} stopColor={COOL} stopOpacity={0.12} />
                <stop offset="1" stopColor={COOL} stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={1} y2={view.yDomain[1]} fill={HOT} fillOpacity={0.152} stroke="none" label={zLabel(0, "overbought vs alts", HOT)} />
            <ReferenceArea y1={view.yDomain[0]} y2={-1} fill={COOL} fillOpacity={0.152} stroke="none" label={zLabel(0, "cheap vs alts", COOL)} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view.yDomain} allowDataOverflow
              tickFormatter={v => (v >= 0 ? "+" : "") + v.toFixed(1) + "σ"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 58} />
            <ReferenceLine y={1} stroke={HOT} strokeDasharray="5 5" strokeOpacity={0.7} />
            <ReferenceLine y={-1} stroke={COOL} strokeDasharray="5 5" strokeOpacity={0.7} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
              label={preview ? undefined : { value: "fair vs alts", position: "insideBottomRight", fill: "#94a3b8", fontSize: 10.5, fontFamily: MONO }} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="z" baseValue={0} stroke="#f8fafc" strokeWidth={1.6} fill="url(#altfill)" dot={false} isAnimationActive={false} name="vs alt market" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={COOL} fill={COOL} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: MID }}>SPX ÷ the alt market</strong> (TOTAL3ES, ex-BTC/ETH/stables), detrended: <strong style={{ color: HOT }}>above</strong> = rich vs the sector, <strong style={{ color: COOL }}>below</strong> = cheap.
        0 = SPX&apos;s own trend strength vs alts (not parity, SPX has structurally outperformed the sector {cur.rr.toFixed(0)}× since launch). A relative-valuation position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
