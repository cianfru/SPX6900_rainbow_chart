import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { loadValuation } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const zoneOf = (zones, v) => zones.find(z => v < z.max) || zones[zones.length - 1];

function Tip({ active, payload }, zones) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload, z = zoneOf(zones, d.v);
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", year: "numeric" })}>
      <div><span style={{ fontFamily: MONO, color: z.color, fontWeight: 700 }}>{(d.v * 100).toFixed(0)}%</span> <span style={{ color: "#94a3b8" }}>({z.label})</span></div>
      <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{d.n} of 6 lenses</div>
    </TipBox>
  );
}

// Valuation Composite — a weighted basket of independent SPX6900 valuation indicators
// (on-chain + technical + sentiment), each percentile-ranked over its own history
// (higher = more expensive) and weighted into ONE over/under-valued oscillator. Replaces
// the "Am I Cheap?" snapshot. A valuation position over time, not a signal.
export default function ValuationComposite({ isMobile, preview = false }) {
  const [data, setData] = useState(null);
  useEffect(() => { let off = false; loadValuation().then(d => { if (!off) setData(d ?? false); }); return () => { off = true; }; }, []);

  const all = useMemo(() => {
    if (!data) return null;
    return data.series.map(([ts, v, n]) => ({ ts, v, n })).filter(r => Number.isFinite(r.ts) && Number.isFinite(r.v)).sort((a, b) => a.ts - b.ts);
  }, [data]);

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
    return { vis, xDomain: [x0, x1], xTicks };
  }, [all, zoom]);

  if (data == null) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Loading valuation data…</div>;
  if (data === false || !all || !view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>The valuation composite is being computed — check back shortly.</div>;

  const zones = data.zones, cur = data.cur, curZone = zoneOf(zones, cur.composite);
  const indByKey = Object.fromEntries(data.indicators.map(i => [i.key, i]));
  const order = data.indicators.map(i => i.key);
  const zLbl = (txt, col) => preview ? undefined : { value: txt, position: "insideRight", fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.95 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is SPX6900 cheap or expensive right now, across everything we track?" accent="#a78bfa">
        The <strong style={{ color: "#e2e8f0" }}>Valuation Composite</strong> blends six independent lenses — on-chain, technical and sentiment — into one number.
        Each lens is ranked against <em>its own</em> history (0 = the cheapest it's ever been, 100 = the most expensive), then weighted and averaged.
        <strong style={{ color: "#4ade80" }}> Low / green</strong> = undervalued vs its past; <strong style={{ color: "#f87171" }}>high / red</strong> = overvalued. A valuation position over time — not a buy signal.
      </Explain>

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="composite" value={`${(cur.composite * 100).toFixed(0)}%`} color={curZone.color} sub={curZone.label} />
        <Metric label="lenses" value={`${cur.byLens ? Object.keys(cur.byLens).length : 6} of 6`} color="#a78bfa" sub="weighted" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#a78bfa" />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 540}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="valfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f8fafc" stopOpacity={0.16} /><stop offset="100%" stopColor="#f8fafc" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            {zones.map((z, i) => (
              <ReferenceArea key={z.label} y1={i === 0 ? 0 : zones[i - 1].max} y2={Math.min(z.max, 1)} fill={z.color} fillOpacity={0.12} stroke="none" label={zLbl(z.label, z.color)} />
            ))}
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} allowDataOverflow
              tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 50} />
            <Tooltip content={p => Tip(p, zones)} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="v" stroke="#f8fafc" strokeWidth={2.6} fill="url(#valfill)" dot={false} isAnimationActive={false} name="composite" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Today's weighted lens breakdown — clearly labelled, with weight and where each sits */}
      <div style={{ maxWidth: 900, margin: "20px auto 0" }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 10 }}>
          Today's basket — each lens ranked over its own history (0 = cheapest, 100 = most expensive), weighted:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
          {order.map(k => {
            const ind = indByKey[k], pct = cur.byLens?.[k];
            if (pct == null) return null;
            const z = zoneOf(zones, pct);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ flex: "0 0 auto", fontFamily: MONO, fontSize: 11, color: "#64748b", width: 34 }}>{ind.weight}%</div>
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ind.label}</div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(pct * 100).toFixed(0)}%`, background: z.color, borderRadius: 3 }} />
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: z.color, width: 42, textAlign: "right" }}>{(pct * 100).toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 16, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        Weighted percentile of expensiveness across the basket — Rainbow power-law, MVRV cost basis, supply in profit, Pi Cycle trend, vs the alt market and Fear &amp; Greed. Each is oriented so higher = more expensive, ranked over its own full history, then averaged by weight. Fully reproducible. A valuation position over time, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
