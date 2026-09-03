import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import { convictionSeries, convictionZone } from "./conviction.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const ACC = "#22d3ee";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload; const z = convictionZone(d.score);
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Conviction: <span style={{ fontFamily: MONO, color: z.color }}>{Math.round(d.score)}</span> / 100</div>
      <div style={{ color: "#94a3b8" }}>{z.label}</div>
    </TipBox>
  );
}

// CONVICTION SCORE — a 0–100 "how sticky are the holders" oscillator over time, weighted from our own
// FIFO holding-age reconstruction (0 ≈ full turnover in ~15d, 100 = all supply held 90+ days).
export default function ConvictionChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setLive(d); }); return () => { off = true; }; }, []);
  const all = useMemo(() => convictionSeries(live || SPX_ONCHAIN), [live]);

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

  const cur = view.cur, z = convictionZone(cur.score);
  const zLabel = (txt, col, pos) => preview ? undefined : { value: txt, position: pos, fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How sticky are SPX6900's holders, really?" accent={ACC}>
        The Conviction Score rolls our holding-age data into one number. <strong style={{ color: ACC }}>100</strong> means every coin has been held 90+ days;
        <strong style={{ color: "#fb7185" }}> 0</strong> means the whole supply turned over in the last couple of weeks. Higher = stickier hands. Our weights are published, so the score is checkable — not a black box.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="conviction now" value={Math.round(cur.score)} color={z.color} sub={z.label} />
        <Metric label="scale" value="0–100" color="#e2e8f0" sub="turnover → diamond-held" />
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, color: "#64748b", marginBottom: 10 }}>Ethereum-native · from per-wallet holding age</div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={ACC} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="convfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACC} stopOpacity={0.45} />
                <stop offset="100%" stopColor={ACC} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={80} y2={100} fill="#22d3ee" fillOpacity={0.2} stroke="none" label={zLabel("diamond-held", "#22d3ee", "insideTopRight")} />
            <ReferenceArea y1={0} y2={20} fill="#fb7185" fillOpacity={0.2} stroke="none" label={zLabel("high turnover", "#fb7185", "insideBottomRight")} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 34 : 44} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="score" stroke={ACC} strokeWidth={1.9} fill="url(#convfill)" dot={false} isAnimationActive={false} name="Conviction" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: ACC }}>Conviction Score</strong> = supply weighted by holding age (90+ days = full weight, the 30–90d band partial, fresh supply ~none), from our FIFO per-lot age reconstruction.
        <strong style={{ color: "#94a3b8" }}> Ethereum-native</strong> — holding age is only reconstructable on the traceable chain (Base &amp; Solana are bridged), where ~94% of SPX value sits.
        A stickiness read over time, not a price signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
