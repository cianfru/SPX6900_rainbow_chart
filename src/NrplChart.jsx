import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const GRN = "#34d399", RED = "#fb7185";
const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const money = n => { const a = Math.abs(n); const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`; return n < 0 ? `−${s}` : s; };

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload, up = d.nrpl >= 0;
  return (
    <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
      <div>Net realized: <span style={{ fontFamily: MONO, color: up ? GRN : RED }}>{money(d.nrpl)}</span></div>
      <div style={{ color: "#94a3b8" }}>{up ? "net profit-taking" : "net losses realized"}</div>
    </TipBox>
  );
}

// Net Realized Profit/Loss, the dollar magnitude of gains vs losses holders lock in when
// coins move (SOPR is the ratio; this is the size). From the local FIFO per-lot engine.
export default function NrplChart({ isMobile, preview = false }) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadOnchain().then(d => { if (!cancelled && d) setLive(d); });
    return () => { cancelled = true; };
  }, []);
  const all = useMemo(
    () => (live || SPX_ONCHAIN).map(r => ({ ts: Date.parse(r.d), nrpl: r.nrpl }))
      .filter(r => Number.isFinite(r.ts) && Number.isFinite(r.nrpl)).sort((a, b) => a.ts - b.ts),
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
    // symmetric domain off the 96th-pctl magnitude so a spike doesn't flatten the rest
    const mags = vis.map(r => Math.abs(r.nrpl)).sort((a, b) => a - b);
    const cap = mags[Math.floor(mags.length * 0.96)] || Math.max(...mags, 1);
    return { vis, xDomain: [x0, x1], xTicks, yDomain: [-cap, cap], cur: all.at(-1) };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet, this fills in as the reconstruction runs.</div>;

  const cur = view.cur, up = cur.nrpl >= 0;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="When SPX6900 coins move, how much profit or loss is actually locked in?" accent={GRN}>
        Every week some coins change hands. This is the <strong style={{ color: "#e2e8f0" }}>dollar profit or loss</strong> baked into those moves -
        <strong style={{ color: GRN }}> green</strong> weeks are profit-taking, <strong style={{ color: RED }}>red</strong> weeks are losses realized (capitulation). SOPR tells you the direction; this tells you the size.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="last week" value={money(cur.nrpl)} color={up ? GRN : RED} sub={up ? "net profit-taking" : "net losses realized"} />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={GRN} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <ReferenceArea y1={0} y2={view.yDomain[1]} fill={GRN} fillOpacity={0.114} stroke="none" />
            <ReferenceArea y1={view.yDomain[0]} y2={0} fill={RED} fillOpacity={0.114} stroke="none" />
            <XAxis dataKey="ts" type="number" domain={view.xDomain} ticks={view.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view.yDomain} allowDataOverflow tickFormatter={v => money(v)}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 52 : 66} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.55)" />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="nrpl" isAnimationActive={false} name="Net realized P/L">
              {view.vis.map((d, i) => <Cell key={i} fill={d.nrpl >= 0 ? GRN : RED} />)}
            </Bar>
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: GRN }}>Net Realized Profit/Loss</strong>, realized value minus cost of the coins that moved each week, reconstructed on-chain from every lot&apos;s FIFO cost basis.
        Big green = profit-taking, big red = capitulation. A behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
