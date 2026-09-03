import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const GRN = "#4ade80", HOT = "#f87171", COOL = "#38bdf8";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>In profit: <span style={{ fontFamily: MONO, color: GRN }}>{d.sip.toFixed(1)}%</span></div>
      <div style={{ color: "#94a3b8" }}>underwater: {(100 - d.sip).toFixed(1)}%</div>
    </TipBox>
  );
}

// Supply in Profit %, the share of ETH-native supply whose holder's average cost
// basis sits below price, reconstructed on-chain from the ERC-20 transfer history
// (Dune). High near tops (frothy), low near bottoms (cheap). A valuation position.
export default function SupplyInProfitChart({ isMobile, preview = false }) {
  // Prefer the CI-refreshed /onchain.json (Dune, weekly); fall back to the bundle.
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN).map(r => ({ ts: Date.parse(r.d), sip: r.sip })).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts),
    [live]);

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
  const state = cur.sip >= 50 ? "most of the float in profit" : "most of the float underwater";
  const zLabel = (v, txt, col) => preview ? undefined : { value: txt, position: "insideTopLeft", fill: col, fontSize: 10.5, fontFamily: MONO, opacity: 0.9 };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How much of SPX6900's supply is sitting in profit?" accent={GRN}>
        The share of coins whose holder is <strong style={{ color: "#e2e8f0" }}>above their cost basis</strong>, what they paid, reconstructed from on-chain transfers.
        It runs near <strong style={{ color: HOT }}>100% at price tops</strong> (everyone green, frothy) and bottoms out near a few percent at the lows (almost everyone underwater, cheap). A valuation read, not a buy signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="supply in profit" value={cur.sip.toFixed(1) + "%"} color={GRN} sub={state} />
        <Metric label="underwater" value={(100 - cur.sip).toFixed(1) + "%"} color={HOT} sub="below cost basis" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={GRN} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="sipfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRN} stopOpacity={0.35} />
                <stop offset="100%" stopColor={GRN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={66} y2={100} fill={HOT} fillOpacity={0.171} stroke="none" label={zLabel(80, "frothy, most in profit", HOT)} />
            <ReferenceArea y1={0} y2={34} fill={COOL} fillOpacity={0.171} stroke="none" label={zLabel(17, "cheap, most underwater", COOL)} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.45)" strokeDasharray="5 5"
              label={preview ? undefined : { value: "half in profit", position: "insideBottomRight", fill: "#94a3b8", fontSize: 10.5, fontFamily: MONO }} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="sip" stroke={GRN} strokeWidth={1.8} fill="url(#sipfill)" dot={false} isAnimationActive={false} name="supply in profit" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={GRN} fill={GRN} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>Supply in Profit</strong>, the share of ETH-native supply whose wallet sits above its on-chain cost basis, reconstructed from the transfer history.
        It ran to ~100% at every price peak (everyone green, frothy) and bottomed near 2% at the lows (nearly all underwater, cheap). A valuation position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
