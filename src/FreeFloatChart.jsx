import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { loadOnchain, loadFreeFloatPeers } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const SPX = "#fbbf24", BTC = "#fb923c", ETH = "#3b82f6";
const DAY = 86400000;

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox title={`day ${label}`}>
      {d.spx != null && <div>SPX: <span style={{ fontFamily: MONO, color: SPX }}>{d.spx.toFixed(1)}%</span></div>}
      {d.btc != null && <div>BTC: <span style={{ fontFamily: MONO, color: BTC }}>{d.btc.toFixed(1)}%</span></div>}
      {d.eth != null && <div>ETH: <span style={{ fontFamily: MONO, color: ETH }}>{d.eth.toFixed(1)}%</span></div>}
    </TipBox>
  );
}

// Free Float — share of supply that's actually LIQUID (moved in the last ~6 months) vs
// days since inception. SPX6900 from our on-chain HODL age bands; BTC/ETH from Coin Metrics
// active-supply on the SAME definition (once the freefloat-peers workflow has run). A
// consistent, citeable comparison — a holder-behaviour position, not a signal.
export default function FreeFloatChart({ isMobile, preview = false }) {
  const [oc, setOc] = useState(null);
  const [peers, setPeers] = useState({ btc: [], eth: [] });
  useEffect(() => {
    let off = false;
    loadOnchain().then(d => { if (!off && d) setOc(d); });
    loadFreeFloatPeers().then(d => { if (!off && d) setPeers(d); });
    return () => { off = true; };
  }, []);

  const { all, multi, curFF } = useMemo(() => {
    const src = (oc || SPX_ONCHAIN).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
    if (!src.length) return { all: [], multi: false, curFF: null };
    const launch = Date.parse(src[0].d);
    const spxMap = new Map(src.map(r => [Math.round((Date.parse(r.d) - launch) / DAY), 100 - (r.age[3] + r.age[4])]));
    const btc = Array.isArray(peers.btc) ? peers.btc : [], eth = Array.isArray(peers.eth) ? peers.eth : [];
    const multi = btc.length > 20 && eth.length > 20;
    const btcMap = new Map(btc.map(p => [p[0], p[1]])), ethMap = new Map(eth.map(p => [p[0], p[1]]));
    const days = [...new Set([...spxMap.keys(), ...btcMap.keys(), ...ethMap.keys()])].sort((a, b) => a - b);
    const all = days.map(day => ({ day, spx: spxMap.get(day) ?? null, btc: btcMap.get(day) ?? null, eth: ethMap.get(day) ?? null }));
    const spxRows = [...spxMap.entries()].sort((a, b) => a[0] - b[0]);
    return { all, multi, curFF: spxRows.at(-1)?.[1] ?? null };
  }, [oc, peers]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.day >= a && r.day <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const fullX = [0, all.at(-1).day];
    const [x0, x1] = zoom ?? fullX;
    const vis = all.filter(r => r.day >= x0 && r.day <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round((x1 - x0) / 6));
    const xTicks = [];
    for (let d = Math.ceil(x0 / step) * step; d <= x1; d += step) xTicks.push(d);
    const lo = Math.max(0, Math.floor((Math.min(...vis.flatMap(r => [r.spx, r.btc, r.eth].filter(v => v != null))) - 8) / 10) * 10);
    return { vis, xDomain: [x0, x1], xTicks, yLo: lo };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  const btcCur = multi ? all.filter(r => r.btc != null).at(-1)?.btc : null;
  const ethCur = multi ? all.filter(r => r.eth != null).at(-1)?.eth : null;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: isMobile ? 14 : 26, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SPX free float" value={curFF != null ? curFF.toFixed(1) + "%" : "—"} color={SPX} sub="liquid — moved in 6mo" />
        {multi && <Metric label="BTC" value={btcCur != null ? btcCur.toFixed(1) + "%" : "—"} color={BTC} sub="at ~current age" />}
        {multi && <Metric label="ETH" value={ethCur != null ? ethCur.toFixed(1) + "%" : "—"} color={ETH} sub="at ~current age" />}
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={SPX} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 30, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="fffill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SPX} stopOpacity={multi ? 0.12 : 0.32} />
                <stop offset="100%" stopColor={SPX} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" type="number" domain={view.xDomain} ticks={view.xTicks} allowDataOverflow
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              label={{ value: "days since inception", position: "insideBottom", offset: -16, fill: "#7c879b", fontSize: 12, fontFamily: SANS }} />
            <YAxis type="number" domain={[view.yLo, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {multi && <Line type="monotone" dataKey="btc" stroke={BTC} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} name="BTC" />}
            {multi && <Line type="monotone" dataKey="eth" stroke={ETH} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} name="ETH" />}
            <Area type="monotone" dataKey="spx" stroke={SPX} strokeWidth={2.8} fill="url(#fffill)" dot={false} connectNulls isAnimationActive={false} name="SPX" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={SPX} fill={SPX} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: SPX }}>Free float</strong> — share of supply that changed hands in the last 6 months, vs days since inception.
        {multi
          ? <> SPX from on-chain HODL age bands; <strong style={{ color: BTC }}>BTC</strong>/<strong style={{ color: ETH }}>ETH</strong> from Coin Metrics active supply — same definition, fully citeable.</>
          : <> From the on-chain HODL age bands (public Ethereum transfers). BTC &amp; ETH appear once the peer data is banked.</>}
        {" "}A holder-behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
