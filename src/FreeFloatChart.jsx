import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { SPX_ONCHAIN } from "./spx-onchain.js";
import { BTC_HODL } from "./btc-hodl-waves.js";
import { loadOnchain } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const SPX = "#fbbf24", BTC = "#fb923c";
const DAY = 86400000, YR = 365.25;
const FWD = 730; // 24 months of "what Bitcoin did next" past SPX's current age

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const btc = d.btc ?? d.btcFwd;
  return (
    <TipBox title={`age ${(label / YR).toFixed(1)} yr`}>
      {d.spx != null && <div>SPX: <span style={{ fontFamily: MONO, color: SPX }}>{d.spx.toFixed(1)}%</span></div>}
      {btc != null && <div>BTC{d.btc == null ? " (ahead)" : ""}: <span style={{ fontFamily: MONO, color: BTC }}>{btc.toFixed(1)}%</span></div>}
    </TipBox>
  );
}

// Free Float — share of supply that's actually LIQUID (moved in the last ~6 months) vs age
// since launch. SPX6900 from our on-chain HODL age bands vs Bitcoin on the SAME definition
// (free BigQuery UTXO reconstruction), aligned by age — then Bitcoin carried 24 months FORWARD
// past SPX's current age to show what it did next. A holder-behaviour position, not a signal.
export default function FreeFloatChart({ isMobile, preview = false }) {
  const [oc, setOc] = useState(null);
  useEffect(() => {
    let off = false;
    loadOnchain().then(d => { if (!off && d) setOc(d); });
    return () => { off = true; };
  }, []);

  const { all, spxLastDay, curFF, btcSameAge, btcEnd } = useMemo(() => {
    const src = (oc || SPX_ONCHAIN).filter(r => Array.isArray(r.age) && r.age.length === 5 && r.d);
    if (!src.length) return { all: [], spxLastDay: 0, curFF: null, btcSameAge: null, btcEnd: null };
    const launch = Date.parse(src[0].d);
    const spxRows = src.map(r => [Math.round((Date.parse(r.d) - launch) / DAY), 100 - (r.age[3] + r.age[4])]);
    const spxLastDay = spxRows.at(-1)[0];
    const spxMap = new Map(spxRows);

    const bt0 = Date.parse(BTC_HODL[0][0]);
    const btcRows = BTC_HODL.map(r => [Math.round((Date.parse(r[0]) - bt0) / DAY), 100 - (r[1][3] + r[1][4])])
      .filter(p => p[0] <= spxLastDay + FWD);
    const btcAt = day => { let b = btcRows[0]; for (const p of btcRows) if (Math.abs(p[0] - day) < Math.abs(b[0] - day)) b = p; return b[1]; };

    // one row per BTC sample day (BTC is the denser grid); SPX filled where present.
    const all = btcRows.map(([day, v]) => ({
      day,
      spx: spxMap.has(day) ? spxMap.get(day) : null,
      btc: day <= spxLastDay ? v : null,      // solid: same-age comparison
      btcFwd: day >= spxLastDay ? v : null,   // dashed: Bitcoin's future path
    }));
    // ensure SPX endpoint lands on the grid (BTC and SPX weeks don't align exactly)
    for (const [day, v] of spxRows) {
      const hit = all.find(r => Math.abs(r.day - day) <= 4);
      if (hit && hit.spx == null) hit.spx = v;
    }
    return { all, spxLastDay, curFF: spxRows.at(-1)[1], btcSameAge: btcAt(spxLastDay), btcEnd: btcAt(spxLastDay + FWD) };
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
    const vals = vis.flatMap(r => [r.spx, r.btc, r.btcFwd].filter(v => v != null));
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 8) / 10) * 10);
    return { vis, xDomain: [x0, x1], xTicks, yLo: lo };
  }, [all, zoom]);

  if (!view) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>Not enough on-chain data yet.</div>;

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <Explain q="Is SPX6900's supply tighter than Bitcoin's was at the same age?" accent={SPX}>
        Free float = the share of supply that <strong style={{ color: "#e2e8f0" }}>changed hands in the last 6 months</strong>. Both measured the same way, on-chain, aligned by age since launch.
        SPX is at <strong style={{ color: SPX }}>{curFF != null ? curFF.toFixed(0) : "—"}%</strong>; Bitcoin was <strong style={{ color: BTC }}>{btcSameAge != null ? btcSameAge.toFixed(0) : "—"}%</strong> at the same age. The <strong style={{ color: BTC }}>dashed line</strong> is what Bitcoin did over the next 24 months from here.
      </Explain>
      <div style={{ display: "flex", gap: isMobile ? 14 : 26, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Metric label="SPX free float" value={curFF != null ? curFF.toFixed(0) + "%" : "—"} color={SPX} sub="liquid — moved in 6mo" />
        <Metric label="BTC at same age" value={btcSameAge != null ? btcSameAge.toFixed(0) + "%" : "—"} color={BTC} sub="on the same measure" />
        <Metric label="BTC +24 months" value={btcEnd != null ? btcEnd.toFixed(0) + "%" : "—"} color={BTC} sub="what came next" />
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={SPX} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={view.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 30, left: isMobile ? 0 : 12 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <defs>
              <linearGradient id="fffill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SPX} stopOpacity={0.14} />
                <stop offset="100%" stopColor={SPX} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="day" type="number" domain={view.xDomain} ticks={view.xTicks} allowDataOverflow
              tickFormatter={d => d === 0 ? "launch" : (d / YR).toFixed(0) + "yr"}
              tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false}
              label={{ value: "age since launch", position: "insideBottom", offset: -16, fill: "#7c879b", fontSize: 12, fontFamily: SANS }} />
            <YAxis type="number" domain={[view.yLo, 100]} allowDataOverflow
              tickFormatter={v => v + "%"} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {spxLastDay > 0 && spxLastDay >= view.xDomain[0] && spxLastDay <= view.xDomain[1] && (
              <ReferenceLine x={spxLastDay} stroke="#e2e8f0" strokeDasharray="6 6" strokeOpacity={0.5}
                label={preview ? undefined : { value: "SPX today · Bitcoin's path ahead →", position: "insideTopRight", fill: "#cbd5e1", fontSize: 11.5, fontFamily: MONO }} />
            )}
            <Line type="monotone" dataKey="btc" stroke={BTC} strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} name="BTC" />
            <Line type="monotone" dataKey="btcFwd" stroke={BTC} strokeWidth={2.4} strokeDasharray="3 5" dot={false} connectNulls isAnimationActive={false} name="BTC ahead" />
            <Area type="monotone" dataKey="spx" stroke={SPX} strokeWidth={2.8} fill="url(#fffill)" dot={false} connectNulls isAnimationActive={false} name="SPX" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke={SPX} fill={SPX} fillOpacity={0.12} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: SPX }}>Free float</strong> — share of supply that changed hands in the last 6 months, by age since launch.
        SPX6900 from on-chain HODL age bands vs <strong style={{ color: BTC }}>Bitcoin</strong> on the same definition (free BigQuery UTXO reconstruction), aligned by age. The dashed line carries Bitcoin 24 months past SPX&apos;s current age — what it did next. A holder-behaviour position, not a signal. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
