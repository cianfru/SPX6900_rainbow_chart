import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { loadCityHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fNum = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : Math.round(v).toString();
const NC_OF = d => d.labels.length;

// SPX City — the flow beneath the citizen count: who ARRIVED vs LEFT each period, how many of the
// original launch residents remain (survivorship), and the average resident's holding over time.
// The census (CityHistoryChart) shows the level; this shows the churn and the turnover.
export default function CityFlowChart({ isMobile, preview = false }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState("flow");   // "flow" | "founders" | "avg"
  useEffect(() => {
    let cancelled = false;
    loadCityHistory().then(d => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => {
    if (!data?.flow) return [];
    const NC = NC_OF(data);
    const byDate = new Map(data.rows.map(r => {
      let cTot = 0, vTot = 0;
      for (let i = 0; i < NC; i++) { cTot += r[2 + i]; vTot += r[2 + NC + i]; }
      return [r[0], { price: r[1], cTot, vTot }];
    }));
    const fdr = new Map((data.founders?.series || []).map(([d, v]) => [d, v]));
    return data.flow.map(([d, arr, dep]) => {
      const row = byDate.get(d) || { price: 0, cTot: 0, vTot: 0 };
      const avgTok = row.cTot ? (row.price ? row.vTot / row.price : 0) / row.cTot : 0;   // avg holding in SPX
      return { ts: Date.parse(d), arr, dep: -dep, net: arr - dep, founders: fdr.get(d) ?? null, avg: avgTok, ...row };
    }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  }, [data]);

  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => all.filter(r => r.ts >= a && r.ts <= b).length >= 2);

  const vw = useMemo(() => {
    if (all.length < 2) return null;
    const [x0, x1] = zoom ?? [all[0].ts, all.at(-1).ts];
    const vis = all.filter(r => r.ts >= x0 && r.ts <= x1);
    if (vis.length < 2) return null;
    const step = Math.max(1, Math.round(vis.length / 6));
    const xTicks = vis.filter((_, i) => i % step === 0 || i === vis.length - 1).map(r => r.ts);
    return { vis, xDomain: [x0, x1], xTicks };
  }, [all, zoom]);

  if (!vw) return <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 60 }}>City history is being built.</div>;

  const cur = all.at(-1);
  const n0 = data.founders?.n0 || 0;
  const foundersLeft = data.founders?.series?.at(-1)?.[1] ?? 0;
  const survPct = n0 ? foundersLeft / n0 * 100 : 0;
  const totIn = all.reduce((s, r) => s + r.arr, 0), totOut = all.reduce((s, r) => s - r.dep, 0);
  const accent = "#22d3ee", green = "#4ade80", red = "#f87171", amber = "#fbbf24";

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
        {view === "flow" && <>
          <div><span style={{ color: green }}>arrived</span>: <span style={{ fontFamily: MONO }}>{d.arr}</span></div>
          <div><span style={{ color: red }}>left</span>: <span style={{ fontFamily: MONO }}>{-d.dep}</span></div>
          <div><span style={{ color: "#e2e8f0" }}>net</span>: <span style={{ fontFamily: MONO }}>{d.net >= 0 ? "+" : ""}{d.net}</span></div>
        </>}
        {view === "founders" && d.founders != null && <div><span style={{ color: amber }}>launch residents left</span>: <span style={{ fontFamily: MONO }}>{d.founders} / {n0}</span></div>}
        {view === "avg" && <div><span style={{ color: accent }}>avg holding</span>: <span style={{ fontFamily: MONO }}>{fNum(d.avg)} SPX</span></div>}
        <div style={{ marginTop: 4, color: "#94a3b8" }}>SPX <span style={{ fontFamily: MONO }}>${d.price < 0.1 ? d.price.toFixed(4) : d.price.toFixed(3)}</span></div>
      </TipBox>
    );
  };

  const tbtn = active => ({
    padding: "5px 15px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer",
    border: "1px solid " + (active ? "rgba(34,211,238,0.55)" : "rgba(255,255,255,0.12)"),
    background: active ? "rgba(34,211,238,0.16)" : "transparent", color: active ? "#67e8f9" : "#94a3b8",
  });

  const explains = {
    flow: <Explain q="Is the city growing — and how much churn is underneath?" accent={green}>
      Each period&apos;s <strong style={{ color: green }}>arrivals</strong> (up) vs <strong style={{ color: red }}>departures</strong> (down). The count rose steadily, but the turnover beneath is huge:
      {" "}<strong style={{ color: "#e2e8f0" }}>{fNum(totIn)} wallets moved in</strong> over time and <strong style={{ color: "#e2e8f0" }}>{fNum(totOut)} moved out</strong>. A living city, not a static one.
    </Explain>,
    founders: <Explain q="How many of the original residents are still here?" accent={amber}>
      Of the <strong style={{ color: "#e2e8f0" }}>{n0.toLocaleString()} launch-week residents</strong>, only <strong style={{ color: amber }}>{foundersLeft} remain</strong> — about <strong style={{ color: amber }}>{survPct.toFixed(0)}%</strong>.
      {" "}The city today is almost entirely wallets who arrived <em>after</em> launch and held through the drawdown. Survivorship, not the launch crowd.
    </Explain>,
    avg: <Explain q="Is the average resident getting bigger?" accent={accent}>
      The <strong style={{ color: accent }}>average resident&apos;s holding</strong> in SPX over time — how concentrated the typical citizen is, independent of price. Rising = the base is accumulating; falling = new smaller wallets are diluting the average.
    </Explain>,
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {explains[view]}

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="arrived (all-time)" value={fNum(totIn)} color={green} />
        <Metric label="left (all-time)" value={fNum(totOut)} color={red} />
        <Metric label="launch residents left" value={`${foundersLeft} / ${n0}`} color={amber} sub={`${survPct.toFixed(0)}% survive`} />
        <div style={{ display: "flex", gap: 6 }}>
          <button style={tbtn(view === "flow")} onClick={() => setView("flow")}>Net new</button>
          <button style={tbtn(view === "founders")} onClick={() => setView("founders")}>Founders</button>
          <button style={tbtn(view === "avg")} onClick={() => setView("avg")}>Avg size</button>
        </div>
      </div>

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={accent} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={vw.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 4 : 14 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={vw.xDomain} ticks={vw.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" domain={view === "avg" ? [0, "auto"] : view === "founders" ? [0, "auto"] : ["auto", "auto"]} allowDataOverflow
              tickFormatter={fNum} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {view === "flow" && <>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
              <Bar dataKey="arr" fill={green} fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="dep" fill={red} fillOpacity={0.85} isAnimationActive={false} />
              <Line type="monotone" dataKey="net" stroke="#e2e8f0" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </>}
            {view === "founders" && <>
              <defs><linearGradient id="fdrfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={amber} stopOpacity={0.35} /><stop offset="100%" stopColor={amber} stopOpacity={0.02} /></linearGradient></defs>
              <Area type="monotone" dataKey="founders" stroke={amber} strokeWidth={2.4} fill="url(#fdrfill)" dot={false} isAnimationActive={false} connectNulls />
            </>}
            {view === "avg" && <>
              <defs><linearGradient id="avgfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={0.3} /><stop offset="100%" stopColor={accent} stopOpacity={0.02} /></linearGradient></defs>
              <Area type="monotone" dataKey="avg" stroke={accent} strokeWidth={2.4} fill="url(#avgfill)" dot={false} isAnimationActive={false} />
            </>}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: accent }}>City flow</strong> — the churn under the citizen count: {view === "flow" ? "wallets arriving (green) vs leaving (red) each period, with the net" : view === "founders" ? "how many of the launch-week residents are still here" : "the average resident's holding in SPX"}.
        {" "}A resident = ≥5,000 SPX held 90 days; ETH-native; infra excluded. Reconstructed from the balance timeline. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
