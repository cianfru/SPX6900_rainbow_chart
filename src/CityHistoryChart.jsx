import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from "recharts";
import { loadCityHistory } from "./history-data.js";
import ChartZoomHint from "./ChartZoomHint.jsx";
import { SANS, MONO, MAX_W, Metric, TipBox, ZoomBar, Explain } from "./chart-ui.jsx";
import { useDragZoom } from "./use-drag-zoom.js";

const fShort = t => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fUsd = v => v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "k" : "$" + Math.round(v);
const fNum = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toString();

// Δ helper: current vs a point `back` rows ago → "+N (+X%)" coloured by sign.
function delta(rows, idx, back, pick) {
  const j = idx - back; if (j < 0) return null;
  const now = pick(rows[idx]), then = pick(rows[j]);
  const d = now - then, pct = then ? d / then * 100 : 0;
  return { d, pct, up: d >= 0 };
}

// SPX City — how the whale city grew over time: INHABITANTS (wallets ≥100k SPX) and the city's
// TVL (Σ balance × SPX price), both split by the four size cohorts. The point: the citizen count
// and the value kept rising through the price drawdown — adoption decoupled from price.
export default function CityHistoryChart({ isMobile, preview = false, initialView }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => ["citizens", "value", "skyline"].includes(initialView) ? initialView : "citizens");   // "citizens" | "value" | "skyline"
  useEffect(() => {
    let cancelled = false;
    loadCityHistory().then(d => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const NC = data?.labels?.length ?? 4;
  const SN = data?.skylineLabels?.length ?? 0;
  const cohorts = useMemo(
    () => (data?.labels ?? []).map((label, i) => ({ label, c: data.colors[i], ck: "c" + i, vk: "v" + i })),
    [data]);
  // building-type tiers, drawn bottom→top (low-rise base → glass tower crown) = reverse of the data order
  const tiers = useMemo(
    () => (data?.skylineLabels ?? []).map((label, i) => ({ label, c: data.skylineColors[i], sk: "s" + i })).reverse(),
    [data]);

  // rows: [date, price, c0..c5 (counts), v0..v5 (TVL usd)]; skyline: [date, s0..s3] (parallel by index)
  const all = useMemo(() => {
    if (!data) return [];
    const sky = data.skyline || [];
    return data.rows.map((r, idx) => {
      const o = { ts: Date.parse(r[0]), price: r[1], cTot: 0, vTot: 0, sTot: 0 };
      for (let i = 0; i < NC; i++) { o["c" + i] = r[2 + i]; o["v" + i] = r[2 + NC + i]; o.cTot += r[2 + i]; o.vTot += r[2 + NC + i]; }
      const s = sky[idx];
      for (let i = 0; i < SN; i++) { o["s" + i] = s ? s[1 + i] : 0; o.sTot += o["s" + i]; }
      return o;
    }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  }, [data, NC, SN]);

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

  const isCit = view === "citizens", isSky = view === "skyline";
  const stackKey = isCit ? "c" : "v";
  const accent = "#22d3ee";
  const towerNow = all[all.length - 1]?.s0 ?? 0;   // s0 = glass towers (data order: tower first)
  const lastIdx = all.length - 1;
  const daily = data.res === "daily";
  const wBack = daily ? 7 : 1, mBack = daily ? 30 : 4;
  const cur = all[lastIdx], first = all[0];
  const dCitW = delta(all, lastIdx, wBack, r => r.cTot), dCitM = delta(all, lastIdx, mBack, r => r.cTot);
  const dTvlW = delta(all, lastIdx, wBack, r => r.vTot), dTvlM = delta(all, lastIdx, mBack, r => r.vTot);
  const dW = isCit ? dCitW : dTvlW, dM = isCit ? dCitM : dTvlM;
  // Growth is baselined on the city's FORMATION (first row ≥500 residents), NOT the launch row: a resident
  // needs ≥5,000 SPX held 90 DAYS, so the launch weeks are near-empty (cTot≈1) and a "since launch ×" reads a
  // nonsense ~5,000×. The first ≥500 point (~late 2023, once 90-day residency matured) is the honest anchor.
  const baseRow = all.find(r => r.cTot >= 500) || first;
  const growthCit = baseRow.cTot ? cur.cTot / baseRow.cTot : 0;
  const baseLabel = new Date(baseRow.ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const fmt = (isCit || isSky) ? fNum : fUsd;

  const signed = (dd) => (dd.up ? "+" : "−") + fmt(Math.abs(dd.d));
  const dChip = (dd) => dd ? <span style={{ color: dd.up ? "#4ade80" : "#f87171" }}>{signed(dd)} ({dd.up ? "+" : "−"}{Math.abs(dd.pct).toFixed(1)}%)</span> : null;

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const total = isCit ? d.cTot : isSky ? d.sTot : d.vTot;
    return (
      <TipBox title={new Date(d.ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}>
        <div style={{ marginBottom: 4 }}><span style={{ color: accent }}>{isCit ? "citizens" : isSky ? "buildings" : "TVL"}</span>: <span style={{ fontFamily: MONO }}>{fmt(total)}</span></div>
        {(isSky ? tiers.slice().reverse() : cohorts.slice().reverse()).map(e => (
          <div key={e.sk || e.ck}><span style={{ color: e.c }}>{e.label}</span>: <span style={{ fontFamily: MONO }}>{isSky ? d[e.sk] : isCit ? d[e.ck] : fUsd(d[e.vk])}</span></div>
        ))}
        <div style={{ marginTop: 4, color: "#94a3b8" }}>SPX <span style={{ fontFamily: MONO }}>${d.price < 0.1 ? d.price.toFixed(4) : d.price.toFixed(3)}</span></div>
      </TipBox>
    );
  };

  const tbtn = active => ({
    padding: "5px 16px", borderRadius: 8, fontFamily: SANS, fontSize: 13, cursor: "pointer",
    border: "1px solid " + (active ? "rgba(34,211,238,0.55)" : "rgba(255,255,255,0.12)"),
    background: active ? "rgba(34,211,238,0.16)" : "transparent", color: active ? "#67e8f9" : "#94a3b8",
  });

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      {isSky ? (
        <Explain q="What does the skyline look like — and how has it changed?" accent="#38bdf8">
          Every resident is a building whose <strong style={{ color: "#e2e8f0" }}>height = holdings × how long it&apos;s held</strong> (relative to the biggest) — the same rule the 3D city uses, so this matches the towers you see.
          {" "}As the base broadened, the city <strong style={{ color: "#c2764f" }}>sprawled outward in brick</strong>: <strong style={{ color: "#38bdf8" }}>{towerNow} glass towers</strong> still crown a city that&apos;s now mostly low-rise.
        </Explain>
      ) : (
        <Explain q="Has the city grown while the price fell?" accent={accent}>
          A <strong style={{ color: "#e2e8f0" }}>citizen</strong> is any wallet that&apos;s held <strong style={{ color: "#e2e8f0" }}>≥5,000 SPX for 90 days</strong> — SPX City&apos;s residency. The <strong style={{ color: accent }}>citizen count</strong> and the city&apos;s <strong style={{ color: "#a3e635" }}>total value</strong> have
          {" "}<strong style={{ color: "#4ade80" }}>climbed through the drawdown</strong> — new residents kept arriving while the price round-tripped. Adoption decoupled from price.
        </Explain>
      )}

      <div style={{ display: "flex", gap: isMobile ? 16 : 30, justifyContent: "center", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="citizens" value={fNum(cur.cTot)} color={accent} sub={dCitM ? `${dCitM.up ? "+" : "−"}${Math.abs(Math.round(dCitM.d))} / mo` : null} />
        <Metric label="city TVL" value={fUsd(cur.vTot)} color="#a3e635" sub={dTvlM ? `${dTvlM.up ? "+" : "−"}${Math.abs(dTvlM.pct).toFixed(0)}% / mo` : null} />
        {isSky
          ? <Metric label="glass towers" value={fNum(towerNow)} color="#38bdf8" sub={`of ${fNum(cur.sTot)} buildings`} />
          : <Metric label={`citizens since ${baseLabel}`} value={growthCit >= 2 ? growthCit.toFixed(1) + "×" : "+" + Math.round((growthCit - 1) * 100) + "%"} color="#f8fafc" sub="grew through the drawdown" />}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={tbtn(isCit)} onClick={() => setView("citizens")}>Citizens</button>
          <button style={tbtn(view === "value")} onClick={() => setView("value")}>Value</button>
          <button style={tbtn(isSky)} onClick={() => setView("skyline")}>Skyline</button>
        </div>
      </div>

      {!isSky && (
        <div style={{ textAlign: "center", fontFamily: SANS, fontSize: 12.5, color: "#94a3b8", marginBottom: 6 }}>
          {isCit ? "citizens" : "TVL"} last week: {dChip(dW)} · last month: {dChip(dM)}
        </div>
      )}

      <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent={accent} />

      <div style={{ position: "relative" }}>
        {!preview && <ChartZoomHint />}
        <ResponsiveContainer width="100%" height={isMobile ? 400 : 560}>
          <ComposedChart data={vw.vis} margin={{ top: 10, right: isMobile ? 8 : 20, bottom: 24, left: isMobile ? 4 : 16 }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
            <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="ts" type="number" domain={vw.xDomain} ticks={vw.xTicks} scale="time" allowDataOverflow
              tickFormatter={fShort} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
            <YAxis yAxisId="L" type="number" domain={[0, "auto"]} allowDataOverflow
              tickFormatter={fmt} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 48 : 62} />
            <YAxis yAxisId="P" orientation="right" scale="log" domain={["auto", "auto"]} allowDataOverflow
              tickFormatter={v => "$" + (v < 0.1 ? v.toFixed(3) : v.toFixed(2))} tick={{ fill: "#64748b", fontSize: isMobile ? 9 : 11, fontFamily: MONO }}
              axisLine={false} tickLine={false} width={isMobile ? 42 : 54} />
            <Tooltip content={<Tip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
            {isSky
              ? tiers.map(t => (
                <Area key={t.sk} yAxisId="L" type="monotone" dataKey={t.sk} stackId="1" stroke={t.c} strokeWidth={0.5}
                  fill={t.c} fillOpacity={0.85} dot={false} isAnimationActive={false} name={t.label} />
              ))
              : cohorts.map(co => (
                <Area key={co.ck} yAxisId="L" type="monotone" dataKey={stackKey + co.ck.slice(1)} stackId="1" stroke={co.c} strokeWidth={0.5}
                  fill={co.c} fillOpacity={0.8} dot={false} isAnimationActive={false} name={co.label} />
              ))}
            <Line yAxisId="P" type="monotone" dataKey="price" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="5 4" dot={false} isAnimationActive={false} name="SPX price" />
            {selL != null && selR != null && selL !== selR && (
              <ReferenceArea yAxisId="L" x1={selL} x2={selR} strokeOpacity={0.4} stroke="#e2e8f0" fill="#e2e8f0" fillOpacity={0.1} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption" style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.65, maxWidth: 900, marginInline: "auto" }}>
        <strong style={{ color: accent }}>City growth</strong> — {isSky ? "residents by building type — glass tower / concrete mid-rise / masonry / low-rise — assigned by the same height rule (holdings × hold time, relative to the biggest) the 3D city uses" : isCit ? "wallets that have held ≥5,000 SPX for 90 days (SPX City residents), stacked by size cohort" : "the USD value of every resident wallet (balance × SPX price), stacked by size cohort"}, with the SPX price (dashed, right axis) for context.
        {" "}ETH-native, infra excluded. Reconstructed from the weekly balance timeline — the live city counts a touch fewer via finer per-lot ages. Drag to zoom. Not financial advice.
      </div>
    </div>
  );
}
