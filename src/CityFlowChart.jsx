import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Area, Bar, Line, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { loadCityHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fNum = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : Math.round(v).toString();
const NC_OF = d => d.labels.length;

// SPX City, the flow beneath the citizen count: who ARRIVED vs LEFT each period, the per-arrival-cohort
// survivorship (Survival view), and the median/mean resident holding over time (Per resident view).
// The census (CityHistoryChart) shows the level; this shows the churn and the turnover.
//
// NOTE: a "Founders / launch residents" view was removed, residency requires ≥5,000 SPX held for 90
// DAYS, which nothing can satisfy in the launch week (the token is 0 days old), so the cohort was
// empty-by-construction (n0=1, degenerate). The Survival view carries the "launch crowd is nearly gone"
// story honestly instead, with its right-censoring caveat. The builder still emits `founders`; unused.
export default function CityFlowChart({ isMobile, preview = false, initialView }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => ["flow", "percap", "survival"].includes(initialView) ? initialView : "flow");   // "flow" | "percap" | "survival"
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
    const med = new Map((data.perCapita || []).map(([d, v]) => [d, v]));
    return data.flow.map(([d, arr, dep]) => {
      const row = byDate.get(d) || { price: 0, cTot: 0, vTot: 0 };
      const meanTok = row.cTot ? (row.price ? row.vTot / row.price : 0) / row.cTot : 0;   // mean holding in SPX
      const medTok = med.get(d) ?? null;                                                   // median holding in SPX
      return { ts: Date.parse(d), arr, dep: -dep, net: arr - dep, mean: meanTok, med: medTok, ...row };
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
  const totIn = all.reduce((s, r) => s + r.arr, 0), totOut = all.reduce((s, r) => s - r.dep, 0);
  const accent = "#22d3ee", green = "#4ade80", red = "#f87171", amber = "#fbbf24", violet = "#c084fc";
  const medNow = cur?.med ?? 0, medUsd = medNow * (cur?.price || 0);
  const med0 = all.find(r => r.med != null)?.med ?? 0;
  const vintages = (data.vintages || []).filter(v => v.arrived >= 20);   // drop tiny buckets from the noise
  const survColor = p => p >= 50 ? green : p >= 25 ? amber : red;
  const isSurvival = view === "survival";

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    if (isSurvival) return (
      <TipBox title={d.label}>
        <div><span style={{ color: survColor(d.pct) }}>still here</span>: <span style={{ fontFamily: MONO }}>{d.stillHere} / {d.arrived}</span></div>
        <div><span style={{ color: "#94a3b8" }}>survival</span>: <span style={{ fontFamily: MONO }}>{d.pct.toFixed(1)}%</span></div>
      </TipBox>
    );
    return (
      <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
        {view === "flow" && <>
          <div><span style={{ color: green }}>arrived</span>: <span style={{ fontFamily: MONO }}>{d.arr}</span></div>
          <div><span style={{ color: red }}>left</span>: <span style={{ fontFamily: MONO }}>{-d.dep}</span></div>
          <div><span style={{ color: "#e2e8f0" }}>net</span>: <span style={{ fontFamily: MONO }}>{d.net >= 0 ? "+" : ""}{d.net}</span></div>
        </>}
        {view === "percap" && <>
          <div><span style={{ color: violet }}>median</span>: <span style={{ fontFamily: MONO }}>{d.med != null ? fNum(d.med) : "-"} SPX</span></div>
          <div><span style={{ color: accent }}>mean</span>: <span style={{ fontFamily: MONO }}>{fNum(d.mean)} SPX</span></div>
        </>}
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
    flow: <Explain q="Is the city growing, and how much churn is underneath?" accent={green}>
      Each period&apos;s <strong style={{ color: green }}>arrivals</strong> (up) vs <strong style={{ color: red }}>departures</strong> (down). The count rose steadily, but the turnover beneath is huge:
      {" "}<strong style={{ color: "#e2e8f0" }}>{fNum(totIn)} wallets moved in</strong> over time and <strong style={{ color: "#e2e8f0" }}>{fNum(totOut)} moved out</strong>. A living city, not a static one.
    </Explain>,
    percap: <Explain q="Is the typical resident a whale or retail?" accent={violet}>
      The <strong style={{ color: violet }}>median</strong> resident holds about <strong style={{ color: violet }}>{fNum(medNow)} SPX</strong> today, down from <strong style={{ color: "#e2e8f0" }}>{fNum(med0)}</strong> at launch. The city <strong style={{ color: "#e2e8f0" }}>broadened from a handful of whales into a retail base</strong>.
      {" "}The <strong style={{ color: accent }}>mean</strong> sits far above the median, a few big wallets pull it up. In dollars the median resident is still worth ~<strong style={{ color: green }}>${Math.round(medUsd).toLocaleString()}</strong>.
    </Explain>,
    survival: <Explain q="Who's still here, by when they arrived?" accent={green}>
      Of every wallet that became a resident in a given quarter, the share <strong style={{ color: green }}>still resident today</strong>. The <strong style={{ color: red }}>launch crowd is nearly gone</strong> ({vintages[0]?.pct.toFixed(0)}%); each later cohort reads higher -
      {" "}partly real conviction, partly <strong style={{ color: "#e2e8f0" }}>right-censoring</strong> (recent arrivals simply haven&apos;t had time to leave yet).
    </Explain>,
  };

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {explains[view]}

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="arrived (all-time)" value={fNum(totIn)} color={green} />
        <Metric label="left (all-time)" value={fNum(totOut)} color={red} />
        <Metric label="median resident" value={`${fNum(medNow)} SPX`} color={violet} sub={`~$${Math.round(medUsd).toLocaleString()}`} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={tbtn(view === "flow")} onClick={() => setView("flow")}>Net new</button>
          <button style={tbtn(view === "percap")} onClick={() => setView("percap")}>Per resident</button>
          <button style={tbtn(view === "survival")} onClick={() => setView("survival")}>Survival</button>
        </div>
      </div>

      {!isSurvival && <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={accent} />}

      <div style={{ position: "relative" }}>
        {!preview && !isSurvival && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          {isSurvival ? (
            <BarChart data={vintages} margin={{ top: 20, right: isMobile ? 8 : 20, bottom: 40, left: isMobile ? 4 : 14 }}>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: isMobile ? 9 : 12, fontFamily: MONO }} interval={0} angle={-32} textAnchor="end" height={54}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
              <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => v + "%"}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 40 : 52} />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
              <Bar dataKey="pct" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {vintages.map((v, i) => <Cell key={i} fill={survColor(v.pct)} fillOpacity={0.9} />)}
              </Bar>
            </BarChart>
          ) : (
          <ComposedChart data={vw.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 4 : 14 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={vw.xDomain} ticks={vw.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis type="number" scale={view === "percap" ? "log" : "linear"}
              domain={view === "percap" ? [1000, "auto"] : ["auto", "auto"]} allowDataOverflow
              tickFormatter={fNum} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 44 : 56} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {view === "flow" && <>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
              <Bar dataKey="arr" fill={green} fillOpacity={0.85} isAnimationActive={false} />
              <Bar dataKey="dep" fill={red} fillOpacity={0.85} isAnimationActive={false} />
              <Line type="monotone" dataKey="net" stroke="#e2e8f0" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </>}
            {view === "percap" && <>
              <Line type="monotone" dataKey="mean" stroke={accent} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls name="mean" />
              <Line type="monotone" dataKey="med" stroke={violet} strokeWidth={2.8} dot={false} isAnimationActive={false} connectNulls name="median" />
            </>}
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: accent }}>City flow</strong>, {view === "flow" ? "wallets arriving (green) vs leaving (red) each period, with the net" : view === "percap" ? "the median resident's holding in SPX (mean dashed), the base broadened from whales to retail" : "the share of each arrival quarter still resident today (recent cohorts read high, right-censored)"}.
        {" "}A resident = ≥5,000 SPX held 90 days; ETH-native; infra excluded. Reconstructed from the balance timeline.{isSurvival ? "" : " Drag to zoom."} Not financial advice.
      </div>
    </div>
  );
}
