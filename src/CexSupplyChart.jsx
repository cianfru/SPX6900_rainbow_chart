import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { CEX_FLOW } from "./cex-flow.js";
import { loadCexFlow } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const CEX = "#fb7185", LP = "#38bdf8", CUST = "#a78bfa";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fMlab = t => t >= 1e6 ? (t / 1e6).toFixed(1) + "M" : (t / 1e3).toFixed(0) + "K";

// [d, cexBal, lpBal, custBal, ...] — daily cumulative balances.
const build = days => days.map(r => ({ ts: Date.parse(r[0]), cex: r[1], lp: r[2], cust: r[3] })).filter(r => Number.isFinite(r.ts));
const BUNDLE = build(CEX_FLOW.days);

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div style={{ color: CEX }}>Exchanges: <span style={{ fontFamily: MONO }}>{fMlab(d.cex)}</span></div>
      <div style={{ color: LP }}>Uniswap LP: <span style={{ fontFamily: MONO }}>{fMlab(d.lp)}</span></div>
    </TipBox>
  );
}

// Where the tradable float sits — SPX launched DEX-native (all in the LP); exchange-held
// supply grew as listings landed. Stacked area of on-venue supply over time.
export default function CexSupplyChart({ isMobile, preview = false }) {
  const [all, setAll] = useState(BUNDLE);
  useEffect(() => { let c = false; loadCexFlow().then(d => { if (!c && d?.days?.length) setAll(build(d.days)); }); return () => { c = true; }; }, []);
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    const yMax = Math.max(...vis.map(r => r.cex + r.lp + r.cust)) * 1.08;
    return { vis, xDomain: [x0, x1], xTicks, yMax, cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough data yet.</div>;
  const cur = view.cur;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Where does SPX6900's tradable supply actually sit?" accent={CEX}>
        SPX launched <strong style={{ color: LP }}>DEX-native</strong> — every coin in the Uniswap pool. As exchanges <strong style={{ color: CEX }}>listed</strong> it through 2024-25, the tradable float shifted onto exchanges while the LP thinned.
        A map of where the supply lives, not a signal.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 14 : 28, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="on exchanges" value={fMlab(cur.cex)} color={CEX} sub="tradable / sell-side" />
        <Metric label="in the LP" value={fMlab(cur.lp)} color={LP} sub="Uniswap depth" />
      </div>
      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={CEX} />
      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <AreaChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 4 : 16 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis domain={[0, view.yMax]} tickFormatter={fMlab} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={false} tickLine={false} width={isMobile ? 42 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            <Area type="monotone" dataKey="lp" stackId="1" stroke={LP} fill={LP} fillOpacity={0.5} strokeWidth={1.5} isAnimationActive={false} name="Uniswap LP" />
            <Area type="monotone" dataKey="cex" stackId="1" stroke={CEX} fill={CEX} fillOpacity={0.5} strokeWidth={1.5} isAnimationActive={false} name="Exchanges" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: CEX }}>Supply on venues</strong> — SPX held on tagged exchange, LP and custody addresses, reconstructed on-chain (Dune). Known addresses only; a location map, not a signal. Drag to zoom.
      </div>
    </div>
  );
}
