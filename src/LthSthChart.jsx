import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

// bottom → top: the long-term block (the diamond base) first, short-term on top.
const BANDS = [
  { key: "lthProfit", label: "long-term · profit", c: "#16a34a" },
  { key: "lthLoss", label: "long-term · loss", c: "#dc2626" },
  { key: "sthProfit", label: "short-term · profit", c: "#86efac" },
  { key: "sthLoss", label: "short-term · loss", c: "#fca5a5" },
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

// Long vs short-term holders, supply in profit/loss (FIFO per-lot). Splits every held coin
// by age (long-term = held >155d) and by profit vs loss. The conviction read: the long-term
// block dominates AND much of it is underwater yet unmoved. A holder-behaviour position.
export default function LthSthChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN)
      .filter(r => Number.isFinite(r.lthProfit) && Number.isFinite(r.sthLoss))
      .map(r => ({ ts: Date.parse(r.d), lthProfit: r.lthProfit, lthLoss: r.lthLoss, sthProfit: r.sthProfit, sthLoss: r.sthLoss }))
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
  const lth = cur.lthProfit + cur.lthLoss, under = cur.lthLoss + cur.sthLoss;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Who's holding SPX6900 — and are they up or down?" accent="#16a34a">
        Every coin split two ways: by <strong style={{ color: "#e2e8f0" }}>age</strong> (long-term = held over 155 days, the diamond base) and by <strong style={{ color: "#e2e8f0" }}>profit vs loss</strong>.
        The long-term block <strong style={{ color: "#4ade80" }}>dominates and keeps growing</strong>, and much of it sits <strong style={{ color: "#f87171" }}>underwater yet unmoved</strong> — conviction, not capitulation.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="held long-term" value={lth.toFixed(0) + "%"} color="#4ade80" sub="over 155 days" />
        <Metric label="underwater, holding" value={under.toFixed(0) + "%"} color="#f87171" sub="below cost, unmoved" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#16a34a" />

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
                fill={b.c} fillOpacity={0.88} dot={false} isAnimationActive={false} name={b.label} />
            ))}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
        {BANDS.slice().reverse().map(b => (
          <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12.5, color: "#cbd5e1" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: b.c }} />{b.label}
          </span>
        ))}
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: "#4ade80" }}>Long vs short-term holders</strong> — SPX6900&apos;s ETH-native supply split by holder age (over/under 155 days) and on-chain profit/loss, reconstructed per-lot (FIFO).
        The long-term block dominates and much of it is underwater yet unmoved — the conviction story. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
