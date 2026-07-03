import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { fetchMajors } from "./data.js";
import { LIVE_DATA_DOWN } from "./history-data.js";
import { SANS, MONO, MAX_W, TipBox, ZoomBar } from "./chart-ui.jsx";
import { useDragZoom, timeWindow } from "./use-drag-zoom.js";

const fMon = ts => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function makeLookup(asset) {
  const sorted = [...asset].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map(a => a.date);
  return d => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? sorted[ans].price : null;
  };
}

function alignRatio(spx, asset) {
  const at = makeLookup(asset);
  const out = [];
  for (const s of spx) { const p = at(s.date); if (p > 0) out.push({ date: s.date, price: s.price / p }); }
  return out;
}

// SPX performance vs an equal-weight basket of the majors, rebased to the first common date.
function alignBasket(spx, majors) {
  const syms = Object.keys(majors);
  const lookups = syms.map(k => makeLookup(majors[k]));
  const out = [];
  let baseSpx = null;
  const baseAsset = [];
  for (const s of spx) {
    const vals = lookups.map(fn => fn(s.date));
    if (vals.some(v => !v || v <= 0)) continue;
    if (baseSpx == null) { baseSpx = s.price; vals.forEach((v, i) => { baseAsset[i] = v; }); }
    const basketNorm = vals.reduce((sum, v, i) => sum + v / baseAsset[i], 0) / syms.length;
    out.push({ date: s.date, price: (s.price / baseSpx) / basketNorm });
  }
  return out;
}

const OPTIONS = [["BTC", "vs BTC"], ["ETH", "vs ETH"], ["SOL", "vs SOL"], ["BASKET", "vs Majors"]];
const verdictZ = z => (z <= -1 ? ["Cheap", "#4ade80"] : z >= 1 ? ["Expensive", "#f87171"] : ["Fair", "#94a3b8"]);
const verdictP = p => (p <= 25 ? ["Cheap", "#4ade80"] : p >= 75 ? ["Expensive", "#f87171"] : ["Fair", "#94a3b8"]);

function OscTip({ active, payload, label, metric }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const [verdict, vcolor] = metric === "z" ? verdictZ(d.z) : verdictP(d.pct);
  return (
    <TipBox style={{ border: `1px solid ${vcolor}80`, padding: "11px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
        {new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: "#f8fafc" }}>
        {metric === "z" ? (d.z >= 0 ? "+" : "") + d.z.toFixed(2) + "σ" : Math.round(d.pct) + "th pct"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: vcolor, marginTop: 2 }}>● {verdict}</div>
    </TipBox>
  );
}

