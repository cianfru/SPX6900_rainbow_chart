import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { BTC_HODL } from "./btc-hodl-waves.js";
import { loadOnchain } from "./history-data.js";
import { spxLiquidity, btcIlliquid } from "./liquidity.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const SPX = "#a78bfa", BTC = "#fb923c";
const DAY = 86400000, YR = 365.25;
const FWD = 730; // 24 months of "what Bitcoin did next" past SPX's current age

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const btc = d.btc ?? d.btcFwd;
  return (
    <TipBox title={`age ${(label / YR).toFixed(1)} yr`}>
      {d.spx != null && <div>SPX illiquid: <span style={{ fontFamily: MONO, color: SPX }}>{d.spx.toFixed(1)}%</span></div>}
      {btc != null && <div>BTC{d.btc == null ? " (ahead)" : ""} illiquid: <span style={{ fontFamily: MONO, color: BTC }}>{btc.toFixed(1)}%</span></div>}
    </TipBox>
  );
}

// Liquid vs Illiquid Supply, the Glassnode-aligned "how much supply is likely to actually move"
// metric. Illiquid = long-term holders held >155d; liquid = short-term holders + exchanges + LP.
// vs Bitcoin on the same method, aligned by age, then BTC carried 24 months forward. The reveal:
// at the same age SPX's supply is stickier than Bitcoin's was. A holder-behaviour position.
export default function FreeFloatChart({ isMobile, preview = false }) {
  const [oc, setOc] = useState(null);
  useEffect(() => { let off = false; loadOnchain().then(d => { if (!off && d) setOc(d); }); return () => { off = true; }; }, []);

  const { all, spxLastDay, curIlliq, btcSameAge, btcEnd } = useMemo(() => {
    const liq = spxLiquidity(oc || SPX_ONCHAIN);
    if (liq.length < 50) return { all: [], spxLastDay: 0, curIlliq: null, btcSameAge: null, btcEnd: null };
    const launch = liq[0].ts;
    const spxRows = liq.map(r => [Math.round((r.ts - launch) / DAY), r.illiqPct]);
    const spxLastDay = spxRows.at(-1)[0];
    const spxMap = new Map(spxRows);

    const btcS = btcIlliquid(BTC_HODL);
    const bt0 = btcS.length ? btcS[0].ts : 0;
    const btcRows = btcS.map(r => [Math.round((r.ts - bt0) / DAY), r.illiqPct]).filter(p => p[0] <= spxLastDay + FWD);
    const btcAt = day => { let b = btcRows[0]; for (const p of btcRows) if (Math.abs(p[0] - day) < Math.abs(b[0] - day)) b = p; return b[1]; };

    const all = btcRows.map(([day, v]) => ({
      day,
      spx: spxMap.has(day) ? spxMap.get(day) : null,
      btc: day <= spxLastDay ? v : null,
      btcFwd: day >= spxLastDay ? v : null,
    }));
    for (const [day, v] of spxRows) { const hit = all.find(r => Math.abs(r.day - day) <= 4); if (hit && hit.spx == null) hit.spx = v; }
    return { all, spxLastDay, curIlliq: spxRows.at(-1)[1], btcSameAge: btcAt(spxLastDay), btcEnd: btcAt(spxLastDay + FWD) };
  }, [oc]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.day >= a && r.day <= b).length >= 2);

  const view = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [0, all.at(-1).day];
    const vis = all.filter(r => r.day >= x0 && r.day <= x1);
    if (vis.length < 2) return null;
    const xTicks = [];
    for (let yr = 0; yr * YR <= x1 + 5; yr++) { const d = Math.round(yr * YR); if (d >= x0) xTicks.push(d); }
    return { vis, xDomain: [x0, x1], xTicks };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="How much of SPX6900's supply is actually likely to move?" accent={SPX}>
        <strong style={{ color: "#e2e8f0" }}>Illiquid</strong> = held by long-term holders (over 155 days, Glassnode&apos;s standard), unlikely to come to market. <strong style={{ color: "#e2e8f0" }}>Liquid</strong> = short-term holders + exchanges + LP.
        Not "locked" (self-custody can move any time) and not "free float" (~88% is technically tradable), this is the behaviour that matters. SPX is at <strong style={{ color: SPX }}>{curIlliq != null ? curIlliq.toFixed(0) : "-"}%</strong> illiquid; Bitcoin was <strong style={{ color: BTC }}>{btcSameAge != null ? btcSameAge.toFixed(0) : "-"}%</strong> at the same age. The <strong style={{ color: BTC }}>dashed line</strong> is Bitcoin&apos;s next 24 months.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 14 : 26, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SPX illiquid" value={curIlliq != null ? curIlliq.toFixed(0) + "%" : "-"} color={SPX} sub="held >155d, sticky" />
        <Metric label="BTC at same age" value={btcSameAge != null ? btcSameAge.toFixed(0) + "%" : "-"} color={BTC} sub="on the same measure" />
        <Metric label="BTC +24 months" value={btcEnd != null ? btcEnd.toFixed(0) + "%" : "-"} color={BTC} sub="what came next" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={SPX} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 30, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="ilfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SPX} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SPX} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" type="number" domain={view.xDomain} ticks={view.xTicks} allowDataOverflow
              tickFormatter={d => d === 0 ? "launch" : (d / YR).toFixed(0) + "yr"}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              label={{ value: "age since launch", position: "insideBottom", offset: -16, fill: "#7c879b", fontSize: 12, fontFamily: SANS }} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {spxLastDay > 0 && spxLastDay >= view.xDomain[0] && spxLastDay <= view.xDomain[1] && (
              <ReferenceLine x={spxLastDay} stroke="#e2e8f0" strokeDasharray="6 6" strokeOpacity={0.5}
                label={preview ? undefined : { value: "SPX today · Bitcoin's path ahead →", position: "insideTopRight", fill: "#cbd5e1", fontSize: 11.5, fontFamily: MONO }} />
            )}
            <Line type="monotone" dataKey="btc" stroke={BTC} strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} name="BTC" />
            <Line type="monotone" dataKey="btcFwd" stroke={BTC} strokeWidth={2.4} strokeDasharray="3 5" dot={false} connectNulls isAnimationActive={false} name="BTC ahead" />
            <Area type="monotone" dataKey="spx" stroke={SPX} strokeWidth={2.8} fill="url(#ilfill)" dot={false} connectNulls isAnimationActive={false} name="SPX" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={SPX} fill={SPX} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: SPX }}>Illiquid supply</strong>, coins held by long-term holders (over 155 days), unlikely to move; liquid = short-term holders + exchanges + LP.
        SPX vs <strong style={{ color: BTC }}>Bitcoin</strong> on the same on-chain method, aligned by age; the dashed line carries Bitcoin 24 months past SPX&apos;s current age. At the same age SPX is stickier than Bitcoin was. A holder-behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
