import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

// bottom → top = youngest → oldest (warm → cool); 1y+ is the diamond-hands tier.
const BANDS = [
  { key: "a0", label: "0–1m", c: "#f87171" },
  { key: "a1", label: "1–3m", c: "#fb923c" },
  { key: "a2", label: "3–6m", c: "#fbbf24" },
  { key: "a3", label: "6–12m", c: "#38bdf8" },
  { key: "a4", label: "1y+", c: "#818cf8" },
];
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      {BANDS.slice().reverse().map(b => (
        <div key={b.key}><span style={{ color: b.c }}>{b.label}</span>: <span style={{ fontFamily: MONO }}>{d[b.key].toFixed(1)}%</span></div>
      ))}
    </TipBox>
  );
}

// HODL waves, supply split by holding age over time (stacked). Fresh coins (warm) at
// the bottom, long-held (cool) on top. The maturation story: 100% fresh at launch → a
// third now in the 1y+ diamond tier. A holding-behaviour read, not a signal.
export default function HodlWavesChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN)
      .filter(r => Array.isArray(r.age) && r.age.length === 5)
      .map(r => ({ ts: Date.parse(r.d), a0: r.age[0], a1: r.age[1], a2: r.age[2], a3: r.age[3], a4: r.age[4] }))
      .filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts),
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
    return { vis, xDomain: [x0, x1], xTicks, cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;
  const cur = view.cur;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How long has SPX6900's supply been sitting still?" accent={BANDS[4].c}>
        Every coin coloured by <strong style={{ color: "#e2e8f0" }}>how long since it last moved</strong>, warm (bottom) = freshly traded, cool (top) = held for over a year.
        The bands started <strong style={{ color: "#f87171" }}>all fresh</strong> at launch and have matured: a third of supply now sits in the <strong style={{ color: "#818cf8" }}>1-year+ diamond tier</strong>. Coins settling into strong hands.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="held 1 year+" value={cur.a4.toFixed(1) + "%"} color={BANDS[4].c} sub="diamond tier" />
        <Metric label="held under 1 month" value={cur.a0.toFixed(1) + "%"} color={BANDS[0].c} sub="freshly moved" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={BANDS[4].c} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <AreaChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {BANDS.map(b => (
              <Area key={b.key} type="monotone" dataKey={b.key} stackId="1" stroke={b.c} strokeWidth={0.5}
                fill={b.c} fillOpacity={0.82} dot={false} isAnimationActive={false} name={b.label} />
            ))}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: BANDS[4].c }}>HODL waves</strong>, SPX6900&apos;s ETH-native supply split by how long each coin has been held.
        Fresh coins sit at the bottom (warm), long-held coins on top (cool). Watch the cool bands grow: at launch everything was fresh; now a third of supply hasn&apos;t moved in over a year. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