export default function RelativeChart({ series, isMobile, which, setWhich }) {
  const [majors, setMajors] = useState(null);
  const [status, setStatus] = useState("loading");
  const [metric, setMetric] = useState("z"); // "z" | "pct"

  useEffect(() => {
    let cancelled = false;
    fetchMajors()
      .then(p => { if (!cancelled) { setMajors(p); setStatus("ok"); } })
      .catch(e => { if (!cancelled) setStatus(e.message || "failed"); });
    return () => { cancelled = true; };
  }, []);

  const ratioSeries = useMemo(() => {
    if (!majors) return [];
    if (which === "BASKET") return alignBasket(series, majors);
    return majors[which] ? alignRatio(series, majors[which]) : [];
  }, [series, majors, which]);

  const data = useMemo(() => {
    if (ratioSeries.length < 10) return [];
    const lnv = ratioSeries.map(d => Math.log(d.price));
    const n = lnv.length;
    const mean = lnv.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(lnv.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 1;
    const sortedP = [...ratioSeries.map(d => d.price)].sort((a, b) => a - b);
    const pctOf = v => {
      let lo = 0, hi = sortedP.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (sortedP[m] <= v) lo = m + 1; else hi = m; }
      return (lo / sortedP.length) * 100;
    };
    return ratioSeries.map((d, i) => ({
      date: d.date, ts: new Date(d.date).getTime(), ratio: d.price,
      z: (lnv[i] - mean) / std, pct: pctOf(d.price),
    }));
  }, [ratioSeries]);

  const zExtent = useMemo(() => Math.max(3, Math.ceil(data.reduce((mx, d) => Math.max(mx, Math.abs(d.z)), 0))), [data]);
  const cur = data.length ? data[data.length - 1] : null;
  const opt = OPTIONS.find(o => o[0] === which);
  const [verdict, vcolor] = cur ? (metric === "z" ? verdictZ(cur.z) : verdictP(cur.pct)) : ["", "#94a3b8"];
  const { zoom, setZoom, selL, selR, onDown, onMove, onUp, zoomed } = useDragZoom(
    (a, b) => data.filter(d => d.ts >= a && d.ts <= b).length >= 2);
  const view = useMemo(() => (data.length ? timeWindow(data, zoom) : null), [data, zoom]);

  return (
    <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {OPTIONS.map(([id, lbl]) => (
          <button key={id} onClick={() => setWhich(id)} className={`neon-pill${which === id ? " active" : ""}`}
            style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 7, color: which === id ? "#f8fafc" : "#94a3b8", "--glow": "#6366f1" }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {[["z", "Z-score"], ["pct", "Percentile"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setMetric(id)} className={`neon-pill${metric === id ? " active" : ""}`}
            style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, padding: "6px 13px", borderRadius: 7, color: metric === id ? "#f8fafc" : "#94a3b8", "--glow": "#06b6d4" }}>{lbl}</button>
        ))}
      </div>

      {status === "loading" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#64748b", padding: 40 }}>Loading majors…</div>}
      {status !== "loading" && status !== "ok" && <div style={{ textAlign: "center", fontFamily: SANS, color: "#f87171", padding: 40 }}>{LIVE_DATA_DOWN}</div>}

      {status === "ok" && cur && (
        <>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, color: "#94a3b8", letterSpacing: 1.2 }}>
              SPX6900 {opt[1].toUpperCase()} · {metric === "z" ? "Z-SCORE" : "PERCENTILE"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: isMobile ? 34 : 46, fontWeight: 700, color: vcolor, textShadow: `0 0 22px ${vcolor}55` }}>
              {metric === "z" ? (cur.z >= 0 ? "+" : "") + cur.z.toFixed(2) + "σ" : Math.round(cur.pct) + "%"}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: vcolor }}>{verdict} {opt[1]}</div>
          </div>

          <ZoomBar zoomed={zoomed} onReset={() => setZoom(null)} accent="#6366f1" />

          <ResponsiveContainer width="100%" height={isMobile ? 380 : 520}>
            <ComposedChart data={view?.vis ?? data} margin={{ top: 10, right: isMobile ? 14 : 30, bottom: 24, left: isMobile ? 0 : 12 }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} style={{ cursor: "crosshair", userSelect: "none" }}>
              <CartesianGrid strokeDasharray="2 8" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="ts" type="number" scale="time" domain={view?.xDomain ?? ["dataMin", "dataMax"]} ticks={view?.xTicks} allowDataOverflow
                tickFormatter={view?.fmtX ?? fMon} tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} minTickGap={isMobile ? 40 : 30} />
              <YAxis domain={metric === "z" ? [-zExtent, zExtent] : [0, 100]}
                tickFormatter={v => (metric === "z" ? v + "σ" : v + "%")}
                tick={{ fill: "#cbd5e1", fontSize: isMobile ? 10 : 12, fontFamily: MONO }}
                axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} width={isMobile ? 38 : 48} />
              <Tooltip content={<OscTip metric={metric} />} />

              {metric === "z" ? (
                <>
                  <ReferenceArea y1={1} y2={zExtent} fill="#f87171" fillOpacity={0.09} />
                  <ReferenceArea y1={2} y2={zExtent} fill="#dc2626" fillOpacity={0.10} />
                  <ReferenceArea y1={-1} y2={-zExtent} fill="#4ade80" fillOpacity={0.09} />
                  <ReferenceArea y1={-2} y2={-zExtent} fill="#3b82f6" fillOpacity={0.10} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
                </>
              ) : (
                <>
                  <ReferenceArea y1={75} y2={100} fill="#f87171" fillOpacity={0.09} />
                  <ReferenceArea y1={90} y2={100} fill="#dc2626" fillOpacity={0.10} />
                  <ReferenceArea y1={0} y2={25} fill="#4ade80" fillOpacity={0.09} />
                  <ReferenceArea y1={0} y2={10} fill="#3b82f6" fillOpacity={0.10} />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
                </>
              )}

              <Line type="monotone" dataKey={metric} stroke="#ffffff" strokeWidth={2} dot={false} isAnimationActive={false} />
              {selL != null && selR != null && selL !== selR && (
                <ReferenceArea x1={selL} x2={selR} strokeOpacity={0.3} stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.15} />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#64748b", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
            How rich/cheap SPX6900 is {which === "BASKET" ? "vs an equal-weight BTC/ETH/SOL basket" : "vs " + which}, measured over its full history
            ({metric === "z" ? "standard deviations from the mean of log-ratio" : "percentile of the historical range"}).
            Relative value mean-reverts, so this is framed as a range — not a trend. Not financial advice.
          </div>
        </>
      )}
    </div>
  );
}
